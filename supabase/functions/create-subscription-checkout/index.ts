import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", {headers:cors});
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const appUrl = Deno.env.get("YARDPILOT_APP_URL") || "https://yardpilotusa.com";
    const auth = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {global:{headers:{Authorization:auth}}});
    const admin = createClient(supabaseUrl, serviceKey);
    const {data:{user}, error:userError} = await userClient.auth.getUser();
    if (userError || !user) return json({error:"Unauthorized"}, 401);
    const {workspaceId, interval} = await request.json();
    if (!workspaceId || !["month","year"].includes(interval)) return json({error:"Invalid request"}, 400);
    const {data:membership} = await admin.from("workspace_memberships").select("role").eq("workspace_id",workspaceId).eq("user_id",user.id).maybeSingle();
    if (!membership || !["owner","co_owner"].includes(membership.role)) return json({error:"Only an owner or co-owner can manage billing."},403);
    const priceId = interval === "year" ? Deno.env.get("STRIPE_PRO_ANNUAL_PRICE_ID") : Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID");
    if (!priceId) return json({error:`Missing Stripe ${interval} price secret.`},500);
    const stripe = new Stripe(stripeKey, {apiVersion:"2026-06-24.dahlia" as never});
    let {data:sub} = await admin.from("workspace_subscriptions").select("*").eq("workspace_id",workspaceId).maybeSingle();
    if (!sub) {
      const inserted = await admin.from("workspace_subscriptions").insert({workspace_id:workspaceId}).select("*").single();
      sub = inserted.data;
    }
    let customerId = sub?.stripe_customer_id as string | null;
    if (!customerId) {
      const {data:workspace} = await admin.from("workspaces").select("name").eq("id",workspaceId).single();
      const customer = await stripe.customers.create({email:user.email, name:workspace?.name || undefined, metadata:{workspace_id:workspaceId, yardpilot_user_id:user.id}});
      customerId = customer.id;
      await admin.from("workspace_subscriptions").update({stripe_customer_id:customerId,updated_at:new Date().toISOString()}).eq("workspace_id",workspaceId);
    }
    const session = await stripe.checkout.sessions.create({
      mode:"subscription",
      customer:customerId,
      line_items:[{price:priceId,quantity:1}],
      allow_promotion_codes:true,
      success_url:`${appUrl}/app/billing?checkout=success`,
      cancel_url:`${appUrl}/app/billing?checkout=cancelled`,
      client_reference_id:workspaceId,
      metadata:{workspace_id:workspaceId},
      subscription_data:{metadata:{workspace_id:workspaceId}}
    });
    return json({url:session.url});
  } catch (error) {
    return json({error:error instanceof Error ? error.message : "Could not start subscription checkout."},500);
  }
});
