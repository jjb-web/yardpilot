import { createClient } from "@supabase/supabase-js";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value.trim().toUpperCase())))).map(v=>v.toString(16).padStart(2,"0")).join("");
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=request.headers.get("Authorization")||""; const client=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const admin=createClient(url,service);
  const {data:{user}}=await client.auth.getUser(); if(!user) return json({error:"Unauthorized"},401);
  const {workspaceId,code}=await request.json(); if(!workspaceId||!code) return json({error:"Workspace and code are required."},400);
  const {data:m}=await admin.from("workspace_memberships").select("role").eq("workspace_id",workspaceId).eq("user_id",user.id).maybeSingle();
  if(!m||!["owner","co_owner"].includes(m.role)) return json({error:"Only an owner or co-owner can redeem workspace access."},403);
  const codeHash=await hash(code);
  const {data:access,error:accessError}=await admin.from("access_codes").select("*").eq("code_hash",codeHash).eq("active",true).maybeSingle();
  if(accessError||!access) return json({error:"This access code is invalid or inactive."},400);
  if(access.expires_at && new Date(access.expires_at)<=new Date()) return json({error:"This access code has expired."},400);
  if(access.redemption_count>=access.max_redemptions) return json({error:"This access code has reached its redemption limit."},400);
  const {data:existing}=await admin.from("access_code_redemptions").select("id").eq("access_code_id",access.id).eq("workspace_id",workspaceId).maybeSingle();
  if(existing) return json({error:"This workspace already redeemed this code."},400);
  const now=new Date();
  const {data:sub}=await admin.from("workspace_subscriptions").select("promotional_access_until").eq("workspace_id",workspaceId).maybeSingle();
  const base=sub?.promotional_access_until && new Date(sub.promotional_access_until)>now ? new Date(sub.promotional_access_until) : now;
  const end=new Date(base); end.setUTCDate(end.getUTCDate()+access.duration_days);
  const redemption=await admin.from("access_code_redemptions").insert({access_code_id:access.id,workspace_id:workspaceId,redeemed_by:user.id,access_starts_at:now.toISOString(),access_ends_at:end.toISOString()});
  if(redemption.error) return json({error:redemption.error.message},400);
  await admin.from("access_codes").update({redemption_count:access.redemption_count+1}).eq("id",access.id).eq("redemption_count",access.redemption_count);
  await admin.from("workspace_subscriptions").upsert({workspace_id:workspaceId,plan_key:"pro",promotional_access_until:end.toISOString(),updated_at:now.toISOString()},{onConflict:"workspace_id"});
  return json({message:`YardPilot Pro is unlocked until ${end.toLocaleDateString("en-US")}.`,accessUntil:end.toISOString()});
 }catch(error){return json({error:error instanceof Error?error.message:"Could not redeem access code."},500)}
});
