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
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Support submission is not configured.");

    const body = await request.json().catch(() => ({}));
    if (String(body.website ?? "").trim()) return json({ received: true });
    const email = String(body.email ?? "").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    const source = String(body.source ?? "contact_page").trim().slice(0, 80);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (subject.length < 3 || subject.length > 160) return json({ error: "Enter a subject between 3 and 160 characters." }, 400);
    if (message.length < 10 || message.length > 5000) return json({ error: "Enter a message between 10 and 5,000 characters." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const rawKey = `${request.headers.get("x-forwarded-for") ?? "unknown"}|${request.headers.get("user-agent") ?? ""}|${Deno.env.get("RATE_LIMIT_SALT") ?? serviceRoleKey.slice(-16)}`;
    const keyHash = await digest(rawKey);
    const { data: allowed, error: limitError } = await admin.rpc("consume_public_rate_limit", {
      requested_key_hash: keyHash,
      requested_action: "support_message",
      requested_limit: 5,
      requested_window_minutes: 60,
    });
    if (limitError) throw new Error(limitError.message);
    if (!allowed) return json({ error: "Too many messages were submitted. Try again later." }, 429);

    let userId: string | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      const token = authorization.replace(/^Bearer\s+/i, "");
      const { data } = await admin.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const { error } = await admin.from("support_messages").insert({
      user_id: userId,
      email,
      subject,
      message,
      source,
    });
    if (error) throw new Error(error.message);
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The message could not be submitted." }, 400);
  }
});
