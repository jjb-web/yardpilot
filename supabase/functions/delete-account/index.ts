import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Account deletion is not configured.");
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) {
      return Response.json({ error: "Sign in before deleting your account." }, { status: 401, headers: corsHeaders });
    }

    const body = await request.json().catch(() => ({}));
    if (body.confirmation !== "DELETE") {
      return Response.json({ error: "Account deletion was not confirmed." }, { status: 400, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Your session is invalid." }, { status: 401, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: memberships } = await admin
      .from("workspace_memberships")
      .select("workspace_id, role, workspaces!inner(created_by)")
      .eq("user_id", user.id);

    for (const membership of memberships ?? []) {
      const workspace = Array.isArray(membership.workspaces)
        ? membership.workspaces[0]
        : membership.workspaces;
      const ownerId = workspace?.created_by as string | undefined;
      if (!ownerId || ownerId === user.id) continue;
      const workspaceId = membership.workspace_id;

      await admin.from("projects").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id);
      await admin.from("projects").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id);
      await admin.from("contacts").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id);
      await admin.from("properties").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id);
      await admin.from("property_photos").update({ user_id: ownerId }).eq("workspace_id", workspaceId).eq("user_id", user.id);
      await admin.from("invoices").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id);
      await admin.from("schedule_events").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id);
      await admin.from("follow_ups").update({ created_by: ownerId }).eq("workspace_id", workspaceId).eq("created_by", user.id);
      await admin.from("project_assignments").update({ assigned_by: ownerId }).eq("workspace_id", workspaceId).eq("assigned_by", user.id);
    }

    await admin.from("workspaces").delete().eq("created_by", user.id);
    await admin.from("workspace_memberships").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return Response.json(
      { deleted: true },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The account could not be deleted." },
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
