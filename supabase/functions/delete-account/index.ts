import { createClient, type PostgrestError } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: cors });

type WorkspaceRow = {
  id: string;
  name: string;
  created_by: string;
  is_personal?: boolean | null;
  kind?: string | null;
};

type PropertyPhotoRow = {
  id: string;
  workspace_id: string;
  storage_path: string;
};

type OwnedStorageObject = {
  bucket_id: string;
  object_name: string;
};

function isMissingObject(error: PostgrestError | null) {
  if (!error) return false;
  return (
    ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(
      error.code,
    ) ||
    /relation .* does not exist|column .* does not exist|could not find the table|could not find.*column|function .* does not exist/i.test(
      error.message,
    )
  );
}

async function requireQuery(
  label: string,
  operation: PromiseLike<{ error: PostgrestError | null }>,
  options: { ignoreMissing?: boolean } = {},
) {
  const { error } = await operation;
  if (!error) return;
  if (options.ignoreMissing && isMissingObject(error)) return;
  throw new Error(`${label}: ${error.message}`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let stage = "starting";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error(
        "Account deletion is not configured. A required Supabase function environment variable is missing.",
      );
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization) {
      return json({ error: "Sign in before deleting your account." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") {
      return json({ error: "Account deletion was not confirmed." }, 400);
    }

    stage = "validating session";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      return json(
        {
          error: "Your session is invalid or expired. Sign in again and retry.",
          code: "INVALID_SESSION",
        },
        401,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    stage = "checking owned workspaces";
    const { data: ownedData, error: ownedError } = await admin
      .from("workspaces")
      .select("id,name,created_by,is_personal,kind")
      .eq("created_by", user.id);

    if (ownedError) {
      throw new Error(
        `Could not inspect owned workspaces: ${ownedError.message}`,
      );
    }

    const ownedWorkspaces = (ownedData ?? []) as WorkspaceRow[];
    const blocked: Array<{ id: string; name: string; members: number }> = [];

    for (const workspace of ownedWorkspaces) {
      const personal =
        workspace.is_personal === true || workspace.kind === "personal";
      if (personal) continue;

      const { count, error } = await admin
        .from("workspace_memberships")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .neq("user_id", user.id);

      if (error) {
        throw new Error(
          `Could not inspect ${workspace.name}: ${error.message}`,
        );
      }

      if ((count ?? 0) > 0) {
        blocked.push({
          id: workspace.id,
          name: workspace.name,
          members: count ?? 0,
        });
      }
    }

    if (blocked.length > 0) {
      return json(
        {
          error:
            "This account still owns a company or workgroup with other members. Transfer ownership or remove those members before deleting the account.",
          code: "OWNERSHIP_TRANSFER_REQUIRED",
          workspaces: blocked,
        },
        409,
      );
    }

    const ownerCache = new Map<string, string | null>();

    const getWorkspaceOwner = async (workspaceId: string) => {
      if (ownerCache.has(workspaceId)) {
        return ownerCache.get(workspaceId) ?? null;
      }

      const { data, error } = await admin
        .from("workspaces")
        .select("created_by")
        .eq("id", workspaceId)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Could not resolve workspace ownership: ${error.message}`,
        );
      }

      const ownerId =
        typeof data?.created_by === "string" ? data.created_by : null;
      ownerCache.set(workspaceId, ownerId);
      return ownerId;
    };

    async function transferWorkspaceColumn(table: string, column: string) {
      const { data, error } = await admin
        .from(table)
        .select("workspace_id")
        .eq(column, user.id);

      if (error) {
        if (isMissingObject(error)) return;
        throw new Error(
          `Could not inspect ${table}.${column}: ${error.message}`,
        );
      }

      const workspaceIds = [
        ...new Set(
          (data ?? [])
            .map((row) =>
              typeof row.workspace_id === "string" ? row.workspace_id : ""
            )
            .filter(Boolean),
        ),
      ];

      for (const workspaceId of workspaceIds) {
        const ownerId = await getWorkspaceOwner(workspaceId);
        if (!ownerId || ownerId === user.id) continue;

        await requireQuery(
          `Could not transfer ${table}.${column}`,
          admin
            .from(table)
            .update({ [column]: ownerId })
            .eq("workspace_id", workspaceId)
            .eq(column, user.id),
          { ignoreMissing: true },
        );
      }
    }

    stage = "transferring shared records";
    const transferColumns: Array<[string, string]> = [
      ["projects", "created_by"],
      ["projects", "user_id"],
      ["contacts", "user_id"],
      ["properties", "user_id"],
      ["invoices", "created_by"],
      ["schedule_events", "created_by"],
      ["follow_ups", "created_by"],
      ["project_assignments", "assigned_by"],
      ["job_requests", "requested_by"],
      ["workspace_invites", "invited_by"],
      ["marketplace_business_profiles", "created_by"],
      ["marketplace_job_openings", "created_by"],
      ["client_job_bids", "submitted_by"],
      ["employee_payment_records", "created_by"],
      ["employee_payment_records", "paid_by"],
      ["access_code_redemptions", "redeemed_by"],
    ];

    for (const [table, column] of transferColumns) {
      await transferWorkspaceColumn(table, column);
    }

    stage = "preserving shared property photos";
    const { data: photoData, error: photoError } = await admin
      .from("property_photos")
      .select("id,workspace_id,storage_path")
      .eq("user_id", user.id);

    if (photoError && !isMissingObject(photoError)) {
      throw new Error(
        `Could not inspect property photos: ${photoError.message}`,
      );
    }

    for (const photo of (photoData ?? []) as PropertyPhotoRow[]) {
      const ownerId = await getWorkspaceOwner(photo.workspace_id);
      if (!ownerId || ownerId === user.id) continue;

      const fileName =
        photo.storage_path.split("/").filter(Boolean).pop() ??
        `${photo.id}.bin`;
      const targetPath =
        `${ownerId}/transferred-${photo.id}-${fileName}`;

      const { data: downloaded, error: downloadError } =
        await admin.storage
          .from("property-photos")
          .download(photo.storage_path);

      if (downloadError || !downloaded) {
        throw new Error(
          `Could not download a shared property photo before account deletion: ${
            downloadError?.message ?? "Unknown download error"
          }`,
        );
      }

      const uploadOptions: {
        upsert: boolean;
        contentType?: string;
      } = { upsert: true };

      if (downloaded.type) {
        uploadOptions.contentType = downloaded.type;
      }

      const { error: uploadError } = await admin.storage
        .from("property-photos")
        .upload(targetPath, downloaded, uploadOptions);

      if (uploadError) {
        throw new Error(
          `Could not preserve a shared property photo before account deletion: ${uploadError.message}`,
        );
      }

      await requireQuery(
        "Could not transfer shared property photo metadata",
        admin
          .from("property_photos")
          .update({
            user_id: ownerId,
            storage_path: targetPath,
          })
          .eq("id", photo.id),
      );

      const { error: removeOriginalError } = await admin.storage
        .from("property-photos")
        .remove([photo.storage_path]);

      if (removeOriginalError) {
        throw new Error(
          `Could not remove the original shared property photo: ${removeOriginalError.message}`,
        );
      }
    }

    stage = "removing account-scoped records";
    await requireQuery(
      "Could not remove support messages",
      admin.from("support_messages").delete().eq("user_id", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not remove client error reports",
      admin.from("client_error_reports").delete().eq("user_id", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not anonymize audit records",
      admin
        .from("audit_log")
        .update({ actor_user_id: null })
        .eq("actor_user_id", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not anonymize access-code creator records",
      admin
        .from("access_codes")
        .update({ created_by: null })
        .eq("created_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear project submission attribution",
      admin
        .from("projects")
        .update({ submitted_for_approval_by: null })
        .eq("submitted_for_approval_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear project approval attribution",
      admin
        .from("projects")
        .update({ approved_by: null })
        .eq("approved_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear cancellation attribution",
      admin
        .from("marketplace_work_orders")
        .update({ cancellation_requested_by: null })
        .eq("cancellation_requested_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear cancellation attribution",
      admin
        .from("marketplace_work_orders")
        .update({ cancellation_responded_by: null })
        .eq("cancellation_responded_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear review moderation attribution",
      admin
        .from("marketplace_reviews")
        .update({ moderated_by: null })
        .eq("moderated_by", user.id),
      { ignoreMissing: true },
    );

    stage = "listing owned Storage objects";
    const { data: storageData, error: storageListError } = await admin.rpc(
      "yardpilot_list_owned_storage_objects",
      { requested_user_id: user.id },
    );

    if (storageListError) {
      if (isMissingObject(storageListError)) {
        return json(
          {
            error:
              "The account-deletion Storage helper is not installed. Run yardpilot-account-deletion-storage-helper-v1.sql, then retry.",
            code: "STORAGE_HELPER_MISSING",
          },
          409,
        );
      }
      throw new Error(
        `Could not inspect Storage ownership: ${storageListError.message}`,
      );
    }

    const ownedObjects = (storageData ?? []) as OwnedStorageObject[];
    const byBucket = new Map<string, string[]>();

    for (const object of ownedObjects) {
      const paths = byBucket.get(object.bucket_id) ?? [];
      paths.push(object.object_name);
      byBucket.set(object.bucket_id, paths);
    }

    stage = "deleting owned Storage objects";
    for (const [bucket, paths] of byBucket.entries()) {
      for (let index = 0; index < paths.length; index += 1000) {
        const { error } = await admin.storage
          .from(bucket)
          .remove(paths.slice(index, index + 1000));

        if (error) {
          throw new Error(
            `Could not delete files from ${bucket}: ${error.message}`,
          );
        }
      }
    }

    const { data: remainingStorage, error: remainingStorageError } =
      await admin.rpc("yardpilot_list_owned_storage_objects", {
        requested_user_id: user.id,
      });

    if (remainingStorageError) {
      throw new Error(
        `Could not verify Storage cleanup: ${remainingStorageError.message}`,
      );
    }

    const remaining = (remainingStorage ?? []) as OwnedStorageObject[];
    if (remaining.length > 0) {
      return json(
        {
          error:
            "Supabase Storage still reports files owned by this account. The Auth user was not deleted.",
          code: "STORAGE_CLEANUP_INCOMPLETE",
          remainingStorageObjects: remaining.slice(0, 20),
        },
        409,
      );
    }

    stage = "deleting Supabase Auth user";
    const { error: deleteError } =
      await admin.auth.admin.deleteUser(user.id, false);

    if (deleteError) {
      return json(
        {
          error:
            `Supabase could not finish account deletion: ${deleteError.message}`,
          code: "AUTH_DELETE_FAILED",
          stage,
        },
        409,
      );
    }

    return json({
      deleted: true,
      message:
        "The Supabase Auth user, owned Storage objects, and account-scoped YardPilot data were permanently deleted.",
    });
  } catch (error) {
    console.error("delete-account failed", { stage, error });

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The account could not be deleted.",
        code: "ACCOUNT_DELETE_FAILED",
        stage,
      },
      400,
    );
  }
});
