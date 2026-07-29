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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function usableOrigin(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    return url.protocol === "https:" || local ? url.origin : null;
  } catch {
    return null;
  }
}

function safeRedirect(
  supplied: unknown,
  allowedOrigin: string,
  fallbackPath: string
) {
  const fallback = new URL(fallbackPath, `${allowedOrigin}/`).toString();

  if (typeof supplied !== "string" || !supplied.trim()) {
    return fallback;
  }

  try {
    const candidate = new URL(supplied);
    return candidate.origin === allowedOrigin ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
}

function isMissingStripeAccount(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as Record<string, unknown>).code === "resource_missing";
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
      console.error("Missing required Edge Function secrets", {
        hasStripeKey: Boolean(stripeKey),
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return json({ error: "The payment service is not configured." }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) {
      return json({ error: "Sign in before connecting Stripe." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("Stripe Connect user verification failed", userError);
      return json({ error: "Your session is invalid. Sign in again." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";

    if (!workspaceId) {
      return json({ error: "Choose a workspace first." }, 400);
    }

    console.log("stripe-connect-account request", {
      userId: user.id,
      userEmail: user.email,
      workspaceId,
    });

    const browserOrigin =
      usableOrigin(request.headers.get("Origin")) ||
      usableOrigin(configuredAppUrl) ||
      "https://yardpilotusa.com";

    const returnUrl = safeRedirect(
      body.returnUrl,
      browserOrigin,
      "/app/account?stripe=return"
    );
    const refreshUrl = safeRedirect(
      body.refreshUrl,
      browserOrigin,
      "/app/account?stripe=refresh"
    );

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: membership,
      error: membershipError,
    } = await admin
      .from("workspace_memberships")
      .select("id, workspace_id, user_id, role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Workspace membership lookup failed", {
        userId: user.id,
        workspaceId,
        code: membershipError.code,
        message: membershipError.message,
        details: membershipError.details,
        hint: membershipError.hint,
      });

      return json(
        {
          error: `Could not verify workspace permissions: ${membershipError.message}`,
        },
        500
      );
    }

    if (!membership) {
      console.warn("No membership matched Stripe Connect request", {
        userId: user.id,
        userEmail: user.email,
        workspaceId,
      });

      return json(
        {
          error:
            "Your signed-in account is not a member of the selected workspace.",
        },
        403
      );
    }

    if (!["owner", "co_owner"].includes(membership.role)) {
      console.warn("Stripe Connect rejected workspace role", {
        userId: user.id,
        workspaceId,
        actualRole: membership.role,
      });

      return json(
        {
          error: `Your actual workspace role is "${membership.role}". Only an owner or co-owner can connect Stripe.`,
        },
        403
      );
    }

    const {
      data: workspace,
      error: workspaceError,
    } = await admin
      .from("workspaces")
      .select("id, name, kind, stripe_account_id")
      .eq("id", workspaceId)
      .single();

    if (workspaceError || !workspace) {
      console.error("Workspace lookup failed", {
        userId: user.id,
        workspaceId,
        error: workspaceError,
      });

      return json(
        {
          error: workspaceError
            ? `Could not load the workspace: ${workspaceError.message}`
            : "Workspace not found.",
        },
        404
      );
    }

    if (workspace.kind === "personal") {
      return json(
        {
          error:
            "Create or switch to a Company or Workgroup before accepting customer payments.",
        },
        400
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      // Do not block Stripe onboarding. Supabase Auth still provides user.email.
      console.warn("Could not load profile email for Stripe", {
        userId: user.id,
        code: profileError.code,
        message: profileError.message,
      });
    }

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

        console.warn("Removing stale Stripe account ID", {
          workspaceId,
          accountId,
        });

        accountId = null;

        const { error: clearError } = await admin
          .from("workspaces")
          .update({
            stripe_account_id: null,
            stripe_onboarding_complete: false,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);

        if (clearError) {
          throw new Error(
            `Could not clear the stale Stripe account: ${clearError.message}`
          );
        }
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
          product_description:
            "Landscaping and property-service invoices",
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

    const { error: workspaceUpdateError } = await admin
      .from("workspaces")
      .update({
        stripe_account_id: accountId,
        stripe_onboarding_complete: Boolean(account.details_submitted),
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    if (workspaceUpdateError) {
      throw new Error(
        `Stripe account was created, but the workspace could not be updated: ${workspaceUpdateError.message}`
      );
    }

    if (
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled
    ) {
      const connectedUrl = new URL(returnUrl);
      connectedUrl.searchParams.set("connected", "1");

      return json({
        url: connectedUrl.toString(),
        alreadyConnected: true,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    console.log("Stripe onboarding link created", {
      userId: user.id,
      workspaceId,
      stripeAccountId: accountId,
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
