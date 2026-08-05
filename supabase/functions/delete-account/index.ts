import { createClient, type PostgrestError } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: cors });

type WorkspaceRow = {
  id: string;
  name: string;
  created_by: string;
  is_personal?: boolean | null;
};

type PropertyPhotoRow = {
  id: string;
  workspace_id: string;
  storage_path: string;
};

type StorageEntry = {
  id?: string | null;
  name: string;
  metadata?: unknown;
};

function isMissingObject(error: PostgrestError | null) {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code) ||
    /relation .* does not exist|column .* does not exist|could not find the table|could not find.*column/i.test(error.message);
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
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Account deletion is not configured in Supabase.");
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization) return json({ error: "Sign in before deleting your account." }, 401);

    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") {
      return json({ error: "Account deletion was not confirmed." }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData.user;
    if (userError || !user) return json({ error: "Your session is invalid or expired." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ownedData, error: ownedError } = await admin
      .from("workspaces")
      .select("id,name,created_by,is_personal")
      .eq("created_by", user.id);
    if (ownedError) throw new Error(`Could not inspect owned workspaces: ${ownedError.message}`);
    const ownedWorkspaces = (ownedData ?? []) as WorkspaceRow[];

    const blocked: Array<{ id: string; name: string; members: number }> = [];
    for (const workspace of ownedWorkspaces) {
      if (workspace.is_personal) continue;
      const { count, error } = await admin
        .from("workspace_memberships")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .neq("user_id", user.id);
      if (error) throw new Error(`Could not inspect ${workspace.name}: ${error.message}`);
      if ((count ?? 0) > 0) {
        blocked.push({ id: workspace.id, name: workspace.name, members: count ?? 0 });
      }
    }

    if (blocked.length > 0) {
      return json({
        error: "Transfer ownership or remove the other members from each owned company/workgroup before deleting your account.",
        code: "OWNERSHIP_TRANSFER_REQUIRED",
        workspaces: blocked,
      }, 409);
    }

    const ownerCache = new Map<string, string | null>();
    const getWorkspaceOwner = async (workspaceId: string) => {
      if (ownerCache.has(workspaceId)) return ownerCache.get(workspaceId) ?? null;
      const { data, error } = await admin
        .from("workspaces")
        .select("created_by")
        .eq("id", workspaceId)
        .maybeSingle();
      if (error) throw new Error(`Could not resolve workspace ownership: ${error.message}`);
      const ownerId = typeof data?.created_by === "string" ? data.created_by : null;
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
        throw new Error(`Could not inspect ${table}.${column}: ${error.message}`);
      }

      const workspaceIds = [...new Set(
        (data ?? [])
          .map((row) => typeof row.workspace_id === "string" ? row.workspace_id : "")
          .filter(Boolean),
      )];

      for (const workspaceId of workspaceIds) {
        const ownerId = await getWorkspaceOwner(workspaceId);
        if (!ownerId || ownerId === user.id) continue;
        await requireQuery(
          `Could not transfer ${table}.${column}`,
          admin.from(table).update({ [column]: ownerId }).eq("workspace_id", workspaceId).eq(column, user.id),
          { ignoreMissing: true },
        );
      }
    }

    // Property photos uploaded by this user for a shared company are company
    // records. Move the object path to the workspace owner's folder before the
    // user's remaining storage folder is erased.
    const { data: photoData, error: photoError } = await admin
      .from("property_photos")
      .select("id,workspace_id,storage_path")
      .eq("user_id", user.id);
    if (photoError && !isMissingObject(photoError)) {
      throw new Error(`Could not inspect property photos: ${photoError.message}`);
    }

    for (const photo of (photoData ?? []) as PropertyPhotoRow[]) {
      const ownerId = await getWorkspaceOwner(photo.workspace_id);
      if (!ownerId || ownerId === user.id) continue;
      const suffix = photo.storage_path.includes("/")
        ? photo.storage_path.slice(photo.storage_path.indexOf("/") + 1)
        : photo.storage_path;
      const targetPath = `${ownerId}/${suffix}`;
      if (targetPath !== photo.storage_path) {
        const { error: moveError } = await admin.storage
          .from("property-photos")
          .move(photo.storage_path, targetPath);
        if (moveError) {
          throw new Error(`Could not preserve a shared property photo before deletion: ${moveError.message}`);
        }
      }
      await requireQuery(
        "Could not transfer shared property photo metadata",
        admin.from("property_photos").update({ user_id: ownerId, storage_path: targetPath }).eq("id", photo.id),
      );
    }

    // Preserve shared company records by moving creator/owner attribution to the
    // workspace owner. Sole-owned workspaces are removed by the auth-user
    // cascade later.
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

    // Remove or anonymize account-scoped records that intentionally use SET NULL
    // rather than CASCADE. This prevents support/error text from remaining tied
    // to the deleted account while preserving shared audit history.
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
      admin.from("audit_log").update({ actor_user_id: null }).eq("actor_user_id", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not anonymize access-code creator records",
      admin.from("access_codes").update({ created_by: null }).eq("created_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear project approval attribution",
      admin.from("projects").update({ submitted_for_approval_by: null }).eq("submitted_for_approval_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear project approval attribution",
      admin.from("projects").update({ approved_by: null }).eq("approved_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear cancellation attribution",
      admin.from("marketplace_work_orders").update({ cancellation_requested_by: null }).eq("cancellation_requested_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear cancellation attribution",
      admin.from("marketplace_work_orders").update({ cancellation_responded_by: null }).eq("cancellation_responded_by", user.id),
      { ignoreMissing: true },
    );
    await requireQuery(
      "Could not clear review moderation attribution",
      admin.from("marketplace_reviews").update({ moderated_by: null }).eq("moderated_by", user.id),
      { ignoreMissing: true },
    );

    async function collectStorageFiles(bucket: string, folder: string): Promise<string[]> {
      const files: string[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
        if (error) {
          if (/bucket not found|not found/i.test(error.message)) return [];
          throw new Error(`Could not list ${bucket} files: ${error.message}`);
        }
        const entries = (data ?? []) as StorageEntry[];
        for (const entry of entries) {
          const path = folder ? `${folder}/${entry.name}` : entry.name;
          if (entry.id || entry.metadata) {
            files.push(path);
          } else {
            files.push(...await collectStorageFiles(bucket, path));
          }
        }
        if (entries.length < 1000) break;
        offset += entries.length;
      }
      return files;
    }

    async function deleteStorageFolder(bucket: string, folder: string) {
      const files = await collectStorageFiles(bucket, folder);
      for (let index = 0; index < files.length; index += 100) {
        const { error } = await admin.storage.from(bucket).remove(files.slice(index, index + 100));
        if (error) throw new Error(`Could not delete ${bucket} files: ${error.message}`);
      }
    }

    await deleteStorageFolder("marketplace-resumes", user.id);
    await deleteStorageFolder("property-photos", user.id);

    // Hard-delete the auth user last. PostgreSQL performs the remaining CASCADE
    // and SET NULL actions atomically, including the profile, memberships,
    // notifications, feedback, client requests, personal/sole-owned workspaces,
    // and their workspace-owned records.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) {
      return json({
        error: `Supabase could not finish account deletion: ${deleteError.message}`,
        code: "AUTH_DELETE_FAILED",
      }, 409);
    }

    return json({
      deleted: true,
      message: "The Supabase Auth user and account-scoped YardPilot data were permanently deleted.",
    });
  } catch (error) {
    console.error("delete-account failed", error);
    return json({
      error: error instanceof Error ? error.message : "The account could not be deleted.",
    }, 400);
  }
});
