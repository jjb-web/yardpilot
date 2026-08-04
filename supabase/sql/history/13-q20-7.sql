-- YardPilot Stripe onboarding status and up-front collection support.
-- Run after the previous YardPilot Stripe Connect migration.
-- Safe to re-run. This migration contains no secret keys.

begin;

alter table public.workspaces
  add column if not exists stripe_currently_due text[] not null default array[]::text[],
  add column if not exists stripe_eventually_due text[] not null default array[]::text[],
  add column if not exists stripe_past_due text[] not null default array[]::text[],
  add column if not exists stripe_pending_verification text[] not null default array[]::text[],
  add column if not exists stripe_disabled_reason text,
  add column if not exists stripe_requirement_errors jsonb not null default '[]'::jsonb,
  add column if not exists stripe_future_currently_due text[] not null default array[]::text[],
  add column if not exists stripe_future_eventually_due text[] not null default array[]::text[],
  add column if not exists stripe_future_past_due text[] not null default array[]::text[],
  add column if not exists stripe_future_pending_verification text[] not null default array[]::text[],
  add column if not exists stripe_future_disabled_reason text,
  add column if not exists stripe_status_synced_at timestamptz;

grant select, update on table public.workspaces to service_role;

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
  stripe_currently_due text[],
  stripe_eventually_due text[],
  stripe_past_due text[],
  stripe_pending_verification text[],
  stripe_disabled_reason text,
  stripe_requirement_errors jsonb,
  stripe_future_currently_due text[],
  stripe_future_eventually_due text[],
  stripe_future_past_due text[],
  stripe_future_pending_verification text[],
  stripe_future_disabled_reason text,
  stripe_status_synced_at timestamptz,
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
    w.stripe_currently_due,
    w.stripe_eventually_due,
    w.stripe_past_due,
    w.stripe_pending_verification,
    w.stripe_disabled_reason,
    w.stripe_requirement_errors,
    w.stripe_future_currently_due,
    w.stripe_future_eventually_due,
    w.stripe_future_past_due,
    w.stripe_future_pending_verification,
    w.stripe_future_disabled_reason,
    w.stripe_status_synced_at,
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

-- Diagnostic result. Returning rows is expected.
select
  name,
  stripe_account_id,
  stripe_onboarding_complete,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_currently_due,
  stripe_past_due,
  stripe_pending_verification,
  stripe_disabled_reason,
  stripe_status_synced_at
from public.workspaces
where stripe_account_id is not null
order by updated_at desc;
