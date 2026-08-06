import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

type PreparationResult = {
  ok?: boolean;
  code?: string;
  error?: string;
  workspaces?: Array<{ id?: string; name?: string; members?: number }>;
  deleted_workspace_count?: number;
};

type StorageObject = {
  bucket_id: string;
  object_name: string;
  preserve: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
      return json(
        {
          error:
            "Account deletion is not configured. A required Supabase function secret is missing.",
          code: "DELETE_FUNCTION_NOT_CONFIGURED",
          stage,
        },
        500,
      );
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization) {
      return json(
        {
          error: "Sign in before deleting your account.",
          code: "AUTHORIZATION_HEADER_MISSING",
          stage,
        },
        401,
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") {
      return json(
        {
          error: "Account deletion was not confirmed.",
          code: "DELETE_CONFIRMATION_MISSING",
          stage,
        },
        400,
      );
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
          stage,
        },
        401,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    stage = "preparing database records";
    const { data: preparationData, error: preparationError } = await admin.rpc(
      "yardpilot_prepare_account_deletion",
      { requested_user_id: user.id },
    );

    if (preparationError) {
      return json(
        {
          error: `Database cleanup could not start: ${preparationError.message}`,
          code: "DATABASE_PREPARATION_FAILED",
          stage,
          databaseCode: preparationError.code,
          databaseDetails: preparationError.details,
          databaseHint: preparationError.hint,
        },
        400,
      );
    }

    const preparation =
      (preparationData ?? {}) as PreparationResult;

    if (preparation.ok !== true) {
      return json(
        {
          error:
            preparation.error ??
            "The account is not currently eligible for deletion.",
          code: preparation.code ?? "ACCOUNT_DELETE_BLOCKED",
          stage,
          workspaces: preparation.workspaces ?? [],
        },
        409,
      );
    }

    stage = "listing account Storage objects";
    const { data: storageData, error: storageError } = await admin.rpc(
      "yardpilot_list_account_storage_objects",
      { requested_user_id: user.id },
    );

    if (storageError) {
      return json(
        {
          error: `Storage cleanup could not start: ${storageError.message}`,
          code: "STORAGE_LIST_FAILED",
          stage,
          databaseCode: storageError.code,
          databaseDetails: storageError.details,
          databaseHint: storageError.hint,
        },
        400,
      );
    }

    const storageObjects = (storageData ?? []) as StorageObject[];

    stage = "preserving shared Storage objects";
    for (const object of storageObjects.filter((item) => item.preserve)) {
      const bucket = admin.storage.from(object.bucket_id);
      const { data: file, error: downloadError } = await bucket.download(
        object.object_name,
      );

      if (downloadError || !file) {
        return json(
          {
            error: `Could not preserve ${object.bucket_id}/${object.object_name}: ${
              downloadError?.message ?? "download failed"
            }`,
            code: "SHARED_STORAGE_DOWNLOAD_FAILED",
            stage,
          },
          400,
        );
      }

      const { error: removeError } = await bucket.remove([
        object.object_name,
      ]);
      if (removeError) {
        return json(
          {
            error: `Could not replace ownership for ${object.bucket_id}/${object.object_name}: ${removeError.message}`,
            code: "SHARED_STORAGE_REMOVE_FAILED",
            stage,
          },
          400,
        );
      }

      const uploadOptions: { upsert: boolean; contentType?: string } = {
        upsert: false,
      };
      if (file.type) uploadOptions.contentType = file.type;

      const { error: uploadError } = await bucket.upload(
        object.object_name,
        file,
        uploadOptions,
      );

      if (uploadError) {
        return json(
          {
            error: `Could not restore shared file ${object.bucket_id}/${object.object_name}: ${uploadError.message}`,
            code: "SHARED_STORAGE_REUPLOAD_FAILED",
            stage,
          },
          400,
        );
      }
    }

    stage = "deleting personal Storage objects";
    const deletionsByBucket = new Map<string, string[]>();

    for (const object of storageObjects.filter((item) => !item.preserve)) {
      const paths = deletionsByBucket.get(object.bucket_id) ?? [];
      paths.push(object.object_name);
      deletionsByBucket.set(object.bucket_id, paths);
    }

    for (const [bucketId, paths] of deletionsByBucket.entries()) {
      for (let index = 0; index < paths.length; index += 100) {
        const { error: removeError } = await admin.storage
          .from(bucketId)
          .remove(paths.slice(index, index + 100));

        if (removeError) {
          return json(
            {
              error: `Could not delete files from ${bucketId}: ${removeError.message}`,
              code: "PERSONAL_STORAGE_DELETE_FAILED",
              stage,
            },
            400,
          );
        }
      }
    }

    stage = "verifying Storage cleanup";
    const { data: remainingStorage, error: verificationError } =
      await admin.rpc("yardpilot_list_account_storage_objects", {
        requested_user_id: user.id,
      });

    if (verificationError) {
      return json(
        {
          error: `Storage cleanup could not be verified: ${verificationError.message}`,
          code: "STORAGE_VERIFICATION_FAILED",
          stage,
        },
        400,
      );
    }

    const remaining = (remainingStorage ?? []) as StorageObject[];
    if (remaining.length > 0) {
      return json(
        {
          error:
            "Supabase still reports Storage objects owned by this account. The Auth user was not deleted.",
          code: "STORAGE_CLEANUP_INCOMPLETE",
          stage,
          remainingStorageObjects: remaining.slice(0, 20),
        },
        409,
      );
    }

    stage = "deleting Supabase Auth user";
    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(user.id, false);

    if (deleteUserError) {
      return json(
        {
          error: `Supabase Auth could not delete the account: ${deleteUserError.message}`,
          code: "AUTH_DELETE_FAILED",
          stage,
        },
        409,
      );
    }

    return json({
      deleted: true,
      message:
        "The Supabase Auth user, personal Storage, and account-scoped YardPilot data were permanently deleted.",
      deletedWorkspaceCount:
        preparation.deleted_workspace_count ?? 0,
    });
  } catch (error) {
    console.error("delete-account v3 failed", { stage, error });

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The account could not be deleted.",
        code: "ACCOUNT_DELETE_UNEXPECTED_FAILURE",
        stage,
      },
      500,
    );
  }
});
