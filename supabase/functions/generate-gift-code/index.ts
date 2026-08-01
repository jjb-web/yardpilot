import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

function createCode() {
  return `YP30-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = (Deno.env.get("YARDPILOT_APP_URL") || "https://yardpilotusa.com")
      .replace(/\/$/, "");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "The gift-code service is not configured." }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "You must be signed in." }, 401);
    }

    const { data: platformAdmin, error: adminError } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      return json({ error: adminError.message }, 500);
    }
    if (!platformAdmin) {
      return json({ error: "Only a YardPilot platform administrator can generate gift codes." }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as {
      label?: string;
      accessDays?: number;
      redeemWithinDays?: number;
    };

    const accessDays = Math.min(Math.max(Math.floor(Number(body.accessDays || 30)), 1), 3650);
    const redeemWithinDays = Math.min(
      Math.max(Math.floor(Number(body.redeemWithinDays || 30)), 1),
      3650,
    );
    const label = String(body.label || "Individual client gift")
      .trim()
      .slice(0, 120);

    const { error: labelSafetyError } = await adminClient.rpc(
      "marketplace_assert_safe_text",
      {
        value_to_check: label,
        field_label: "Gift-code label",
      },
    );

    if (labelSafetyError) {
      return json({ error: labelSafetyError.message }, 400);
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + redeemWithinDays);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createCode();
      const codeHash = await sha256(code);
      const codeHint = `${code.slice(0, 7)}…${code.slice(-4)}`;

      const { data, error } = await adminClient
        .from("access_codes")
        .insert({
          code_hash: codeHash,
          code_hint: codeHint,
          campaign: `Unique gift · ${label || "Individual client"}`,
          plan_key: "pro",
          duration_days: accessDays,
          max_redemptions: 1,
          redemption_count: 0,
          expires_at: expiresAt.toISOString(),
          active: true,
          created_by: user.id,
        })
        .select("id, code_hint, expires_at, duration_days")
        .single();

      if (!error && data) {
        return json({
          id: data.id,
          code,
          codeHint: data.code_hint,
          accessDays: data.duration_days,
          expiresAt: data.expires_at,
          redeemUrl: `${appUrl}/redeem/${encodeURIComponent(code)}`,
          warning: "This is the only response containing the complete code. Copy it now.",
        });
      }

      if (error?.code !== "23505") {
        return json({ error: error?.message || "Could not create the gift code." }, 400);
      }
    }

    return json({ error: "Could not generate a unique code after several attempts." }, 500);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not generate the gift code." },
      500,
    );
  }
});
