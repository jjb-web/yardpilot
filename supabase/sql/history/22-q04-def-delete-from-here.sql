-- YardPilot launch hardening v1
-- Forward-only migration for the latest subscription + marketplace build.
-- Run once after yardpilot-marketplace-visibility-rls-v2.sql.
-- No customer, estimate, invoice, marketplace, or payment rows are deleted.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. One identity, multiple YardPilot modes
-- ---------------------------------------------------------------------------

create table if not exists public.profile_modes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_enabled boolean not null default false,
  landscaper_enabled boolean not null default true,
  active_mode text not null default 'landscaper'
    check (active_mode in ('client', 'landscaper')),
  updated_at timestamptz not null default now()
);

insert into public.profile_modes(user_id, client_enabled, landscaper_enabled, active_mode)
select
  p.id,
  p.account_type = 'client',
  p.account_type <> 'client',
  case when p.account_type = 'client' then 'client' else 'landscaper' end
from public.profiles p
on conflict (user_id) do nothing;

alter table public.profile_modes enable row level security;
revoke all on public.profile_modes from anon, authenticated;
grant select, update on public.profile_modes to authenticated;
grant all on public.profile_modes to service_role;

drop policy if exists profile_modes_select_self on public.profile_modes;
create policy profile_modes_select_self
on public.profile_modes for select to authenticated
using (user_id = auth.uid());

drop policy if exists profile_modes_update_self on public.profile_modes;
create policy profile_modes_update_self
on public.profile_modes for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.get_my_profile_modes()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result jsonb;
  initial_mode text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select case when p.account_type = 'client' then 'client' else 'landscaper' end
  into initial_mode
  from public.profiles p
  where p.id = auth.uid();

  insert into public.profile_modes(user_id, client_enabled, landscaper_enabled, active_mode)
  values (
    auth.uid(),
    initial_mode = 'client',
    initial_mode <> 'client',
    coalesce(initial_mode, 'landscaper')
  )
  on conflict (user_id) do nothing;

  select jsonb_build_object(
    'clientEnabled', pm.client_enabled,
    'landscaperEnabled', pm.landscaper_enabled,
    'activeMode', pm.active_mode
  )
  into result
  from public.profile_modes pm
  where pm.user_id = auth.uid();

  return result;
end;
$$;

create or replace function public.enable_my_profile_mode(requested_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(requested_mode, '')));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if cleaned not in ('client', 'landscaper') then
    raise exception 'Mode must be client or landscaper.';
  end if;

  insert into public.profile_modes(user_id, client_enabled, landscaper_enabled, active_mode)
  values (auth.uid(), cleaned = 'client', cleaned = 'landscaper', cleaned)
  on conflict (user_id) do update set
    client_enabled = profile_modes.client_enabled or cleaned = 'client',
    landscaper_enabled = profile_modes.landscaper_enabled or cleaned = 'landscaper',
    updated_at = now();

  return public.get_my_profile_modes();
end;
$$;

create or replace function public.set_active_profile_mode(requested_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cleaned text := lower(trim(coalesce(requested_mode, '')));
  modes public.profile_modes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if cleaned not in ('client', 'landscaper') then
    raise exception 'Mode must be client or landscaper.';
  end if;

  perform public.enable_my_profile_mode(cleaned);

  select * into modes from public.profile_modes where user_id = auth.uid() for update;
  if cleaned = 'client' and not modes.client_enabled then
    raise exception 'Client mode is not enabled.';
  end if;
  if cleaned = 'landscaper' and not modes.landscaper_enabled then
    raise exception 'Landscaper mode is not enabled.';
  end if;

  update public.profile_modes
  set active_mode = cleaned, updated_at = now()
  where user_id = auth.uid();

  -- Keep the legacy profile field synchronized for older code and policies.
  update public.profiles
  set account_type = cleaned, updated_at = now()
  where id = auth.uid();

  return public.get_my_profile_modes();
end;
$$;

revoke all on function public.get_my_profile_modes() from public;
revoke all on function public.enable_my_profile_mode(text) from public;
revoke all on function public.set_active_profile_mode(text) from public;
grant execute on function public.get_my_profile_modes() to authenticated;
grant execute on function public.enable_my_profile_mode(text) to authenticated;
grant execute on function public.set_active_profile_mode(text) to authenticated;

create or replace function public.yardpilot_enable_landscaper_mode_from_membership()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.profile_modes(user_id, client_enabled, landscaper_enabled, active_mode)
  values (new.user_id, false, true, 'landscaper')
  on conflict (user_id) do update set
    landscaper_enabled = true,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.yardpilot_enable_landscaper_mode_from_membership() from public;
drop trigger if exists yardpilot_membership_enable_landscaper_mode on public.workspace_memberships;
create trigger yardpilot_membership_enable_landscaper_mode
after insert on public.workspace_memberships
for each row execute function public.yardpilot_enable_landscaper_mode_from_membership();

create or replace function public.yardpilot_enable_client_mode_from_request()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.profile_modes(user_id, client_enabled, landscaper_enabled, active_mode)
  values (new.client_user_id, true, false, 'client')
  on conflict (user_id) do update set
    client_enabled = true,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.yardpilot_enable_client_mode_from_request() from public;
drop trigger if exists yardpilot_request_enable_client_mode on public.client_job_requests;
create trigger yardpilot_request_enable_client_mode
after insert on public.client_job_requests
for each row execute function public.yardpilot_enable_client_mode_from_request();

-- ---------------------------------------------------------------------------
-- 2. Terms/privacy acceptance records
-- ---------------------------------------------------------------------------

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'registration',
  unique(user_id, terms_version, privacy_version)
);

alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
grant select, insert on public.legal_acceptances to authenticated;
grant all on public.legal_acceptances to service_role;

drop policy if exists legal_acceptances_select_self on public.legal_acceptances;
create policy legal_acceptances_select_self
on public.legal_acceptances for select to authenticated
using (user_id = auth.uid());

drop policy if exists legal_acceptances_insert_self on public.legal_acceptances;
create policy legal_acceptances_insert_self
on public.legal_acceptances for insert to authenticated
with check (user_id = auth.uid());

create or replace function public.accept_current_legal_documents(
  requested_terms_version text,
  requested_privacy_version text,
  requested_source text default 'app'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  acceptance_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if trim(coalesce(requested_terms_version, '')) = ''
     or trim(coalesce(requested_privacy_version, '')) = '' then
    raise exception 'Terms and privacy versions are required.';
  end if;

  insert into public.legal_acceptances(user_id, terms_version, privacy_version, source)
  values (
    auth.uid(),
    trim(requested_terms_version),
    trim(requested_privacy_version),
    left(trim(coalesce(requested_source, 'app')), 50)
  )
  on conflict (user_id, terms_version, privacy_version)
  do update set accepted_at = now(), source = excluded.source
  returning id into acceptance_id;

  return acceptance_id;
end;
$$;

revoke all on function public.accept_current_legal_documents(text,text,text) from public;
grant execute on function public.accept_current_legal_documents(text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notifications, preferences, audit trail, feature flags
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  message text not null default '',
  action_url text not null default '',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
on public.notifications(user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self
on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self
on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete_self on public.notifications;
create policy notifications_delete_self
on public.notifications for delete to authenticated
using (user_id = auth.uid());

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  marketplace_enabled boolean not null default true,
  estimate_enabled boolean not null default true,
  invoice_enabled boolean not null default true,
  team_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self
on public.notification_preferences for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_workspace_idx
on public.audit_log(workspace_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

drop policy if exists audit_log_manager_select on public.audit_log;
create policy audit_log_manager_select
on public.audit_log for select to authenticated
using (
  workspace_id is not null
  and public.marketplace_can_manage_workspace(workspace_id)
);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.feature_flags(key, enabled, description) values
  ('public_registration', true, 'Allow new public registrations'),
  ('marketplace_bidding', true, 'Allow clients and companies to submit marketplace requests and bids'),
  ('marketplace_hiring', true, 'Allow openings and applications'),
  ('browser_push', false, 'Reserved for a later browser-push release'),
  ('ai_assistant', false, 'Reserved for a later reviewed AI release'),
  ('real_payroll', false, 'Must remain disabled until payroll/legal integration is complete')
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;
grant all on public.feature_flags to service_role;

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read
on public.feature_flags for select to anon, authenticated
using (true);

create or replace function public.yardpilot_feature_enabled(requested_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.feature_flags where key = requested_key), false);
$$;
revoke all on function public.yardpilot_feature_enabled(text) from public;
grant execute on function public.yardpilot_feature_enabled(text) to anon, authenticated, service_role;

create or replace function public.yardpilot_notify_user(
  requested_user_id uuid,
  requested_workspace_id uuid,
  requested_type text,
  requested_title text,
  requested_message text default '',
  requested_action_url text default '',
  requested_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  notification_id uuid;
  allowed boolean := true;
begin
  if requested_user_id is null then return null; end if;

  select coalesce(
    np.in_app_enabled
    and case
      when requested_type like 'marketplace%' then np.marketplace_enabled
      when requested_type like 'estimate%' then np.estimate_enabled
      when requested_type like 'invoice%' then np.invoice_enabled
      when requested_type like 'team%' then np.team_enabled
      else true
    end,
    true
  )
  into allowed
  from public.notification_preferences np
  where np.user_id = requested_user_id;

  if not coalesce(allowed, true) then return null; end if;

  insert into public.notifications(
    user_id, workspace_id, type, title, message, action_url, data
  ) values (
    requested_user_id,
    requested_workspace_id,
    left(coalesce(nullif(trim(requested_type), ''), 'general'), 80),
    left(coalesce(nullif(trim(requested_title), ''), 'YardPilot update'), 160),
    left(coalesce(requested_message, ''), 1000),
    left(coalesce(requested_action_url, ''), 500),
    coalesce(requested_data, '{}'::jsonb)
  ) returning id into notification_id;

  return notification_id;
end;
$$;

create or replace function public.yardpilot_notify_workspace_managers(
  requested_workspace_id uuid,
  requested_type text,
  requested_title text,
  requested_message text default '',
  requested_action_url text default '',
  requested_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  member record;
  sent_count integer := 0;
begin
  for member in
    select wm.user_id
    from public.workspace_memberships wm
    where wm.workspace_id = requested_workspace_id
      and wm.role in ('owner', 'co_owner', 'manager')
  loop
    perform public.yardpilot_notify_user(
      member.user_id,
      requested_workspace_id,
      requested_type,
      requested_title,
      requested_message,
      requested_action_url,
      requested_data
    );
    sent_count := sent_count + 1;
  end loop;
  return sent_count;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.yardpilot_notify_user(uuid,uuid,text,text,text,text,jsonb) from public;
revoke all on function public.yardpilot_notify_workspace_managers(uuid,text,text,text,text,jsonb) from public;
revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Estimate internal approval workflow
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists internal_approval_status text,
  add column if not exists submitted_for_approval_at timestamptz,
  add column if not exists submitted_for_approval_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approval_notes text not null default '';

-- Preserve all pre-existing estimates as approved so launch hardening does not
-- unexpectedly block documents that were already in use.
update public.projects
set internal_approval_status = 'approved',
    approved_at = coalesce(approved_at, updated_at, created_at)
where internal_approval_status is null;

alter table public.projects
  alter column internal_approval_status set default 'draft',
  alter column internal_approval_status set not null;

alter table public.projects
  drop constraint if exists projects_internal_approval_status_check;
alter table public.projects
  add constraint projects_internal_approval_status_check
  check (internal_approval_status in ('draft', 'pending', 'approved', 'changes_requested'));

create or replace function public.submit_estimate_for_approval(requested_project_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  member_role text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;

  select * into project_row
  from public.projects
  where id::text = requested_project_id
  for update;

  if project_row.id is null then raise exception 'Estimate not found.'; end if;

  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = project_row.workspace_id and wm.user_id = auth.uid()
  limit 1;

  if member_role is null then raise exception 'You do not have access to this workspace.'; end if;
  if member_role = 'employee' and project_row.created_by <> auth.uid() then
    raise exception 'Employees may submit only estimates they created.';
  end if;
  if project_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be submitted for internal approval.';
  end if;
  if project_row.internal_approval_status = 'approved' then
    raise exception 'This estimate is already approved.';
  end if;

  update public.projects
  set internal_approval_status = 'pending',
      submitted_for_approval_at = now(),
      submitted_for_approval_by = auth.uid(),
      approved_at = null,
      approved_by = null,
      updated_at = now()
  where id = project_row.id;

  perform public.yardpilot_notify_workspace_managers(
    project_row.workspace_id,
    'estimate_approval',
    'Estimate awaiting approval',
    project_row.name || ' was submitted for internal approval.',
    '/app/estimates/' || project_row.id::text,
    jsonb_build_object('projectId', project_row.id, 'status', 'pending')
  );

  insert into public.audit_log(workspace_id, actor_user_id, action, entity_type, entity_id, details)
  values (project_row.workspace_id, auth.uid(), 'estimate_submitted_for_approval', 'project', project_row.id::text, '{}'::jsonb);

  return jsonb_build_object('projectId', project_row.id, 'status', 'pending');
end;
$$;

create or replace function public.review_estimate_approval(
  requested_project_id text,
  requested_decision text,
  requested_notes text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  member_role text;
  cleaned_decision text := lower(trim(coalesce(requested_decision, '')));
  new_status text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if cleaned_decision not in ('approve', 'changes_requested') then
    raise exception 'Decision must be approve or changes_requested.';
  end if;

  select * into project_row
  from public.projects
  where id::text = requested_project_id
  for update;
  if project_row.id is null then raise exception 'Estimate not found.'; end if;

  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = project_row.workspace_id and wm.user_id = auth.uid()
  limit 1;

  if member_role not in ('owner', 'co_owner', 'manager') then
    raise exception 'Only an owner, co-owner, or manager can approve estimates.';
  end if;

  new_status := case when cleaned_decision = 'approve' then 'approved' else 'changes_requested' end;

  update public.projects
  set internal_approval_status = new_status,
      approval_notes = left(trim(coalesce(requested_notes, '')), 3000),
      approved_at = case when new_status = 'approved' then now() else null end,
      approved_by = case when new_status = 'approved' then auth.uid() else null end,
      updated_at = now()
  where id = project_row.id;

  if project_row.created_by is not null then
    perform public.yardpilot_notify_user(
      project_row.created_by,
      project_row.workspace_id,
      'estimate_approval',
      case when new_status = 'approved' then 'Estimate approved' else 'Estimate needs changes' end,
      case when new_status = 'approved'
        then project_row.name || ' is approved and may be sent to the client.'
        else project_row.name || ' was returned with requested changes.'
      end,
      '/app/estimates/' || project_row.id::text,
      jsonb_build_object('projectId', project_row.id, 'status', new_status)
    );
  end if;

  insert into public.audit_log(workspace_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    project_row.workspace_id,
    auth.uid(),
    case when new_status = 'approved' then 'estimate_approved' else 'estimate_changes_requested' end,
    'project',
    project_row.id::text,
    jsonb_build_object('notes', left(trim(coalesce(requested_notes, '')), 3000))
  );

  return jsonb_build_object('projectId', project_row.id, 'status', new_status);
end;
$$;

revoke all on function public.submit_estimate_for_approval(text) from public;
revoke all on function public.review_estimate_approval(text,text,text) from public;
grant execute on function public.submit_estimate_for_approval(text) to authenticated;
grant execute on function public.review_estimate_approval(text,text,text) to authenticated;

create or replace function public.yardpilot_guard_estimate_approval()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  member_role text;
begin
  if (new.share_enabled = true or new.estimate_status in ('sent', 'accepted'))
     and new.internal_approval_status <> 'approved' then
    raise exception 'This estimate must be internally approved before it can be sent or accepted.';
  end if;

  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = new.workspace_id and wm.user_id = auth.uid()
  limit 1;

  if member_role = 'employee' then
    if new.created_by <> auth.uid() then
      raise exception 'Employees may edit only estimates they created.';
    end if;
    if new.estimate_status <> 'draft' or new.share_enabled then
      raise exception 'Employees may save drafts but cannot send estimates.';
    end if;
    if new.internal_approval_status not in ('draft', 'changes_requested') then
      raise exception 'Submit or wait for review before making further changes.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.yardpilot_guard_estimate_approval() from public;
drop trigger if exists yardpilot_guard_estimate_approval on public.projects;
create trigger yardpilot_guard_estimate_approval
before insert or update on public.projects
for each row execute function public.yardpilot_guard_estimate_approval();

-- Employee draft access. Existing manager policies remain unchanged and combine
-- permissively with these policies.
drop policy if exists yardpilot_employee_insert_estimate_draft on public.projects;
create policy yardpilot_employee_insert_estimate_draft
on public.projects for insert to authenticated
with check (
  created_by = auth.uid()
  and estimate_status = 'draft'
  and share_enabled = false
  and internal_approval_status in ('draft', 'changes_requested')
  and exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'employee'
  )
);

drop policy if exists yardpilot_employee_update_estimate_draft on public.projects;
create policy yardpilot_employee_update_estimate_draft
on public.projects for update to authenticated
using (
  created_by = auth.uid()
  and estimate_status = 'draft'
  and internal_approval_status in ('draft', 'changes_requested')
  and exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = projects.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'employee'
  )
)
with check (
  created_by = auth.uid()
  and estimate_status = 'draft'
  and share_enabled = false
  and internal_approval_status in ('draft', 'changes_requested')
);

create or replace function public.employee_can_view_project(
  requested_project_id text,
  requested_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.projects p
    join public.workspace_memberships wm
      on wm.workspace_id = p.workspace_id and wm.user_id = auth.uid()
    where p.id::text = requested_project_id
      and p.workspace_id = requested_workspace_id
      and wm.role = 'employee'
      and (
        (p.estimate_status = 'draft' and p.created_by = auth.uid())
        or (
          p.estimate_status = 'accepted'
          and exists (
            select 1 from public.project_assignments pa
            where pa.project_id = p.id and pa.user_id = auth.uid()
          )
        )
      )
  );
$$;
revoke all on function public.employee_can_view_project(text,uuid) from public;
grant execute on function public.employee_can_view_project(text,uuid) to authenticated;

-- Restrictive policy: even if an older permissive policy grants broad workspace
-- access, employees remain limited to their own estimate drafts and assigned jobs.
drop policy if exists yardpilot_projects_role_scope on public.projects;
create policy yardpilot_projects_role_scope
on public.projects
as restrictive
for select
to authenticated
using (
  public.workspace_role(workspace_id) in ('owner', 'co_owner', 'manager')
  or public.employee_can_view_project(id::text, workspace_id)
);

create or replace function public.get_employee_estimate_drafts(requested_workspace_id uuid)
returns setof public.projects
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.projects p
  where p.workspace_id = requested_workspace_id
    and p.created_by = auth.uid()
    and p.estimate_status = 'draft'
    and p.internal_approval_status in ('draft', 'pending', 'changes_requested', 'approved')
    and exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = requested_workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'employee'
    )
  order by p.updated_at desc;
$$;

revoke all on function public.get_employee_estimate_drafts(uuid) from public;
grant execute on function public.get_employee_estimate_drafts(uuid) to authenticated;

-- Employees must receive only assigned active/completed jobs. The old RPC may
-- still exist for compatibility, but the app switches to this strict RPC.
create or replace function public.get_employee_assigned_projects(requested_workspace_id uuid)
returns table (
  id text,
  user_id uuid,
  workspace_id uuid,
  created_by uuid,
  name text,
  client text,
  address text,
  city text,
  contact_id text,
  property_id text,
  status text,
  estimate_status text,
  estimate_number text,
  issue_date date,
  valid_until date,
  invoice_due_date date,
  project_type text,
  job_sections jsonb,
  billing_method text,
  square_footage numeric,
  labor_rate numeric,
  labor_hours numeric,
  line_items jsonb,
  estimate_summary text,
  scope_description text,
  client_notes text,
  terms text,
  tax_rate numeric,
  discount_amount numeric,
  total_estimate numeric,
  notes text,
  share_token uuid,
  share_enabled boolean,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  response_name text,
  response_message text,
  signature_data text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  follow_up_at timestamptz,
  assigned_member_ids uuid[],
  internal_approval_status text,
  submitted_for_approval_at timestamptz,
  submitted_for_approval_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  approval_notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.workspace_id,
    p.created_by,
    p.name,
    p.client,
    p.address,
    coalesce(p.city, ''),
    p.contact_id,
    p.property_id,
    p.status,
    p.estimate_status,
    p.estimate_number,
    p.issue_date,
    p.valid_until,
    p.invoice_due_date,
    p.project_type,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', coalesce(job ->> 'id', 'job-' || job_position::text),
            'title', coalesce(job ->> 'title', p.name),
            'projectType', coalesce(job ->> 'projectType', job ->> 'project_type', p.project_type),
            'scopeDescription', coalesce(job ->> 'scopeDescription', job ->> 'scope_description', ''),
            'internalNotes', coalesce(job ->> 'internalNotes', job ->> 'internal_notes', ''),
            'squareFootage', coalesce(nullif(coalesce(job ->> 'squareFootage', job ->> 'square_footage'), '')::numeric, 0),
            'pricePerSquareFoot', 0,
            'scheduledStart', coalesce(job -> 'scheduledStart', job -> 'scheduled_start', 'null'::jsonb),
            'scheduledEnd', coalesce(job -> 'scheduledEnd', job -> 'scheduled_end', 'null'::jsonb),
            'laborRate', 0,
            'laborHours', coalesce(nullif(coalesce(job ->> 'laborHours', job ->> 'labor_hours'), '')::numeric, 0),
            'laborAssignments', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'userId', coalesce(assignment ->> 'userId', assignment ->> 'user_id', ''),
                    'name', coalesce(assignment ->> 'name', 'Team member'),
                    'hours', coalesce(nullif(assignment ->> 'hours', '')::numeric, 0),
                    'hourlyRate', 0
                  )
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(coalesce(job -> 'laborAssignments', job -> 'labor_assignments', '[]'::jsonb)) = 'array'
                    then coalesce(job -> 'laborAssignments', job -> 'labor_assignments', '[]'::jsonb)
                    else '[]'::jsonb
                  end
                ) assignment
              ),
              '[]'::jsonb
            ),
            'lineItems', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', coalesce(item ->> 'id', 'item-' || item_position::text),
                    'itemType', coalesce(item ->> 'itemType', item ->> 'item_type', 'material'),
                    'description', coalesce(item ->> 'description', ''),
                    'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
                    'unit', coalesce(item ->> 'unit', 'flat'),
                    'unitCost', 0
                  )
                )
                from jsonb_array_elements(
                  case when jsonb_typeof(coalesce(job -> 'lineItems', job -> 'line_items', '[]'::jsonb)) = 'array'
                    then coalesce(job -> 'lineItems', job -> 'line_items', '[]'::jsonb)
                    else '[]'::jsonb end
                ) with ordinality as items(item, item_position)
              ),
              '[]'::jsonb
            ),
            'photoIds', case
              when jsonb_typeof(coalesce(job -> 'photoIds', job -> 'photo_ids', '[]'::jsonb)) = 'array'
              then coalesce(job -> 'photoIds', job -> 'photo_ids', '[]'::jsonb)
              else '[]'::jsonb end
          ) order by job_position
        )
        from jsonb_array_elements(
          case when jsonb_typeof(coalesce(p.job_sections, '[]'::jsonb)) = 'array'
            then coalesce(p.job_sections, '[]'::jsonb)
            else '[]'::jsonb end
        ) with ordinality as jobs(job, job_position)
      ),
      '[]'::jsonb
    ),
    coalesce(p.billing_method, 'fixed'),
    coalesce(p.square_footage, 0),
    0::numeric,
    coalesce(p.labor_hours, 0),
    '[]'::jsonb,
    null::text,
    coalesce(p.scope_description, ''),
    coalesce(p.client_notes, ''),
    ''::text,
    0::numeric,
    0::numeric,
    0::numeric,
    coalesce(p.notes, ''),
    p.share_token,
    false,
    null::timestamptz,
    null::timestamptz,
    null::timestamptz,
    p.accepted_at,
    null::timestamptz,
    ''::text,
    ''::text,
    ''::text,
    p.scheduled_start,
    p.scheduled_end,
    p.follow_up_at,
    array(
      select pa.user_id from public.project_assignments pa
      where pa.project_id = p.id order by pa.created_at
    ),
    p.internal_approval_status,
    p.submitted_for_approval_at,
    p.submitted_for_approval_by,
    p.approved_at,
    p.approved_by,
    p.approval_notes,
    p.created_at,
    p.updated_at
  from public.projects p
  where p.workspace_id = requested_workspace_id
    and public.workspace_role(requested_workspace_id) = 'employee'
    and p.estimate_status = 'accepted'
    and exists (
      select 1 from public.project_assignments assigned
      where assigned.project_id = p.id and assigned.user_id = auth.uid()
    )
  order by case when p.status = 'active' then 0 else 1 end,
           coalesce(p.scheduled_start, p.updated_at) desc;
$$;

revoke all on function public.get_employee_assigned_projects(uuid) from public;
grant execute on function public.get_employee_assigned_projects(uuid) to authenticated;

-- Stop the old self-claim behavior. Assignment is now manager controlled.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'employee_claim_project'
  loop
    execute format('revoke execute on function %s from authenticated', fn.signature);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Marketplace integrity, verification fields, notifications
-- ---------------------------------------------------------------------------

-- At most one accepted bid per request. Stop with a clear message rather than
-- silently changing marketplace history when pre-existing duplicate awards exist.
do $$
begin
  if exists (
    select 1
    from public.client_job_bids
    where status = 'accepted'
    group by request_id
    having count(*) > 1
  ) then
    raise exception 'Launch hardening stopped: one or more client requests already have multiple accepted bids. Resolve those records before rerunning this migration.';
  end if;
end
$$;

create unique index if not exists client_job_bids_one_accepted_per_request
on public.client_job_bids(request_id)
where status = 'accepted';

alter table public.marketplace_business_profiles
  add column if not exists entity_type text not null default 'unverified',
  add column if not exists legal_business_name text not null default '',
  add column if not exists formation_state text not null default '',
  add column if not exists registry_number text not null default '',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verification_source text not null default '';

alter table public.marketplace_business_profiles
  drop constraint if exists marketplace_business_verification_status_check;
alter table public.marketplace_business_profiles
  add constraint marketplace_business_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified_active_registration', 'could_not_verify', 'expired', 'rejected'));

drop function if exists public.search_marketplace_businesses(text,text,text,text,integer,integer);
create function public.search_marketplace_businesses(
  search_query text default '',
  requested_city text default '',
  requested_state text default '',
  requested_service text default '',
  page_size integer default 20,
  page_offset integer default 0
)
returns table (
  workspace_id uuid,
  display_name text,
  headline text,
  description text,
  services text[],
  city text,
  state text,
  postal_code text,
  service_radius_miles integer,
  accepting_client_work boolean,
  hiring boolean,
  availability_note text,
  website_url text,
  public_email text,
  public_phone text,
  entity_type text,
  legal_business_name text,
  formation_state text,
  registry_number text,
  verification_status text,
  verified_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bp.workspace_id, bp.display_name, bp.headline, bp.description, bp.services,
    bp.city, bp.state, bp.postal_code, bp.service_radius_miles,
    bp.accepting_client_work, bp.hiring, bp.availability_note,
    bp.website_url, bp.public_email, bp.public_phone,
    bp.entity_type, bp.legal_business_name, bp.formation_state,
    bp.registry_number, bp.verification_status, bp.verified_at,
    bp.updated_at, count(*) over() as total_count
  from public.marketplace_business_profiles bp
  where auth.uid() is not null
    and bp.published = true
    and (trim(coalesce(requested_city, '')) = '' or lower(bp.city) = lower(trim(requested_city)))
    and (trim(coalesce(requested_state, '')) = '' or lower(bp.state) = lower(trim(requested_state)))
    and (
      trim(coalesce(requested_service, '')) = ''
      or exists (select 1 from unnest(bp.services) service where service ilike '%' || trim(requested_service) || '%')
    )
    and (
      trim(coalesce(search_query, '')) = ''
      or bp.display_name ilike '%' || trim(search_query) || '%'
      or bp.headline ilike '%' || trim(search_query) || '%'
      or bp.description ilike '%' || trim(search_query) || '%'
      or exists (select 1 from unnest(bp.services) service where service ilike '%' || trim(search_query) || '%')
    )
  order by
    (bp.verification_status = 'verified_active_registration') desc,
    bp.accepting_client_work desc,
    bp.hiring desc,
    bp.updated_at desc
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset greatest(coalesce(page_offset, 0), 0);
$$;
revoke all on function public.search_marketplace_businesses(text,text,text,text,integer,integer) from public;
grant execute on function public.search_marketplace_businesses(text,text,text,text,integer,integer) to authenticated;

create or replace function public.set_marketplace_business_verification(
  requested_workspace_id uuid,
  requested_entity_type text,
  requested_legal_business_name text,
  requested_formation_state text,
  requested_registry_number text,
  requested_status text,
  requested_source text default 'manual registry review'
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()) then
    raise exception 'Platform administrator access is required.';
  end if;
  if requested_status not in ('unverified', 'pending', 'verified_active_registration', 'could_not_verify', 'expired', 'rejected') then
    raise exception 'Invalid verification status.';
  end if;
  update public.marketplace_business_profiles
  set entity_type = left(trim(coalesce(requested_entity_type, 'unverified')), 80),
      legal_business_name = left(trim(coalesce(requested_legal_business_name, '')), 200),
      formation_state = upper(left(trim(coalesce(requested_formation_state, '')), 2)),
      registry_number = left(trim(coalesce(requested_registry_number, '')), 100),
      verification_status = requested_status,
      verified_at = case when requested_status = 'verified_active_registration' then now() else null end,
      verification_source = left(trim(coalesce(requested_source, 'manual registry review')), 300),
      updated_at = now()
  where workspace_id = requested_workspace_id;
  if not found then raise exception 'Marketplace business profile not found.'; end if;
end;
$$;
revoke all on function public.set_marketplace_business_verification(uuid,text,text,text,text,text,text) from public;
grant execute on function public.set_marketplace_business_verification(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.yardpilot_marketplace_bid_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  request_row public.client_job_requests%rowtype;
  business_name text;
begin
  if tg_op = 'INSERT' then
    select * into request_row from public.client_job_requests where id = new.request_id;
    select bp.display_name into business_name
    from public.marketplace_business_profiles bp where bp.workspace_id = new.workspace_id;

    perform public.yardpilot_notify_user(
      request_row.client_user_id,
      new.workspace_id,
      'marketplace_bid',
      'New bid received',
      coalesce(nullif(business_name, ''), 'A landscaping company') || ' submitted a bid for ' || request_row.title || '.',
      '/client/requests',
      jsonb_build_object('requestId', new.request_id, 'bidId', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.yardpilot_marketplace_bid_notification() from public;
drop trigger if exists yardpilot_marketplace_bid_notification on public.client_job_bids;
create trigger yardpilot_marketplace_bid_notification
after insert on public.client_job_bids
for each row execute function public.yardpilot_marketplace_bid_notification();


create or replace function public.yardpilot_marketplace_application_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  opening_row record;
begin
  select jo.workspace_id, jo.title into opening_row
  from public.marketplace_job_openings jo where jo.id = new.opening_id;
  if opening_row.workspace_id is not null then
    perform public.yardpilot_notify_workspace_managers(
      opening_row.workspace_id,
      'marketplace_application',
      'New job application',
      'A worker applied for ' || coalesce(opening_row.title, 'your opening') || '.',
      '/app/marketplace?tab=applications',
      jsonb_build_object('applicationId', new.id, 'openingId', new.opening_id)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.yardpilot_marketplace_application_notification() from public;
drop trigger if exists yardpilot_marketplace_application_notification on public.marketplace_job_applications;
create trigger yardpilot_marketplace_application_notification
after insert on public.marketplace_job_applications
for each row execute function public.yardpilot_marketplace_application_notification();


create or replace function public.yardpilot_marketplace_status_notifications()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  request_row record;
  opening_row record;
begin
  if tg_table_name = 'client_job_bids' and old.status is distinct from new.status and new.status = 'accepted' then
    select r.title into request_row from public.client_job_requests r where r.id = new.request_id;
    perform public.yardpilot_notify_workspace_managers(
      new.workspace_id,
      'marketplace_bid_accepted',
      'Your bid was accepted',
      'A client accepted your bid for ' || coalesce(request_row.title, 'a marketplace project') || '.',
      '/app/marketplace?tab=bidding',
      jsonb_build_object('requestId', new.request_id, 'bidId', new.id)
    );
  elsif tg_table_name = 'marketplace_job_applications' and old.status is distinct from new.status then
    select jo.title into opening_row from public.marketplace_job_openings jo where jo.id = new.opening_id;
    perform public.yardpilot_notify_user(
      new.applicant_user_id,
      null,
      'team_application_status',
      case when new.status = 'approved' then 'Application approved' when new.status = 'rejected' then 'Application update' else 'Application status changed' end,
      'Your application for ' || coalesce(opening_row.title, 'a landscaping opening') || ' is now ' || replace(new.status, '_', ' ') || '.',
      '/app/marketplace?tab=hiring',
      jsonb_build_object('applicationId', new.id, 'openingId', new.opening_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.yardpilot_marketplace_status_notifications() from public;
drop trigger if exists yardpilot_bid_status_notification on public.client_job_bids;
create trigger yardpilot_bid_status_notification
after update of status on public.client_job_bids
for each row execute function public.yardpilot_marketplace_status_notifications();
drop trigger if exists yardpilot_application_status_notification on public.marketplace_job_applications;
create trigger yardpilot_application_status_notification
after update of status on public.marketplace_job_applications
for each row execute function public.yardpilot_marketplace_status_notifications();

create or replace function public.yardpilot_project_notifications()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'project_assignments' then
    perform public.yardpilot_notify_user(
      new.user_id,
      new.workspace_id,
      'team_job_assignment',
      'New job assignment',
      'You were assigned to a YardPilot job.',
      '/app/projects/current',
      jsonb_build_object('projectId', new.project_id)
    );
    return new;
  end if;

  if tg_table_name = 'projects'
     and old.estimate_status is distinct from new.estimate_status
     and new.estimate_status = 'accepted' then
    perform public.yardpilot_notify_workspace_managers(
      new.workspace_id,
      'estimate_customer_accepted',
      'Estimate accepted by customer',
      new.name || ' was accepted by the customer.',
      '/app/estimates/' || new.id::text,
      jsonb_build_object('projectId', new.id)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.yardpilot_project_notifications() from public;
drop trigger if exists yardpilot_assignment_notification on public.project_assignments;
create trigger yardpilot_assignment_notification
after insert on public.project_assignments
for each row execute function public.yardpilot_project_notifications();
drop trigger if exists yardpilot_estimate_customer_accept_notification on public.projects;
create trigger yardpilot_estimate_customer_accept_notification
after update of estimate_status on public.projects
for each row execute function public.yardpilot_project_notifications();

create or replace function public.yardpilot_invoice_paid_notification()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if (coalesce(old.payment_status, '') <> 'paid' and coalesce(new.payment_status, '') = 'paid')
     or (old.paid_at is null and new.paid_at is not null) then
    perform public.yardpilot_notify_workspace_managers(
      new.workspace_id,
      'invoice_paid',
      'Invoice paid',
      'Invoice ' || new.invoice_number || ' has been marked paid.',
      '/app/invoices/' || new.id::text,
      jsonb_build_object('invoiceId', new.id, 'amount', new.amount)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.yardpilot_invoice_paid_notification() from public;
drop trigger if exists yardpilot_invoice_paid_notification on public.invoices;
create trigger yardpilot_invoice_paid_notification
after update on public.invoices
for each row execute function public.yardpilot_invoice_paid_notification();

-- ---------------------------------------------------------------------------
-- 6. Feedback, support, error reporting, waitlist, rate limiting
-- ---------------------------------------------------------------------------

alter table public.feedback_submissions
  add column if not exists route text not null default '',
  add column if not exists app_version text not null default '',
  add column if not exists browser_summary text not null default '',
  add column if not exists allow_contact boolean not null default true;

create table if not exists public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  message text not null,
  stack text not null default '',
  route text not null default '',
  app_version text not null default '',
  browser_summary text not null default '',
  created_at timestamptz not null default now()
);

alter table public.client_error_reports enable row level security;
revoke all on public.client_error_reports from anon, authenticated;
grant insert, select on public.client_error_reports to authenticated;
grant all on public.client_error_reports to service_role;

drop policy if exists client_error_reports_insert_self on public.client_error_reports;
create policy client_error_reports_insert_self
on public.client_error_reports for insert to authenticated
with check (user_id = auth.uid() or user_id is null);

drop policy if exists client_error_reports_select_self on public.client_error_reports;
create policy client_error_reports_select_self
on public.client_error_reports for select to authenticated
using (user_id = auth.uid());

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  subject text not null,
  message text not null,
  source text not null default 'contact_page',
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved', 'spam')),
  created_at timestamptz not null default now()
);

create table if not exists public.interest_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'landing_page',
  created_at timestamptz not null default now()
);
create unique index if not exists interest_signups_email_unique
on public.interest_signups(lower(email));

alter table public.support_messages enable row level security;
alter table public.interest_signups enable row level security;
revoke all on public.support_messages, public.interest_signups from anon, authenticated;
grant all on public.support_messages, public.interest_signups to service_role;

create table if not exists public.public_request_limits (
  key_hash text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key(key_hash, action, window_start)
);
revoke all on public.public_request_limits from anon, authenticated;
grant all on public.public_request_limits to service_role;

create or replace function public.consume_public_rate_limit(
  requested_key_hash text,
  requested_action text,
  requested_limit integer,
  requested_window_minutes integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  window_value timestamptz;
  new_count integer;
begin
  window_value := date_trunc('minute', now())
    - make_interval(mins => mod(extract(minute from now())::integer, greatest(requested_window_minutes, 1)));

  insert into public.public_request_limits(key_hash, action, window_start, request_count)
  values (requested_key_hash, requested_action, window_value, 1)
  on conflict (key_hash, action, window_start)
  do update set request_count = public.public_request_limits.request_count + 1
  returning request_count into new_count;

  return new_count <= greatest(requested_limit, 1);
end;
$$;
revoke all on function public.consume_public_rate_limit(text,text,integer,integer) from public;
grant execute on function public.consume_public_rate_limit(text,text,integer,integer) to service_role;

-- Store actionable subscription billing issues for the Billing page.
alter table public.workspace_subscriptions
  add column if not exists billing_issue_code text not null default '',
  add column if not exists billing_issue_message text not null default '';


-- Permanent correction for earlier billing/paywall functions that perform writes.
do $$
begin
  if to_regprocedure('public.enforce_workspace_paywall()') is not null then
    execute 'alter function public.enforce_workspace_paywall() volatile';
  end if;
end
$$;

create or replace function public.get_workspace_billing_status(requested_workspace_id uuid)
returns jsonb
language plpgsql
volatile
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
    'billing_issue_code', ws.billing_issue_code,
    'billing_issue_message', ws.billing_issue_message,
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
      'estimates_this_month', (select count(*) from public.projects p where p.workspace_id = requested_workspace_id and p.created_at >= date_trunc('month', now())),
      'invoices_this_month', (select count(*) from public.invoices i where i.workspace_id = requested_workspace_id and i.created_at >= date_trunc('month', now()))
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

-- Stripe webhook idempotency store. Both billing and Connect webhooks can use it.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text not null default ''
);

alter table public.stripe_webhook_events
  add column if not exists status text not null default 'processing',
  add column if not exists attempts integer not null default 1,
  add column if not exists claimed_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text not null default '';

revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.stripe_webhook_events to service_role;

create or replace function public.claim_stripe_webhook_event(
  requested_event_id text,
  requested_event_type text,
  requested_livemode boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  existing_status text;
  existing_claimed_at timestamptz;
begin
  select status, claimed_at into existing_status, existing_claimed_at
  from public.stripe_webhook_events
  where event_id = requested_event_id
  for update;

  if found then
    if existing_status = 'processed' then return false; end if;
    if existing_status = 'processing' and existing_claimed_at > now() - interval '10 minutes' then
      return false;
    end if;
    update public.stripe_webhook_events
    set status = 'processing', attempts = attempts + 1, claimed_at = now(), last_error = ''
    where event_id = requested_event_id;
    return true;
  end if;

  insert into public.stripe_webhook_events(event_id, event_type, livemode)
  values (requested_event_id, requested_event_type, requested_livemode);
  return true;
end;
$$;

create or replace function public.finish_stripe_webhook_event(
  requested_event_id text,
  requested_success boolean,
  requested_error text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.stripe_webhook_events
  set status = case when requested_success then 'processed' else 'failed' end,
      completed_at = now(),
      last_error = left(coalesce(requested_error, ''), 2000)
  where event_id = requested_event_id;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text,text,boolean) from public;
revoke all on function public.finish_stripe_webhook_event(text,boolean,text) from public;
grant execute on function public.claim_stripe_webhook_event(text,text,boolean) to service_role;
grant execute on function public.finish_stripe_webhook_event(text,boolean,text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Resume storage policy hardening
-- ---------------------------------------------------------------------------

-- Applicants can manage only files under their own auth-user folder.
drop policy if exists marketplace_resume_insert_own on storage.objects;
create policy marketplace_resume_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_resume_update_own on storage.objects;
create policy marketplace_resume_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_resume_delete_own on storage.objects;
create policy marketplace_resume_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Emergency marketplace switches are also enforced at the database write layer.
-- Turning a flag off does not delete or hide existing records.
drop policy if exists client_requests_insert_owner on public.client_job_requests;
create policy client_requests_insert_owner
on public.client_job_requests for insert to authenticated
with check (
  public.yardpilot_feature_enabled('marketplace_bidding')
  and client_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'client'
  )
);

drop policy if exists client_bids_insert_workspace_manager on public.client_job_bids;
create policy client_bids_insert_workspace_manager
on public.client_job_bids for insert to authenticated
with check (
  public.yardpilot_feature_enabled('marketplace_bidding')
  and submitted_by = auth.uid()
  and public.marketplace_can_manage_workspace(workspace_id)
  and public.marketplace_request_is_open(request_id)
  and exists (
    select 1 from public.marketplace_business_profiles bp
    where bp.workspace_id = client_job_bids.workspace_id
      and bp.published = true
      and bp.accepting_client_work = true
  )
);

drop policy if exists marketplace_openings_insert_manager on public.marketplace_job_openings;
create policy marketplace_openings_insert_manager
on public.marketplace_job_openings for insert to authenticated
with check (
  public.yardpilot_feature_enabled('marketplace_hiring')
  and public.marketplace_can_manage_workspace(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists marketplace_applications_insert_applicant on public.marketplace_job_applications;
create policy marketplace_applications_insert_applicant
on public.marketplace_job_applications for insert to authenticated
with check (
  public.yardpilot_feature_enabled('marketplace_hiring')
  and applicant_user_id = auth.uid()
  and public.marketplace_user_has_landscaper_access()
  and exists (
    select 1 from public.marketplace_job_openings o
    where o.id = marketplace_job_applications.opening_id
      and o.workspace_id = marketplace_job_applications.workspace_id
      and o.active = true
      and (o.expires_at is null or o.expires_at > now())
  )
);

commit;

-- Diagnostics
select 'launch hardening migration complete' as result;
