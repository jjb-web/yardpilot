import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appUrl=Deno.env.get("YARDPILOT_APP_URL")||"https://yardpilotusa.com";
  const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2026-06-24.dahlia" as never});
  const auth=request.headers.get("Authorization")||"";
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const admin=createClient(url,service);
  const {data:{user}}=await client.auth.getUser(); if(!user) return json({error:"Unauthorized"},401);
  const {workspaceId}=await request.json();
  const {data:m}=await admin.from("workspace_memberships").select("role").eq("workspace_id",workspaceId).eq("user_id",user.id).maybeSingle();
  if(!m||!["owner","co_owner"].includes(m.role)) return json({error:"Only an owner or co-owner can manage billing."},403);
  const {data:s}=await admin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id",workspaceId).maybeSingle();
  if(!s?.stripe_customer_id) return json({error:"No Stripe billing customer exists for this workspace yet."},400);
  const portal=await stripe.billingPortal.sessions.create({customer:s.stripe_customer_id,return_url:`${appUrl}/app/billing`});
  return json({url:portal.url});
 }catch(error){return json({error:error instanceof Error?error.message:"Could not open billing portal."},500)}
});
