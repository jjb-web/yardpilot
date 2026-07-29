import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^22";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = (Deno.env.get("YARDPILOT_APP_URL") || "https://yardpilotusa.com").replace(/\/$/, "");

    if (!stripeKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("The payment service is not configured.");
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) {
      return Response.json({ error: "Sign in before connecting Stripe." }, { status: 401, headers: corsHeaders });
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

    const body = await request.json().catch(() => ({}));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (!workspaceId) {
      return Response.json({ error: "Choose a workspace first." }, { status: 400, headers: corsHeaders });
    }

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
      return Response.json(
        { error: "Only an owner or co-owner can connect the payment account." },
        { status: 403, headers: corsHeaders }
      );
    }

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select("id, name, kind, stripe_account_id")
      .eq("id", workspaceId)
      .single();
    if (workspaceError || !workspace) throw new Error("Workspace not found.");
    if (workspace.kind === "personal") {
      throw new Error("Create a Company or Workgroup before accepting customer payments.");
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
    let account: Stripe.Account;

    if (accountId) {
      account = await stripe.accounts.retrieve(accountId);
    } else {
      account = await stripe.accounts.create({
        country: "US",
        email: profile?.email || user.email || undefined,
        controller: {
          fees: {
            payer: "account",
          },
          losses: {
            payments: "stripe",
          },
          requirement_collection: "stripe",
          stripe_dashboard: {
            type: "express",
          },
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

    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      return Response.json(
        { url: `${appUrl}/app/account?stripe=return&connected=1`, alreadyConnected: true },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/app/account?stripe=refresh`,
      return_url: `${appUrl}/app/account?stripe=return`,
      type: "account_onboarding",
    });

    return Response.json(
      { url: accountLink.url },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stripe setup failed." },
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});