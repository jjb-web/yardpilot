import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

Deno.serve(async (request) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response("Webhook is not configured.", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature.", { status: 400 });

  const rawBody = await request.text();
  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Invalid webhook signature.",
      { status: 400 }
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await admin
        .from("workspaces")
        .update({
          stripe_onboarding_complete: Boolean(account.details_submitted),
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", account.id);
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const invoiceId = session.metadata?.yardpilot_invoice_id || session.client_reference_id;
        if (invoiceId) {
          await admin
            .from("invoices")
            .update({
              status: "paid",
              payment_status: "paid",
              payment_method: "stripe",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id || null,
              paid_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              archived_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceId);
        }
      }
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.yardpilot_invoice_id || session.client_reference_id;
      if (invoiceId) {
        await admin
          .from("invoices")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Webhook processing failed.",
      { status: 500 }
    );
  }
});
