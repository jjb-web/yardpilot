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
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Signup is not configured.");
    const body = await request.json().catch(() => ({}));
    if (String(body.website ?? "").trim()) return json({ subscribed: true });
    const email = String(body.email ?? "").trim().toLowerCase();
    const source = String(body.source ?? "landing_page").trim().slice(0, 80);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const keyHash = await digest(`${request.headers.get("x-forwarded-for") ?? "unknown"}|${Deno.env.get("RATE_LIMIT_SALT") ?? serviceRoleKey.slice(-16)}`);
    const { data: allowed, error: limitError } = await admin.rpc("consume_public_rate_limit", {
      requested_key_hash: keyHash,
      requested_action: "interest_signup",
      requested_limit: 10,
      requested_window_minutes: 60,
    });
    if (limitError) throw new Error(limitError.message);
    if (!allowed) return json({ error: "Too many requests. Try again later." }, 429);

    const { data: existing, error: existingError } = await admin
      .from("interest_signups")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) {
      const { error } = await admin.from("interest_signups").insert({ email, source });
      if (error) throw new Error(error.message);
    }
    return json({ subscribed: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Signup failed." }, 400);
  }
});
