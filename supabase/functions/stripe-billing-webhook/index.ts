import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const json = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (request) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) return json({ error: "Billing webhook is not configured." }, 500);

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing Stripe signature." }, 400);
    const stripe = new Stripe(stripeKey);
    const raw = await request.text();
    const event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: claimed, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
      requested_event_id: event.id,
      requested_event_type: event.type,
      requested_livemode: event.livemode,
    });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return json({ received: true, duplicate: true });

    const syncSubscription = async (subscription: Stripe.Subscription, issueCode = "", issueMessage = "") => {
      const workspaceId = subscription.metadata?.workspace_id;
      if (!workspaceId) return;
      const item = subscription.items.data[0];
      const isPro = ["active", "trialing"].includes(subscription.status);
      const periodStart = item?.current_period_start ?? null;
      const periodEnd = item?.current_period_end ?? null;
      const { error } = await admin.from("workspace_subscriptions").upsert({
        workspace_id: workspaceId,
        plan_key: isPro ? "pro" : "free",
        subscription_status: subscription.status,
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: item?.price?.id ?? null,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        billing_issue_code: issueCode,
        billing_issue_message: issueMessage.slice(0, 1000),
        last_event_id: event.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" });
      if (error) throw new Error(error.message);
    };

    const retrieveInvoiceSubscription = async (invoice: Stripe.Invoice) => {
      const details = invoice.parent?.subscription_details;
      const subscriptionRef = details?.subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) return null;
      return await stripe.subscriptions.retrieve(subscriptionId);
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe.subscriptions.retrieve(id));
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed"].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = await retrieveInvoiceSubscription(invoice);
      if (subscription) {
        const issueCode = event.type === "invoice.paid" ? "" : event.type;
        const issueMessage = event.type === "invoice.payment_failed"
          ? "Subscription payment failed. Update the payment method in billing."
          : event.type === "invoice.payment_action_required"
            ? "Subscription payment requires customer authentication."
            : event.type === "invoice.finalization_failed"
              ? invoice.last_finalization_error?.message ?? "Stripe could not finalize the subscription invoice."
              : "";
        await syncSubscription(subscription, issueCode, issueMessage);
      }
    }

    await admin.rpc("finish_stripe_webhook_event", {
      requested_event_id: event.id,
      requested_success: true,
      requested_error: "",
    });
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Webhook failed." }, 400);
  }
});
