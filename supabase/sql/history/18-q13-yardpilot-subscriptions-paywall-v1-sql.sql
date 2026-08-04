-- YardPilot subscriptions, paywall enforcement, and promotional access codes.
-- Forward-only migration. Run after the latest YardPilot workflow migrations.
-- This migration does not delete business records or legacy columns.

begin;

create extension if not exists pgcrypto;

create table if not exists public.billing_plans (
  plan_key text primary key,
  name text not null,
  active boolean not null default true,
  estimates_per_month integer,
  invoices_per_month integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_plan_features (
  plan_key text not null references public.billing_plans(plan_key) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  primary key (plan_key, feature_key)
);

create table if not exists public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_key text not null default 'free' references public.billing_plans(plan_key),
  subscription_status text not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  promotional_access_until timestamptz,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null default '',
  campaign text not null default '',
  plan_key text not null default 'pro' references public.billing_plans(plan_key),
  duration_days integer not null check (duration_days between 1 and 3650),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.access_codes(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  redeemed_by uuid not null references auth.users(id),
  redeemed_at timestamptz not null default now(),
  access_starts_at timestamptz not null,
  access_ends_at timestamptz not null,
  unique(access_code_id, workspace_id)
);

insert into public.billing_plans(plan_key, name, estimates_per_month, invoices_per_month)
values
  ('free', 'Free', 5, 5),
  ('pro', 'Pro', null, null)
on conflict (plan_key) do update set
  name = excluded.name,
  estimates_per_month = excluded.estimates_per_month,
  invoices_per_month = excluded.invoices_per_month,
  updated_at = now();

insert into public.billing_plan_features(plan_key, feature_key, enabled)
values
  ('pro','team',true),
  ('pro','schedule',true),
  ('pro','followups',true),
  ('pro','online_payments',true),
  ('pro','unlimited_estimates',true),
  ('pro','unlimited_invoices',true),
  ('pro','multi_job_estimates',true),
  ('pro','advanced_reports',true),
  ('pro','custom_branding',true)
on conflict (plan_key, feature_key) do update set enabled = excluded.enabled;

insert into public.workspace_subscriptions(workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

create or replace function public.workspace_has_feature(
  requested_workspace_id uuid,
  requested_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_subscriptions ws
    join public.billing_plan_features pf
      on pf.plan_key = case
        when ws.promotional_access_until > now() then 'pro'
        when ws.subscription_status in ('active','trialing') then ws.plan_key
        else 'free'
      end
     and pf.feature_key = requested_feature_key
     and pf.enabled = true
    where ws.workspace_id = requested_workspace_id
  );
$$;

revoke all on function public.workspace_has_feature(uuid,text) from public;
grant execute on function public.workspace_has_feature(uuid,text) to authenticated, service_role;

create or replace function public.get_workspace_billing_status(
  requested_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  effective_plan text;
begin
  if not exists (
    select 1 from public.workspace_memberships
    where workspace_id = requested_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this workspace.';
  end if;

  insert into public.workspace_subscriptions(workspace_id)
  values (requested_workspace_id)
  on conflict (workspace_id) do nothing;

  select case
    when promotional_access_until > now() then 'pro'
    when subscription_status in ('active','trialing') then plan_key
    else 'free'
  end into effective_plan
  from public.workspace_subscriptions
  where workspace_id = requested_workspace_id;

  select jsonb_build_object(
    'plan_key', effective_plan,
    'subscription_status', ws.subscription_status,
    'stripe_customer_id', ws.stripe_customer_id,
    'stripe_subscription_id', ws.stripe_subscription_id,
    'stripe_price_id', ws.stripe_price_id,
    'current_period_end', ws.current_period_end,
    'cancel_at_period_end', ws.cancel_at_period_end,
    'promotional_access_until', ws.promotional_access_until,
    'features', coalesce((
      select jsonb_object_agg(feature_key, enabled)
      from public.billing_plan_features
      where plan_key = effective_plan
    ), '{}'::jsonb),
    'limits', jsonb_build_object(
      'estimates_per_month', bp.estimates_per_month,
      'invoices_per_month', bp.invoices_per_month
    ),
    'usage', jsonb_build_object(
      'estimates_this_month', (
        select count(*) from public.projects p
        where p.workspace_id = requested_workspace_id
          and p.created_at >= date_trunc('month', now())
      ),
      'invoices_this_month', (
        select count(*) from public.invoices i
        where i.workspace_id = requested_workspace_id
          and i.created_at >= date_trunc('month', now())
      )
    )
  ) into result
  from public.workspace_subscriptions ws
  join public.billing_plans bp on bp.plan_key = effective_plan
  where ws.workspace_id = requested_workspace_id;

  return result;
end;
$$;

revoke all on function public.get_workspace_billing_status(uuid) from public;
grant execute on function public.get_workspace_billing_status(uuid) to authenticated;

create or replace function public.assert_workspace_feature(
  requested_workspace_id uuid,
  requested_feature_key text,
  message text default 'This feature requires YardPilot Pro.'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.workspace_has_feature(requested_workspace_id, requested_feature_key) then
    raise exception '%', message using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_workspace_feature(uuid,text,text) from public;
grant execute on function public.assert_workspace_feature(uuid,text,text) to authenticated, service_role;

create or replace function public.enforce_workspace_paywall()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  monthly_limit integer;
  current_count integer;
begin
  wid := coalesce(new.workspace_id, old.workspace_id);

  if tg_table_name = 'workspace_invites' then
    perform public.assert_workspace_feature(wid, 'team', 'Team members require YardPilot Pro.');
  elsif tg_table_name = 'workspace_memberships' then
    if new.role <> 'owner' then
      perform public.assert_workspace_feature(wid, 'team', 'Team members require YardPilot Pro.');
    end if;
  elsif tg_table_name = 'schedule_events' then
    perform public.assert_workspace_feature(wid, 'schedule', 'Schedule requires YardPilot Pro.');
  elsif tg_table_name = 'follow_ups' then
    perform public.assert_workspace_feature(wid, 'followups', 'Follow-ups and reminders require YardPilot Pro.');
  elsif tg_table_name = 'projects' and tg_op = 'INSERT' then
    if jsonb_typeof(coalesce(new.job_sections, '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(new.job_sections, '[]'::jsonb)) > 1 then
      perform public.assert_workspace_feature(wid, 'multi_job_estimates', 'Multiple jobs per estimate require YardPilot Pro.');
    end if;
    if not public.workspace_has_feature(wid, 'unlimited_estimates') then
      select estimates_per_month into monthly_limit from public.billing_plans where plan_key = 'free';
      select count(*) into current_count from public.projects
      where workspace_id = wid and created_at >= date_trunc('month', now());
      if current_count >= monthly_limit then
        raise exception 'Free workspaces can create % estimates per month. Upgrade to Pro for unlimited estimates.', monthly_limit;
      end if;
    end if;
  elsif tg_table_name = 'projects' and tg_op = 'UPDATE' then
    if jsonb_typeof(coalesce(new.job_sections, '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(new.job_sections, '[]'::jsonb)) > 1
       and not public.workspace_has_feature(wid, 'multi_job_estimates') then
      raise exception 'Multiple jobs per estimate require YardPilot Pro.';
    end if;
  elsif tg_table_name = 'invoices' and tg_op = 'INSERT' then
    if not public.workspace_has_feature(wid, 'unlimited_invoices') then
      select invoices_per_month into monthly_limit from public.billing_plans where plan_key = 'free';
      select count(*) into current_count from public.invoices
      where workspace_id = wid and created_at >= date_trunc('month', now());
      if current_count >= monthly_limit then
        raise exception 'Free workspaces can create % invoices per month. Upgrade to Pro for unlimited invoices.', monthly_limit;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- Add/replace enforcement triggers. No business rows are deleted.
drop trigger if exists yardpilot_paywall_workspace_invites on public.workspace_invites;
create trigger yardpilot_paywall_workspace_invites before insert or update on public.workspace_invites
for each row execute function public.enforce_workspace_paywall();

drop trigger if exists yardpilot_paywall_workspace_memberships on public.workspace_memberships;
create trigger yardpilot_paywall_workspace_memberships before insert or update on public.workspace_memberships
for each row execute function public.enforce_workspace_paywall();

drop trigger if exists yardpilot_paywall_schedule_events on public.schedule_events;
create trigger yardpilot_paywall_schedule_events before insert or update or delete on public.schedule_events
for each row execute function public.enforce_workspace_paywall();

drop trigger if exists yardpilot_paywall_follow_ups on public.follow_ups;
create trigger yardpilot_paywall_follow_ups before insert or update or delete on public.follow_ups
for each row execute function public.enforce_workspace_paywall();

drop trigger if exists yardpilot_paywall_projects on public.projects;
create trigger yardpilot_paywall_projects before insert or update on public.projects
for each row execute function public.enforce_workspace_paywall();

drop trigger if exists yardpilot_paywall_invoices on public.invoices;
create trigger yardpilot_paywall_invoices before insert on public.invoices
for each row execute function public.enforce_workspace_paywall();

alter table public.billing_plans enable row level security;
alter table public.billing_plan_features enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.access_codes enable row level security;
alter table public.access_code_redemptions enable row level security;

revoke all on public.billing_plans, public.billing_plan_features, public.workspace_subscriptions, public.access_codes, public.access_code_redemptions from anon, authenticated;
grant select on public.billing_plans, public.billing_plan_features to authenticated;
grant select on public.workspace_subscriptions to service_role;
grant all on public.workspace_subscriptions, public.access_codes, public.access_code_redemptions to service_role;

commit;

-- Diagnostic: should return one row for every workspace.
select w.id, w.name, coalesce(ws.plan_key, 'free') as plan_key, coalesce(ws.subscription_status, 'free') as subscription_status
from public.workspaces w
left join public.workspace_subscriptions ws on ws.workspace_id = w.id
order by w.created_at;
