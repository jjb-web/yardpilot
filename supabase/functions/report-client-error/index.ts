import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Error reporting is not configured.");
    const body = await request.json().catch(() => ({}));
    const message = String(body.message ?? "Unexpected application error").slice(0, 1000);
    const stack = String(body.stack ?? "").slice(0, 12000);
    const route = String(body.route ?? "").slice(0, 500);
    const appVersion = String(body.appVersion ?? "").slice(0, 100);
    const browserSummary = String(body.browserSummary ?? "").slice(0, 1000);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const keyHash = await digest(`${request.headers.get("x-forwarded-for") ?? "unknown"}|${message}|${Deno.env.get("RATE_LIMIT_SALT") ?? serviceRoleKey.slice(-16)}`);
    const { data: allowed } = await admin.rpc("consume_public_rate_limit", {
      requested_key_hash: keyHash,
      requested_action: "client_error",
      requested_limit: 20,
      requested_window_minutes: 60,
    });
    if (!allowed) return json({ received: true });

    let userId: string | null = null;
    let workspaceId: string | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      const token = authorization.replace(/^Bearer\s+/i, "");
      const { data } = await admin.auth.getUser(token);
      userId = data.user?.id ?? null;
      if (userId) {
        const { data: membership } = await admin.from("workspace_memberships").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
        workspaceId = membership?.workspace_id ?? null;
      }
    }

    await admin.from("client_error_reports").insert({
      user_id: userId,
      workspace_id: workspaceId,
      message,
      stack,
      route,
      app_version: appVersion,
      browser_summary: browserSummary,
    });
    return json({ received: true });
  } catch {
    return json({ received: true });
  }
});
