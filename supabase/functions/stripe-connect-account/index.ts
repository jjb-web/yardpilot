import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type RequestBody = {
  workspaceId?: unknown;
  action?: unknown;
  returnUrl?: unknown;
  refreshUrl?: unknown;
};

type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  stripe_account_id: string | null;
};

type RequirementError = {
  code: string;
  reason: string;
  requirement: string;
};

const ADMIN_ROLES = new Set(["owner", "co_owner"]);

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function normalizedOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    const isLocal =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || isLocal ? url.origin : null;
  } catch {
    return null;
  }
}

function allowedOrigins() {
  const origins = new Set<string>();
  const appOrigin = normalizedOrigin(Deno.env.get("YARDPILOT_APP_URL"));
  if (appOrigin) origins.add(appOrigin);

  for (const raw of (Deno.env.get("YARDPILOT_ALLOWED_ORIGINS") || "").split(",")) {
    const origin = normalizedOrigin(raw);
    if (origin) origins.add(origin);
  }

  origins.add("http://localhost:5173");
  origins.add("http://127.0.0.1:5173");
  return origins;
}

function requestOrigin(request: Request, origins: Set<string>) {
  const origin = normalizedOrigin(request.headers.get("Origin"));
  if (origin && origins.has(origin)) return origin;

  const appOrigin = normalizedOrigin(Deno.env.get("YARDPILOT_APP_URL"));
  if (appOrigin) return appOrigin;

  return [...origins][0] || "https://yardpilotusa.com";
}

function corsHeaders(request: Request, origins: Set<string>) {
  const origin = normalizedOrigin(request.headers.get("Origin"));
  const allowed = origin && origins.has(origin) ? origin : requestOrigin(request, origins);
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(
  request: Request,
  origins: Set<string>,
  body: Record<string, unknown>,
  status = 200,
) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request, origins),
  });
}

function safeRedirect(
  supplied: unknown,
  fallbackOrigin: string,
  allowed: Set<string>,
  fallbackPath: string,
) {
  const fallback = new URL(fallbackPath, `${fallbackOrigin}/`).toString();
  if (typeof supplied !== "string" || !supplied.trim()) return fallback;

  try {
    const candidate = new URL(supplied);
    return allowed.has(candidate.origin) ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
}

function isMissingStripeResource(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<string, unknown>).code === "resource_missing",
  );
}

function dashboardType(account: Stripe.Account) {
  const configured = account.controller?.stripe_dashboard?.type;
  if (configured) return configured;
  if (account.type === "standard") return "full";
  if (account.type === "express") return "express";
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function requirementErrors(value: unknown): RequirementError[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    return {
      code: typeof row.code === "string" ? row.code : "",
      reason: typeof row.reason === "string" ? row.reason : "",
      requirement:
        typeof row.requirement === "string" ? row.requirement : "",
    };
  });
}

function accountStatus(account: Stripe.Account | null) {
  const requirements = account?.requirements;
  const future = account?.future_requirements;
  const syncedAt = new Date().toISOString();

  return {
    connected: Boolean(account?.charges_enabled && account?.payouts_enabled),
    accountExists: Boolean(account),
    onboardingComplete: Boolean(account?.details_submitted),
    chargesEnabled: Boolean(account?.charges_enabled),
    payoutsEnabled: Boolean(account?.payouts_enabled),
    currentlyDue: stringArray(requirements?.currently_due),
    eventuallyDue: stringArray(requirements?.eventually_due),
    pastDue: stringArray(requirements?.past_due),
    pendingVerification: stringArray(requirements?.pending_verification),
    disabledReason: requirements?.disabled_reason ?? null,
    errors: requirementErrors(requirements?.errors),
    futureCurrentlyDue: stringArray(future?.currently_due),
    futureEventuallyDue: stringArray(future?.eventually_due),
    futurePastDue: stringArray(future?.past_due),
    futurePendingVerification: stringArray(future?.pending_verification),
    futureDisabledReason: future?.disabled_reason ?? null,
    syncedAt,
  };
}

async function persistAccountStatus(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  account: Stripe.Account,
) {
  const status = accountStatus(account);
  const { error } = await admin
    .from("workspaces")
    .update({
      stripe_account_id: account.id,
      stripe_onboarding_complete: status.onboardingComplete,
      stripe_charges_enabled: status.chargesEnabled,
      stripe_payouts_enabled: status.payoutsEnabled,
      stripe_currently_due: status.currentlyDue,
      stripe_eventually_due: status.eventuallyDue,
      stripe_past_due: status.pastDue,
      stripe_pending_verification: status.pendingVerification,
      stripe_disabled_reason: status.disabledReason,
      stripe_requirement_errors: status.errors,
      stripe_future_currently_due: status.futureCurrentlyDue,
      stripe_future_eventually_due: status.futureEventuallyDue,
      stripe_future_past_due: status.futurePastDue,
      stripe_future_pending_verification: status.futurePendingVerification,
      stripe_future_disabled_reason: status.futureDisabledReason,
      stripe_status_synced_at: status.syncedAt,
      updated_at: status.syncedAt,
    })
    .eq("id", workspaceId);

  if (error) {
    throw new Error(`Could not save Stripe status: ${error.message}`);
  }

  return status;
}

Deno.serve(async (request) => {
  const origins = allowedOrigins();

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request, origins) });
  }

  if (request.method !== "POST") {
    return json(request, origins, { error: "Method not allowed." }, 405);
  }

  const suppliedOrigin = normalizedOrigin(request.headers.get("Origin"));
  if (suppliedOrigin && !origins.has(suppliedOrigin)) {
    return json(request, origins, { error: "This website origin is not allowed." }, 403);
  }

  try {
    const stripeKey = requiredEnv("STRIPE_SECRET_KEY");
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) {
      return json(request, origins, { error: "Sign in before connecting Stripe." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("Stripe Connect authentication failed", userError);
      return json(request, origins, { error: "Your session is invalid. Sign in again." }, 401);
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const action = body.action === "status" ? "status" : "onboard";

    if (!workspaceId) {
      return json(request, origins, { error: "Choose a workspace first." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: membership, error: membershipError } = await admin
      .from("workspace_memberships")
      .select("id, role")
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
        request,
        origins,
        { error: `Could not verify workspace permissions: ${membershipError.message}` },
        500,
      );
    }

    if (!membership) {
      return json(
        request,
        origins,
        { error: "Your account is not a member of the selected workspace." },
        403,
      );
    }

    if (!ADMIN_ROLES.has(membership.role)) {
      return json(
        request,
        origins,
        {
          error: `Your actual workspace role is "${membership.role}". Only an owner or co-owner can connect Stripe.`,
        },
        403,
      );
    }

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("id, name, kind, stripe_account_id")
      .eq("id", workspaceId)
      .single<WorkspaceRow>();

    if (workspaceError || !workspace) {
      console.error("Workspace lookup failed", workspaceError);
      return json(
        request,
        origins,
        { error: workspaceError?.message || "Workspace not found." },
        404,
      );
    }

    if (workspace.kind === "personal") {
      return json(
        request,
        origins,
        {
          error:
            "Create or switch to a Company or Workgroup before accepting customer payments.",
        },
        400,
      );
    }

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let account: Stripe.Account | null = null;
    let accountId = workspace.stripe_account_id;

    if (accountId) {
      try {
        account = await stripe.accounts.retrieve(accountId);
      } catch (error) {
        if (!isMissingStripeResource(error)) throw error;

        console.warn("Clearing a stale Stripe account ID", {
          workspaceId,
          accountId,
        });

        const { error: clearError } = await admin
          .from("workspaces")
          .update({
            stripe_account_id: null,
            stripe_onboarding_complete: false,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_currently_due: [],
            stripe_eventually_due: [],
            stripe_past_due: [],
            stripe_pending_verification: [],
            stripe_disabled_reason: null,
            stripe_requirement_errors: [],
            stripe_future_currently_due: [],
            stripe_future_eventually_due: [],
            stripe_future_past_due: [],
            stripe_future_pending_verification: [],
            stripe_future_disabled_reason: null,
            stripe_status_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);

        if (clearError) {
          throw new Error(`Could not clear the stale Stripe account: ${clearError.message}`);
        }

        accountId = null;
      }
    }

    if (account) {
      const existingDashboard = dashboardType(account);
      if (existingDashboard !== "full") {
        return json(
          request,
          origins,
          {
            error:
              `This workspace is linked to a Stripe account with dashboard type "${existingDashboard || "unknown"}". ` +
              "Stripe dashboard type is permanent. Create a new full-dashboard connected account for this workspace before continuing.",
            code: "incompatible_stripe_account",
          },
          409,
        );
      }

      await persistAccountStatus(admin, workspaceId, account);
    }

    if (action === "status") {
      return json(request, origins, accountStatus(account));
    }

    if (!account) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("Could not load profile email for Stripe", profileError);
      }

      account = await stripe.accounts.create({
        country: "US",
        email: profile?.email || user.email || undefined,
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "full" },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: workspace.name,
          product_description: "Landscaping and property-service invoices",
        },
        metadata: {
          yardpilot_workspace_id: workspaceId,
        },
      });

      accountId = account.id;
      await persistAccountStatus(admin, workspaceId, account);
    }

    const fallbackOrigin = requestOrigin(request, origins);
    const returnUrl = safeRedirect(
      body.returnUrl,
      fallbackOrigin,
      origins,
      "/app/account?stripe=return",
    );
    const refreshUrl = safeRedirect(
      body.refreshUrl,
      fallbackOrigin,
      origins,
      "/app/account?stripe=refresh",
    );

    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      const connectedUrl = new URL(returnUrl);
      connectedUrl.searchParams.set("connected", "1");
      return json(request, origins, {
        url: connectedUrl.toString(),
        alreadyConnected: true,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId || account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
      collection_options: {
        // Up-front onboarding collects known eventually-due requirements in the
        // first flow. Stripe can still request documents later if verification
        // of the submitted information fails or requirements change.
        fields: "eventually_due",
      },
    });

    console.log("Stripe onboarding link created", {
      userId: user.id,
      workspaceId,
      stripeAccountId: account.id,
      dashboardType: dashboardType(account),
      collectionMode: "eventually_due",
    });

    return json(request, origins, { url: accountLink.url });
  } catch (error) {
    console.error("stripe-connect-account failed", error);
    return json(
      request,
      origins,
      { error: error instanceof Error ? error.message : "Stripe setup failed." },
      400,
    );
  }
});
