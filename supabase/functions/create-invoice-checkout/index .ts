import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = (Deno.env.get("YARDPILOT_APP_URL") || "https://yardpilotusa.com").replace(/\/$/, "");
    if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Online payments are not configured.");
    }

    const body = await request.json().catch(() => ({}));
    const shareToken = typeof body.shareToken === "string" ? body.shareToken.trim() : "";
    if (!shareToken) throw new Error("The invoice link is invalid.");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, workspace_id, contact_id, invoice_number, due_date, status, payment_status, amount, currency, share_token, share_enabled, stripe_checkout_session_id")
      .eq("share_token", shareToken)
      .eq("share_enabled", true)
      .single();
    if (invoiceError || !invoice) throw new Error("This invoice is unavailable.");

    if (invoice.payment_status === "paid" || invoice.status === "paid") {
      throw new Error("This invoice has already been paid.");
    }
    if (invoice.status === "void") throw new Error("This invoice was voided.");
    if (Number(invoice.amount) <= 0) throw new Error("This invoice has no payable amount.");

    const { data: onlinePaymentsEnabled, error: featureError } = await admin.rpc(
      "workspace_has_feature",
      { requested_workspace_id: invoice.workspace_id, requested_feature_key: "online_payments" }
    );
    if (featureError || !onlinePaymentsEnabled) {
      throw new Error("Online invoice payments require YardPilot Pro.");
    }

    const { data: workspace } = await admin
      .from("workspaces")
      .select("name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("id", invoice.workspace_id)
      .single();

    if (
      !workspace?.stripe_account_id ||
      !workspace.stripe_charges_enabled ||
      !workspace.stripe_payouts_enabled
    ) {
      throw new Error("Online payment is not enabled for this business.");
    }

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    if (invoice.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          invoice.stripe_checkout_session_id,
          {},
          { stripeAccount: workspace.stripe_account_id }
        );
        if (existing.status === "open" && existing.url) {
          return Response.json(
            { url: existing.url },
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch {
        // The old session may have expired or belonged to an earlier test account.
      }
    }

    let customerEmail: string | undefined;
    if (invoice.contact_id) {
      const { data: contact } = await admin
        .from("contacts")
        .select("email")
        .eq("id", invoice.contact_id)
        .maybeSingle();
      customerEmail = contact?.email || undefined;
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: customerEmail,
        client_reference_id: invoice.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(invoice.currency || "usd").toLowerCase(),
              unit_amount: Math.round(Number(invoice.amount) * 100),
              product_data: {
                name: `Invoice ${invoice.invoice_number}`,
                description: `${workspace.name} landscaping services`,
              },
            },
          },
        ],
        metadata: {
          yardpilot_invoice_id: invoice.id,
          yardpilot_workspace_id: invoice.workspace_id,
        },
        payment_intent_data: {
          metadata: {
            yardpilot_invoice_id: invoice.id,
            yardpilot_workspace_id: invoice.workspace_id,
          },
        },
        success_url: `${appUrl}/invoice/share/${shareToken}?payment=success`,
        cancel_url: `${appUrl}/invoice/share/${shareToken}?payment=cancelled`,
      },
      { stripeAccount: workspace.stripe_account_id }
    );

    await admin
      .from("invoices")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_checkout_url: session.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    return Response.json(
      { url: session.url },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The payment page could not be created." },
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
