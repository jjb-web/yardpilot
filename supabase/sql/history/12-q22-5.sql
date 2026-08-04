-- YardPilot Stripe Connect: full-dashboard/direct-charge configuration.
-- Safe to re-run after the existing YardPilot lifecycle and payments SQL.
-- This migration does not contain Stripe or Supabase secret keys.

begin;

alter table public.workspaces
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

create unique index if not exists workspaces_stripe_account_unique_idx
  on public.workspaces(stripe_account_id)
  where stripe_account_id is not null;

alter table public.invoices
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text not null default '',
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists currency text not null default 'usd',
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.invoices
  drop constraint if exists invoices_payment_status_check;

alter table public.invoices
  add constraint invoices_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'failed', 'refunded'));

alter table public.invoices
  drop constraint if exists invoices_currency_check;

alter table public.invoices
  add constraint invoices_currency_check
  check (currency ~ '^[a-z]{3}$');

create unique index if not exists invoices_stripe_checkout_session_unique_idx
  on public.invoices(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- The job title "Owner" is not an authorization role. Repair existing creator
-- memberships so the actual workspace_memberships.role is owner.
update public.workspace_memberships wm
set
  role = 'owner',
  position_title = coalesce(nullif(trim(wm.position_title), ''), 'Owner')
from public.workspaces w
where wm.workspace_id = w.id
  and wm.user_id = w.created_by
  and wm.role is distinct from 'owner';

-- Browser access to each user's own profile.
grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "YardPilot users can read their own profile" on public.profiles;
drop policy if exists "YardPilot users can insert their own profile" on public.profiles;
drop policy if exists "YardPilot users can update their own profile" on public.profiles;

create policy "YardPilot users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "YardPilot users can insert their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "YardPilot users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Server-side Edge Functions use the service role. These explicit grants prevent
-- a table-level permission error from being misreported as a workspace-role error.
grant usage on schema public to service_role;
grant select on table public.profiles to service_role;
grant select on table public.workspace_memberships to service_role;
grant select, update on table public.workspaces to service_role;
grant select, update on table public.invoices to service_role;
grant select on table public.contacts to service_role;

-- Recreate the workspace RPC so the frontend always receives the real database
-- role and current Stripe readiness flags.
drop function if exists public.get_my_workspaces();

create function public.get_my_workspaces()
returns table (
  id uuid,
  name text,
  slug text,
  kind text,
  is_personal boolean,
  created_by uuid,
  role text,
  stripe_account_id text,
  stripe_onboarding_complete boolean,
  stripe_charges_enabled boolean,
  stripe_payouts_enabled boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.slug,
    w.kind,
    w.is_personal,
    w.created_by,
    wm.role,
    w.stripe_account_id,
    w.stripe_onboarding_complete,
    w.stripe_charges_enabled,
    w.stripe_payouts_enabled,
    w.created_at
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid()
  order by
    case when w.is_personal then 1 else 0 end,
    case wm.role
      when 'owner' then 0
      when 'co_owner' then 1
      when 'manager' then 2
      else 3
    end,
    w.created_at;
$$;

revoke all on function public.get_my_workspaces() from public;
grant execute on function public.get_my_workspaces() to authenticated;

commit;

-- Diagnostic result: returning rows here is expected.
select
  w.id as workspace_id,
  w.name as workspace_name,
  w.kind,
  w.created_by as creator_user_id,
  creator.email as creator_email,
  wm.user_id as membership_user_id,
  member.email as membership_email,
  wm.role as actual_permission_role,
  wm.position_title,
  w.stripe_account_id,
  w.stripe_onboarding_complete,
  w.stripe_charges_enabled,
  w.stripe_payouts_enabled
from public.workspaces w
left join public.workspace_memberships wm on wm.workspace_id = w.id
left join auth.users creator on creator.id = w.created_by
left join auth.users member on member.id = wm.user_id
order by w.name, wm.created_at;
