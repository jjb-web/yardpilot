import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function usableBrowserOrigin(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const isLocal =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || isLocal ? url.origin : null;
  } catch {
    return null;
  }
}

function redirectUrl(
  supplied: unknown,
  browserOrigin: string,
  fallbackPath: string
) {
  const fallback = new URL(fallbackPath, `${browserOrigin}/`).toString();
  if (typeof supplied !== "string" || !supplied.trim()) return fallback;

  try {
    const candidate = new URL(supplied);
    return candidate.origin === browserOrigin ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
}

function isMissingStripeAccount(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return record.code === "resource_missing";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const configuredAppUrl = (
      Deno.env.get("YARDPILOT_APP_URL") || "https://yardpilotusa.com"
    ).replace(/\/$/, "");

    if (!stripeKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("The payment service is not configured.");
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) {
      return json({ error: "Sign in before connecting Stripe." }, 401);
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
      return json({ error: "Your session is invalid." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (!workspaceId) {
      return json({ error: "Choose a workspace first." }, 400);
    }

    // Prefer the real browser origin used to invoke the function. This keeps
    // Vercel custom-domain and preview deployments from returning to a stale URL.
    const browserOrigin =
      usableBrowserOrigin(request.headers.get("Origin")) ||
      usableBrowserOrigin(configuredAppUrl) ||
      "https://yardpilotusa.com";
    const returnUrl = redirectUrl(
      body.returnUrl,
      browserOrigin,
      "/app/account?stripe=return"
    );
    const refreshUrl = redirectUrl(
      body.refreshUrl,
      browserOrigin,
      "/app/account?stripe=refresh"
    );

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: membership } = await admin
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "co_owner"].includes(membership.role)) {
      return json(
        { error: "Only an owner or co-owner can connect the payment account." },
        403
      );
    }

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("id, name, kind, stripe_account_id")
      .eq("id", workspaceId)
      .single();
    if (workspaceError || !workspace) throw new Error("Workspace not found.");
    if (workspace.kind === "personal") {
      throw new Error(
        "Create a Company or Workgroup before accepting customer payments."
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let accountId = workspace.stripe_account_id as string | null;
    let account: Stripe.Account | null = null;

    if (accountId) {
      try {
        account = await stripe.accounts.retrieve(accountId);
      } catch (error) {
        if (!isMissingStripeAccount(error)) throw error;

        // This commonly happens after changing Stripe test/live keys. Remove the
        // stale ID so the workspace can create a fresh account in the active mode.
        accountId = null;
        await admin
          .from("workspaces")
          .update({
            stripe_account_id: null,
            stripe_onboarding_complete: false,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);
      }
    }

    if (!accountId || !account) {
      account = await stripe.accounts.create({
        country: "US",
        email: profile?.email || user.email || undefined,
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "express" },
        },
        business_profile: {
          name: workspace.name,
          product_description: "Landscaping and property-service invoices",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          yardpilot_workspace_id: workspaceId,
        },
      });
      accountId = account.id;
    }

    await admin
      .from("workspaces")
      .update({
        stripe_account_id: accountId,
        stripe_onboarding_complete: Boolean(account.details_submitted),
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    if (
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled
    ) {
      const connectedUrl = new URL(returnUrl);
      connectedUrl.searchParams.set("connected", "1");
      return json({ url: connectedUrl.toString(), alreadyConnected: true });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return json({ url: accountLink.url });
  } catch (error) {
    console.error("stripe-connect-account failed", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Stripe setup failed.",
      },
      400
    );
  }
});
