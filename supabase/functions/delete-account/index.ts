import { createClient, type PostgrestError } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

type TransferResult = { label: string; error: PostgrestError | null };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Account deletion is not configured.");

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization) return json({ error: "Sign in before deleting your account." }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") return json({ error: "Account deletion was not confirmed." }, 400);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData.user;
    if (userError || !user) return json({ error: "Your session is invalid." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ownedWorkspaces, error: ownedError } = await admin
      .from("workspaces")
      .select("id, name, kind")
      .eq("created_by", user.id);
    if (ownedError) throw new Error(ownedError.message);

    const blocked: Array<{ id: string; name: string; members: number }> = [];
    for (const workspace of ownedWorkspaces ?? []) {
      if (workspace.kind === "personal") continue;
      const { count, error: memberError } = await admin
        .from("workspace_memberships")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .neq("user_id", user.id);
      if (memberError) throw new Error(memberError.message);
      if ((count ?? 0) > 0) blocked.push({ id: workspace.id, name: workspace.name, members: count ?? 0 });
    }

    if (blocked.length) {
      return json({
        error: "Transfer ownership or remove the other members from the listed company/workgroup before deleting your account.",
        code: "OWNERSHIP_TRANSFER_REQUIRED",
        workspaces: blocked,
      }, 409);
    }

    const { data: memberships, error: membershipError } = await admin
      .from("workspace_memberships")
      .select("workspace_id, workspaces!inner(created_by)")
      .eq("user_id", user.id);
    if (membershipError) throw new Error(membershipError.message);

    for (const membership of memberships ?? []) {
      const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
      const ownerId = workspace?.created_by as string | undefined;
      if (!ownerId || ownerId === user.id) continue;
      const workspaceId = membership.workspace_id;

      const operationSpecs: Array<{
        label: string;
        operation: PromiseLike<{ error: PostgrestError | null }>;
      }> = [
        { label: "projects.created_by", operation: admin.from("projects").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id) },
        { label: "projects.user_id", operation: admin.from("projects").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id) },
        { label: "contacts.user_id", operation: admin.from("contacts").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id) },
        { label: "properties.user_id", operation: admin.from("properties").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id) },
        { label: "property_photos.user_id", operation: admin.from("property_photos").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id) },
        { label: "invoices.created_by", operation: admin.from("invoices").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id) },
        { label: "schedule_events.created_by", operation: admin.from("schedule_events").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id) },
        { label: "follow_ups.created_by", operation: admin.from("follow_ups").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id) },
        { label: "project_assignments.assigned_by", operation: admin.from("project_assignments").update({ assigned_by: ownerId }).eq("workspace_id", workspaceId).eq("assigned_by", user.id) },
      ];

      const transferResults: TransferResult[] = await Promise.all(
        operationSpecs.map(async ({ label, operation }) => {
          const { error } = await operation;
          return { label, error };
        }),
      );
      const failures = transferResults.filter((result) => result.error);
      if (failures.length) {
        return json({
          error: "Account deletion stopped because shared workspace records could not be transferred safely.",
          code: "TRANSFER_FAILED",
          failures: failures.map((failure) => ({ label: failure.label, message: failure.error?.message })),
        }, 409);
      }
    }

    const { data: resumeObjects, error: resumeListError } = await admin.storage
      .from("marketplace-resumes")
      .list(user.id, { limit: 1000 });
    if (resumeListError && !/not found/i.test(resumeListError.message)) throw new Error(resumeListError.message);
    if (resumeObjects?.length) {
      const { error: resumeDeleteError } = await admin.storage
        .from("marketplace-resumes")
        .remove(resumeObjects.map((item) => `${user.id}/${item.name}`));
      if (resumeDeleteError) throw new Error(resumeDeleteError.message);
    }

    const ownedIds = (ownedWorkspaces ?? []).map((workspace) => workspace.id);
    if (ownedIds.length) {
      const { error: workspaceDeleteError } = await admin.from("workspaces").delete().in("id", ownedIds);
      if (workspaceDeleteError) throw new Error(workspaceDeleteError.message);
    }

    const { error: membershipDeleteError } = await admin.from("workspace_memberships").delete().eq("user_id", user.id);
    if (membershipDeleteError) throw new Error(membershipDeleteError.message);

    const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", user.id);
    if (profileDeleteError) throw new Error(profileDeleteError.message);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return json({ deleted: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The account could not be deleted." }, 400);
  }
});
