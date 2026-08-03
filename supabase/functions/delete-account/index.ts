import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

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
      const updates: Array<PromiseLike<unknown>> = [
        admin.from("projects").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id),
        admin.from("projects").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id),
        admin.from("contacts").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id),
        admin.from("properties").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id),
        admin.from("property_photos").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id),
        admin.from("invoices").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id),
        admin.from("schedule_events").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id),
        admin.from("follow_ups").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id),
        admin.from("project_assignments").update({ assigned_by: ownerId }).eq("workspace_id", workspaceId).eq("assigned_by", user.id),
      ];
      await Promise.allSettled(updates);
    }

    const { data: resumeObjects } = await admin.storage.from("marketplace-resumes").list(user.id, { limit: 1000 });
    if (resumeObjects?.length) {
      await admin.storage.from("marketplace-resumes").remove(resumeObjects.map((item) => `${user.id}/${item.name}`));
    }

    const ownedIds = (ownedWorkspaces ?? []).map((workspace) => workspace.id);
    if (ownedIds.length) {
      const { error: workspaceDeleteError } = await admin.from("workspaces").delete().in("id", ownedIds);
      if (workspaceDeleteError) throw new Error(workspaceDeleteError.message);
    }

    await admin.from("workspace_memberships").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return json({ deleted: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The account could not be deleted." }, 400);
  }
});
