import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async(request)=>{
 try{
  const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2026-06-24.dahlia" as never});
  const signature=request.headers.get("stripe-signature"); if(!signature) return json({error:"Missing Stripe signature"},400);
  const raw=await request.text();
  const event=await stripe.webhooks.constructEventAsync(raw,signature,Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET")!);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sync=async(subscription:any)=>{
    const workspaceId=subscription.metadata?.workspace_id;
    if(!workspaceId) return;
    const item=subscription.items?.data?.[0];
    await admin.from("workspace_subscriptions").upsert({
      workspace_id:workspaceId,
      plan_key:["active","trialing"].includes(subscription.status)?"pro":"free",
      subscription_status:subscription.status,
      stripe_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
      stripe_subscription_id:subscription.id,
      stripe_price_id:item?.price?.id??null,
      current_period_start:subscription.current_period_start?new Date(subscription.current_period_start*1000).toISOString():null,
      current_period_end:subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null,
      cancel_at_period_end:Boolean(subscription.cancel_at_period_end),
      last_event_id:event.id,
      updated_at:new Date().toISOString()
    },{onConflict:"workspace_id"});
  };
  if(event.type==="checkout.session.completed"){
    const session=event.data.object as any;
    if(session.mode==="subscription"&&session.subscription){
      const subscription=await stripe.subscriptions.retrieve(typeof session.subscription==="string"?session.subscription:session.subscription.id);
      await sync(subscription);
    }
  }else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
    await sync(event.data.object as any);
  }else if(["invoice.paid","invoice.payment_failed"].includes(event.type)){
    const invoice=event.data.object as any;
    const subscriptionId=typeof invoice.subscription==="string"?invoice.subscription:invoice.subscription?.id;
    if(subscriptionId){const subscription=await stripe.subscriptions.retrieve(subscriptionId); await sync(subscription);}
  }
  return json({received:true});
 }catch(error){return json({error:error instanceof Error?error.message:"Webhook failed"},400)}
});
