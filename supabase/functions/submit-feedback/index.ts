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
  const responseOrigin = allowed.includes(origin)
    ? origin
    : allowed[0] ?? "https://yardpilotusa.com";

  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (request: Request, body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders(request) });

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
  if (!apiKey) {
    return {
      configured: false,
      delivered: false,
      error: "RESEND_API_KEY is not configured.",
    };
  }

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

const allowedCategories = new Set(["feedback", "review", "bug", "feature"]);
const allowedAccountTypes = new Set(["landscaper", "client"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Feedback submission is not configured.");
    }

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(request, { error: "You must be signed in." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return json(request, { error: "Your session is invalid or expired." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const category = String(body.category ?? "feedback").trim().toLowerCase();
    const accountType = String(body.accountType ?? "landscaper").trim().toLowerCase();
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const route = String(body.route ?? "").trim().slice(0, 500);
    const appVersion = String(body.appVersion ?? "").trim().slice(0, 100);
    const browserSummary = String(body.browserSummary ?? "").trim().slice(0, 700);
    const workspaceId = body.workspaceId ? String(body.workspaceId) : null;
    const allowPublic = category === "review" && Boolean(body.allowPublic);
    const allowContact = Boolean(body.allowContact);
    const rating = category === "review" ? Number(body.rating) : null;

    if (!allowedCategories.has(category)) {
      return json(request, { error: "Invalid feedback category." }, 400);
    }
    if (!allowedAccountTypes.has(accountType)) {
      return json(request, { error: "Invalid account type." }, 400);
    }
    if (title.length > 160) {
      return json(request, { error: "The title must be 160 characters or fewer." }, 400);
    }
    if (message.length < 3 || message.length > 5000) {
      return json(request, { error: "Enter a message between 3 and 5,000 characters." }, 400);
    }
    if (category === "review" && (!Number.isInteger(rating) || rating! < 1 || rating! > 5)) {
      return json(request, { error: "Choose a rating from 1 to 5." }, 400);
    }

    if (workspaceId) {
      const { data: membership, error: membershipError } = await admin
        .from("workspace_memberships")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (membershipError) throw new Error(membershipError.message);
      if (!membership) {
        return json(request, { error: "You do not have access to that workspace." }, 403);
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authData.user.id)
      .gte("created_at", oneHourAgo);

    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= 10) {
      return json(request, { error: "Too many submissions were sent. Try again later." }, 429);
    }

    const { data: inserted, error: insertError } = await admin
      .from("feedback_submissions")
      .insert({
        user_id: authData.user.id,
        workspace_id: workspaceId,
        account_type: accountType,
        category,
        rating,
        title,
        message,
        allow_public: allowPublic,
        allow_contact: allowContact,
        route,
        app_version: appVersion,
        browser_summary: browserSummary,
        delivery_status: "pending",
      })
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);

    const supportEmail = Deno.env.get("YARDPILOT_SUPPORT_EMAIL") ?? "support@yardpilotusa.com";
    const from = Deno.env.get("YARDPILOT_EMAIL_FROM") ?? "YardPilotUSA <no-reply@yardpilotusa.com>";
    const userEmail = authData.user.email ?? "";
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

    const delivery = await sendEmail({
      from,
      to: [supportEmail],
      replyTo: allowContact && userEmail ? userEmail : undefined,
      subject: `[YardPilotUSA ${categoryLabel}] ${title || "New submission"}`,
      html: `
        <h2>New YardPilotUSA ${escapeHtml(categoryLabel)}</h2>
        <p><strong>User ID:</strong> ${escapeHtml(authData.user.id)}</p>
        <p><strong>Contact allowed:</strong> ${allowContact ? "Yes" : "No"}</p>
        <p><strong>Email:</strong> ${allowContact && userEmail ? escapeHtml(userEmail) : "Not included"}</p>
        <p><strong>Workspace:</strong> ${escapeHtml(workspaceId ?? "None")}</p>
        <p><strong>Account mode:</strong> ${escapeHtml(accountType)}</p>
        <p><strong>Route:</strong> ${escapeHtml(route || "Unknown")}</p>
        ${rating ? `<p><strong>Rating:</strong> ${rating}/5</p>` : ""}
        <p><strong>Public review permission:</strong> ${allowPublic ? "Yes" : "No"}</p>
        <p><strong>Title:</strong> ${escapeHtml(title || "Untitled")}</p>
        <hr>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      `,
    });

    await admin
      .from("feedback_submissions")
      .update({
        delivery_status: delivery.delivered
          ? "delivered"
          : delivery.configured
            ? "failed"
            : "not_configured",
        delivery_error: delivery.error,
        delivered_at: delivery.delivered ? new Date().toISOString() : null,
      })
      .eq("id", inserted.id);

    return json(request, {
      received: true,
      id: inserted.id,
      emailDelivery: delivery.delivered
        ? "delivered"
        : delivery.configured
          ? "failed"
          : "not_configured",
    });
  } catch (error) {
    return json(
      request,
      { error: error instanceof Error ? error.message : "Feedback could not be submitted." },
      400,
    );
  }
});
