import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type RequestBody = { shareToken?: unknown };

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
  return (
    normalizedOrigin(Deno.env.get("YARDPILOT_APP_URL")) ||
    [...origins][0] ||
    "https://yardpilotusa.com"
  );
}

function corsHeaders(request: Request, origins: Set<string>) {
  return {
    "Access-Control-Allow-Origin": requestOrigin(request, origins),
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
  return Response.json(body, { status, headers: corsHeaders(request, origins) });
}

function applicationFee(unitAmount: number) {
  const raw = Number(Deno.env.get("YARDPILOT_APPLICATION_FEE_BPS") || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const basisPoints = Math.min(Math.floor(raw), 2500);
  return Math.min(Math.floor((unitAmount * basisPoints) / 10_000), unitAmount - 1);
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
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const shareToken =
      typeof body.shareToken === "string" ? body.shareToken.trim() : "";

    if (!shareToken) {
      return json(request, origins, { error: "The invoice link is invalid." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select(
        "id, workspace_id, contact_id, invoice_number, status, payment_status, amount, currency, share_enabled, stripe_checkout_session_id",
      )
      .eq("share_token", shareToken)
      .eq("share_enabled", true)
      .maybeSingle();

    if (invoiceError) {
      console.error("Invoice lookup failed", invoiceError);
      throw new Error(`Could not load the invoice: ${invoiceError.message}`);
    }
    if (!invoice) throw new Error("This invoice is unavailable.");
    if (invoice.payment_status === "paid" || invoice.status === "paid") {
      throw new Error("This invoice has already been paid.");
    }
    if (invoice.status === "void") throw new Error("This invoice was voided.");

    const unitAmount = Math.round(Number(invoice.amount) * 100);
    if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
      throw new Error("This invoice has no valid payable amount.");
    }
    if (unitAmount > 99_999_999) {
      throw new Error("This invoice amount is too large for online checkout.");
    }

    const { data: workspace, error: workspaceError } = await admin
      .from("workspaces")
      .select(
        "name, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled",
      )
      .eq("id", invoice.workspace_id)
      .single();

    if (workspaceError || !workspace) {
      throw new Error(workspaceError?.message || "The business workspace is unavailable.");
    }

    if (
      !workspace.stripe_account_id ||
      !workspace.stripe_onboarding_complete ||
      !workspace.stripe_charges_enabled ||
      !workspace.stripe_payouts_enabled
    ) {
      throw new Error("Online payment is not enabled for this business.");
    }

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    const connectedAccount = await stripe.accounts.retrieve(
      workspace.stripe_account_id,
    );

    if (!connectedAccount.charges_enabled || !connectedAccount.payouts_enabled) {
      await admin
        .from("workspaces")
        .update({
          stripe_onboarding_complete: Boolean(connectedAccount.details_submitted),
          stripe_charges_enabled: Boolean(connectedAccount.charges_enabled),
          stripe_payouts_enabled: Boolean(connectedAccount.payouts_enabled),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.workspace_id);
      throw new Error("This business must finish Stripe setup before accepting payment.");
    }

    if (invoice.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          invoice.stripe_checkout_session_id,
          {},
          { stripeAccount: workspace.stripe_account_id },
        );

        if (existing.payment_status === "paid") {
          return json(request, origins, { paid: true });
        }

        if (existing.status === "open" && existing.url) {
          return json(request, origins, { url: existing.url, reused: true });
        }
      } catch (error) {
        console.warn("Existing Checkout Session could not be reused", error);
      }
    }

    let customerEmail: string | undefined;
    if (invoice.contact_id) {
      const { data: contact, error: contactError } = await admin
        .from("contacts")
        .select("email")
        .eq("id", invoice.contact_id)
        .maybeSingle();

      if (contactError) console.warn("Could not prefill customer email", contactError);
      if (typeof contact?.email === "string" && contact.email.includes("@")) {
        customerEmail = contact.email;
      }
    }

    const metadata = {
      yardpilot_invoice_id: invoice.id,
      yardpilot_workspace_id: invoice.workspace_id,
    };
    const feeAmount = applicationFee(unitAmount);
    const appOrigin = requestOrigin(request, origins);
    const paymentIntentData = {
      metadata,
      description: `YardPilot invoice ${invoice.invoice_number}`,
      ...(feeAmount > 0 ? { application_fee_amount: feeAmount } : {}),
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        submit_type: "pay",
        customer_email: customerEmail,
        client_reference_id: invoice.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(invoice.currency || "usd").toLowerCase(),
              unit_amount: unitAmount,
              product_data: {
                name: `Invoice ${invoice.invoice_number}`,
                description: `${workspace.name} landscaping services`,
              },
            },
          },
        ],
        metadata,
        payment_intent_data: paymentIntentData,
        success_url:
          `${appOrigin}/invoice/share/${encodeURIComponent(shareToken)}` +
          "?payment=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          `${appOrigin}/invoice/share/${encodeURIComponent(shareToken)}` +
          "?payment=cancelled",
      },
      {
        stripeAccount: workspace.stripe_account_id,
        idempotencyKey:
          `yardpilot-invoice-${invoice.id}-` +
          Math.floor(Date.now() / (10 * 60 * 1000)),
      },
    );

    const { error: updateError } = await admin
      .from("invoices")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_checkout_url: session.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .eq("workspace_id", invoice.workspace_id);

    if (updateError) {
      console.error("Could not save Checkout Session", updateError);
      throw new Error(`The payment page was created but could not be saved: ${updateError.message}`);
    }

    return json(request, origins, { url: session.url });
  } catch (error) {
    console.error("create-invoice-checkout failed", error);
    return json(
      request,
      origins,
      {
        error:
          error instanceof Error
            ? error.message
            : "The payment page could not be created.",
      },
      400,
    );
  }
});
