import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function connectedAccountId(event: Stripe.Event) {
  return typeof event.account === "string" ? event.account : null;
}

function unixDate(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  try {
    const stripeKey = requiredEnv("STRIPE_SECRET_KEY");
    const webhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing Stripe signature.", { status: 400 });
    }

    const rawBody = await request.text();
    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      console.error("Invalid Stripe webhook signature", error);
      return new Response(
        error instanceof Error ? error.message : "Invalid webhook signature.",
        { status: 400 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const { error } = await admin
        .from("workspaces")
        .update({
          stripe_onboarding_complete: Boolean(account.details_submitted),
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", account.id);

      if (error) throw new Error(`Could not update workspace Stripe status: ${error.message}`);
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId =
        session.metadata?.yardpilot_invoice_id || session.client_reference_id;
      const workspaceId = session.metadata?.yardpilot_workspace_id;
      const eventAccount = connectedAccountId(event);

      if (!invoiceId || !workspaceId) {
        throw new Error(`Stripe session ${session.id} is missing YardPilot metadata.`);
      }

      const { data: workspace, error: workspaceError } = await admin
        .from("workspaces")
        .select("stripe_account_id")
        .eq("id", workspaceId)
        .single();

      if (workspaceError || !workspace) {
        throw new Error(workspaceError?.message || "Webhook workspace not found.");
      }

      if (eventAccount && workspace.stripe_account_id !== eventAccount) {
        throw new Error("Webhook connected account does not match the invoice workspace.");
      }

      if (
        (event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded") &&
        session.payment_status === "paid"
      ) {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || null;

        const { error } = await admin
          .from("invoices")
          .update({
            status: "paid",
            payment_status: "paid",
            payment_method: "stripe",
            stripe_checkout_session_id: session.id,
            stripe_checkout_url: session.url,
            stripe_payment_intent_id: paymentIntentId,
            paid_at: unixDate(session.created),
            completed_at: new Date().toISOString(),
            archived_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("workspace_id", workspaceId);

        if (error) throw new Error(`Could not mark the invoice paid: ${error.message}`);
      }

      if (event.type === "checkout.session.async_payment_failed") {
        const { error } = await admin
          .from("invoices")
          .update({
            payment_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("workspace_id", workspaceId);

        if (error) throw new Error(`Could not record the failed payment: ${error.message}`);
      }

      if (event.type === "checkout.session.expired") {
        const { error } = await admin
          .from("invoices")
          .update({
            stripe_checkout_session_id: null,
            stripe_checkout_url: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId)
          .eq("workspace_id", workspaceId)
          .eq("stripe_checkout_session_id", session.id)
          .neq("payment_status", "paid");

        if (error) throw new Error(`Could not clear the expired checkout: ${error.message}`);
      }
    }

    console.log("Stripe webhook processed", {
      eventId: event.id,
      eventType: event.type,
      connectedAccount: connectedAccountId(event),
    });

    return Response.json({ received: true });
  } catch (error) {
    console.error("stripe-webhook failed", error);
    return new Response(
      error instanceof Error ? error.message : "Webhook processing failed.",
      { status: 500 },
    );
  }
});
