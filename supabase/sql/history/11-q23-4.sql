-- YardPilot profile permissions + Stripe server-role permissions
-- Safe to re-run.
--
-- This fixes the browser error:
--   permission denied for table profiles
--
-- It also ensures the Edge Function's service_role client can read membership
-- records and update Stripe status on workspaces.

begin;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- The browser loads only the signed-in user's own profile.
grant select on table public.profiles to authenticated;

-- Edge Functions using SUPABASE_SERVICE_ROLE_KEY need these privileges.
grant select on table public.profiles to service_role;
grant select on table public.workspace_memberships to service_role;
grant select, update on table public.workspaces to service_role;

alter table public.profiles enable row level security;

drop policy if exists "YardPilot users can read their own profile"
  on public.profiles;

create policy "YardPilot users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

commit;

-- Result 1: verify table privileges.
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'workspace_memberships', 'workspaces')
  and grantee in ('authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- Result 2: list the exact membership roles stored in the database.
-- Compare workspace_id and membership_email with the browser Network request.
select
  w.id as workspace_id,
  w.name as workspace_name,
  w.kind as workspace_kind,
  w.created_by as workspace_creator_id,
  creator.email as workspace_creator_email,
  wm.user_id as membership_user_id,
  member.email as membership_email,
  wm.role as actual_permission_role,
  wm.position_title,
  (wm.user_id = w.created_by) as membership_is_creator,
  w.stripe_account_id,
  w.stripe_onboarding_complete,
  w.stripe_charges_enabled,
  w.stripe_payouts_enabled
from public.workspaces w
left join public.workspace_memberships wm
  on wm.workspace_id = w.id
left join auth.users creator
  on creator.id = w.created_by
left join auth.users member
  on member.id = wm.user_id
order by w.name, wm.created_at;
