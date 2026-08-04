import { createClient } from "@supabase/supabase-js";

function allowedOrigins() {
  return (Deno.env.get("YARDPILOT_ALLOWED_ORIGINS") ?? "https://yardpilotusa.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const responseOrigin = allowed.includes(origin) ? origin : allowed[0] ?? "https://yardpilotusa.com";
  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (request: Request, body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders(request) });

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail(payload: {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { configured: false, delivered: false, error: "RESEND_API_KEY is not configured." };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      reply_to: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    return {
      configured: true,
      delivered: false,
      error: (await response.text()).slice(0, 1000),
    };
  }

  return { configured: true, delivered: true, error: "" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Support submission is not configured.");

    const body = await request.json().catch(() => ({}));
    if (String(body.website ?? "").trim()) return json(request, { received: true });

    const email = String(body.email ?? "").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    const source = String(body.source ?? "contact_page").trim().slice(0, 80);

    if (!/^\S+@\S+\.\S+$/.test(email)) return json(request, { error: "Enter a valid email address." }, 400);
    if (subject.length < 3 || subject.length > 160) return json(request, { error: "Enter a subject between 3 and 160 characters." }, 400);
    if (message.length < 10 || message.length > 5000) return json(request, { error: "Enter a message between 10 and 5,000 characters." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawKey = `${request.headers.get("x-forwarded-for") ?? "unknown"}|${request.headers.get("user-agent") ?? ""}|${Deno.env.get("RATE_LIMIT_SALT") ?? serviceRoleKey.slice(-16)}`;
    const keyHash = await digest(rawKey);
    const { data: allowed, error: limitError } = await admin.rpc("consume_public_rate_limit", {
      requested_key_hash: keyHash,
      requested_action: "support_message",
      requested_limit: 5,
      requested_window_minutes: 60,
    });
    if (limitError) throw new Error(limitError.message);
    if (!allowed) return json(request, { error: "Too many messages were submitted. Try again later." }, 429);

    let userId: string | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      const token = authorization.replace(/^Bearer\s+/i, "");
      const { data } = await admin.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const { data: inserted, error: insertError } = await admin
      .from("support_messages")
      .insert({ user_id: userId, email, subject, message, source, delivery_status: "pending" })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const supportEmail = Deno.env.get("YARDPILOT_SUPPORT_EMAIL") ?? "support@yardpilotusa.com";
    const from = Deno.env.get("YARDPILOT_EMAIL_FROM") ?? "YardPilot <no-reply@yardpilotusa.com>";
    const delivery = await sendEmail({
      from,
      to: [supportEmail],
      replyTo: email,
      subject: `[YardPilot Support] ${subject}`,
      html: `<h2>New YardPilot support message</h2><p><strong>From:</strong> ${escapeHtml(email)}</p><p><strong>Source:</strong> ${escapeHtml(source)}</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    });

    await admin
      .from("support_messages")
      .update({
        delivery_status: delivery.delivered ? "delivered" : delivery.configured ? "failed" : "not_configured",
        delivery_error: delivery.error,
        delivered_at: delivery.delivered ? new Date().toISOString() : null,
      })
      .eq("id", inserted.id);

    return json(request, {
      received: true,
      emailDelivery: delivery.delivered ? "delivered" : delivery.configured ? "failed" : "not_configured",
    });
  } catch (error) {
    return json(
      request,
      { error: error instanceof Error ? error.message : "The message could not be submitted." },
      400,
    );
  }
});
