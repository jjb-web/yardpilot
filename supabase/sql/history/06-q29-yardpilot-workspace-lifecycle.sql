-- YardPilot workspace, labor, estimate-response, and mobile workflow upgrade.
-- Run AFTER:
--   1. yardpilot-estimates-properties-darkmode.sql
--   2. yardpilot-operations-team.sql
-- This migration is designed to be re-runnable.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Personal workspaces, unique company workspaces, and expanded roles.
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists kind text,
  add column if not exists slug text;

update public.workspaces
set kind = case when is_personal then 'personal' else 'company' end
where kind is null;

alter table public.workspaces
  alter column kind set default 'company',
  alter column kind set not null;

alter table public.workspaces
  drop constraint if exists workspaces_kind_check;

alter table public.workspaces
  add constraint workspaces_kind_check
  check (kind in ('personal', 'company'));

-- A personal workspace is an individual's private workspace. It is no longer
-- named from profile.company, so joining an employer does not make the person
-- look like the owner of that employer.
update public.workspaces w
set name = coalesce(
  nullif(trim(p.full_name), '') || '''s workspace',
  nullif(split_part(coalesce(p.email, ''), '@', 1), '') || '''s workspace',
  'Personal workspace'
),
kind = 'personal',
is_personal = true,
updated_at = now()
from public.profiles p
where w.created_by = p.id
  and w.is_personal = true;

-- Make existing company names unique before installing the unique index.
-- The comparison ignores capitalization, spaces, and punctuation, so names such
-- as "Johns Lawn" and "John's Lawn" cannot be claimed as separate companies.
with ranked as (
  select
    id,
    row_number() over (
      partition by regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g')
      order by created_at, id
    ) as position
  from public.workspaces
  where kind = 'company'
)
update public.workspaces w
set name = w.name || ' ' || left(w.id::text, 6)
from ranked r
where w.id = r.id
  and r.position > 1;

drop index if exists public.workspaces_company_name_unique_idx;
create unique index workspaces_company_name_unique_idx
  on public.workspaces (
    regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g')
  )
  where kind = 'company';

-- Generate stable URL-safe slugs. The short id suffix guarantees uniqueness.
update public.workspaces
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
           || '-' || left(id::text, 8)
where slug is null or trim(slug) = '';

alter table public.workspaces
  alter column slug set not null;

create unique index if not exists workspaces_slug_unique_idx
  on public.workspaces(slug);

-- Migrate the old Partner label to Co-owner. Drop the old constraints first,
-- because they do not yet allow the new co_owner and manager values.
alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_role_check;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_role_check;

update public.workspace_memberships
set role = 'co_owner'
where role = 'partner';

update public.workspace_invites
set role = 'co_owner'
where role = 'partner';

alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_role_check;

alter table public.workspace_memberships
  add constraint workspace_memberships_role_check
  check (role in ('owner', 'co_owner', 'manager', 'employee'));

alter table public.workspace_invites
  drop constraint if exists workspace_invites_role_check;

alter table public.workspace_invites
  add constraint workspace_invites_role_check
  check (role in ('co_owner', 'manager', 'employee'));

alter table public.workspace_memberships
  add column if not exists position_title text not null default '',
  add column if not exists hourly_rate numeric not null default 0;

alter table public.workspace_memberships
  drop constraint if exists workspace_memberships_hourly_rate_check;

alter table public.workspace_memberships
  add constraint workspace_memberships_hourly_rate_check
  check (hourly_rate >= 0);

create or replace function public.ensure_personal_workspace(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
  workspace_name text;
begin
  select id into result_id
  from public.workspaces
  where created_by = target_user_id
    and is_personal = true
  limit 1;

  select coalesce(
    nullif(trim(full_name), '') || '''s workspace',
    nullif(split_part(coalesce(email, ''), '@', 1), '') || '''s workspace',
    'Personal workspace'
  )
  into workspace_name
  from public.profiles
  where id = target_user_id;

  if result_id is null then
    insert into public.workspaces (
      name,
      slug,
      created_by,
      is_personal,
      kind
    )
    values (
      coalesce(workspace_name, 'Personal workspace'),
      'personal-' || left(target_user_id::text, 8),
      target_user_id,
      true,
      'personal'
    )
    returning id into result_id;
  else
    update public.workspaces
    set
      name = coalesce(workspace_name, name),
      kind = 'personal',
      is_personal = true,
      slug = coalesce(nullif(slug, ''), 'personal-' || left(target_user_id::text, 8)),
      updated_at = now()
    where id = result_id;
  end if;

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    position_title
  )
  values (result_id, target_user_id, 'owner', 'Owner')
  on conflict (workspace_id, user_id) do update
    set role = 'owner';

  return result_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(uuid) from public;

-- Keep profile creation and personal-workspace creation together. The optional
-- profile business name is descriptive only; it never claims a company.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    phone,
    full_name,
    company
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    coalesce(new.raw_user_meta_data ->> 'company', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    company = coalesce(nullif(excluded.company, ''), public.profiles.company);

  perform public.ensure_personal_workspace(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Ensure current users also have a personal workspace with the new naming rule.
do $$
declare
  account record;
begin
  for account in select id from auth.users loop
    perform public.ensure_personal_workspace(account.id);
  end loop;
end
$$;

create or replace function public.can_manage_workspace(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.workspace_role(requested_workspace_id)
      in ('owner', 'co_owner', 'manager'),
    false
  );
$$;

create or replace function public.can_admin_workspace(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.workspace_role(requested_workspace_id)
      in ('owner', 'co_owner'),
    false
  );
$$;

create or replace function public.can_invite_workspace_role(
  requested_workspace_id uuid,
  requested_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.workspace_role(requested_workspace_id)
    when 'owner' then requested_role in ('co_owner', 'manager', 'employee')
    when 'co_owner' then requested_role in ('co_owner', 'manager', 'employee')
    when 'manager' then requested_role = 'employee'
    else false
  end;
$$;

revoke all on function public.can_manage_workspace(uuid) from public;
revoke all on function public.can_admin_workspace(uuid) from public;
revoke all on function public.can_invite_workspace_role(uuid, text) from public;
grant execute on function public.can_manage_workspace(uuid) to authenticated;
grant execute on function public.can_admin_workspace(uuid) to authenticated;
grant execute on function public.can_invite_workspace_role(uuid, text) to authenticated;

create or replace function public.create_company_workspace(requested_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text;
  cleaned_name_key text;
  new_workspace_id uuid;
  generated_slug text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a company.';
  end if;

  cleaned_name := regexp_replace(trim(coalesce(requested_name, '')), '\s+', ' ', 'g');
  cleaned_name_key := regexp_replace(lower(cleaned_name), '[^a-z0-9]+', '', 'g');

  if length(cleaned_name) < 2 or cleaned_name_key = '' then
    raise exception 'Enter a company name with at least 2 characters.';
  end if;

  if length(cleaned_name) > 100 then
    raise exception 'Company names must be 100 characters or fewer.';
  end if;

  if exists (
    select 1
    from public.workspaces
    where kind = 'company'
      and regexp_replace(lower(trim(name)), '[^a-z0-9]+', '', 'g') = cleaned_name_key
  ) then
    raise exception 'That company name is already claimed.';
  end if;

  new_workspace_id := gen_random_uuid();
  generated_slug := trim(both '-' from regexp_replace(lower(cleaned_name), '[^a-z0-9]+', '-', 'g'))
                    || '-' || left(new_workspace_id::text, 8);

  insert into public.workspaces (
    id,
    name,
    slug,
    created_by,
    is_personal,
    kind
  )
  values (
    new_workspace_id,
    cleaned_name,
    generated_slug,
    auth.uid(),
    false,
    'company'
  );

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    position_title
  )
  values (new_workspace_id, auth.uid(), 'owner', 'Owner');

  return new_workspace_id;
exception
  when unique_violation then
    raise exception 'That company name is already claimed.';
end;
$$;

revoke all on function public.create_company_workspace(text) from public;
grant execute on function public.create_company_workspace(text) to authenticated;

-- Functions with changed return columns must be dropped before recreation.
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

drop function if exists public.get_workspace_members(uuid);

create function public.get_workspace_members(requested_workspace_id uuid)
returns table (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  role text,
  full_name text,
  email text,
  company text,
  phone text,
  position_title text,
  hourly_rate numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wm.id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    coalesce(p.full_name, split_part(coalesce(p.email, ''), '@', 1), 'Team member'),
    coalesce(p.email, ''),
    coalesce(p.company, ''),
    coalesce(p.phone, ''),
    coalesce(nullif(wm.position_title, ''),
      case wm.role
        when 'owner' then 'Owner'
        when 'co_owner' then 'Co-owner'
        when 'manager' then 'Manager'
        else 'Employee'
      end
    ),
    case
      when public.can_manage_workspace(requested_workspace_id)
      then wm.hourly_rate
      else 0
    end,
    wm.created_at
  from public.workspace_memberships wm
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = requested_workspace_id
    and public.is_workspace_member(requested_workspace_id)
  order by
    case wm.role
      when 'owner' then 0
      when 'co_owner' then 1
      when 'manager' then 2
      else 3
    end,
    wm.created_at;
$$;

revoke all on function public.get_workspace_members(uuid) from public;
grant execute on function public.get_workspace_members(uuid) to authenticated;

create or replace function public.update_workspace_member(
  requested_membership_id uuid,
  requested_role text,
  requested_position_title text,
  requested_hourly_rate numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.workspace_memberships%rowtype;
  actor_role text;
begin
  select * into membership_row
  from public.workspace_memberships
  where id = requested_membership_id;

  if membership_row.id is null then
    raise exception 'Team member not found.';
  end if;

  actor_role := public.workspace_role(membership_row.workspace_id);

  if actor_role not in ('owner', 'co_owner', 'manager') then
    raise exception 'You do not have permission to edit team members.';
  end if;

  if requested_role not in ('co_owner', 'manager', 'employee') then
    raise exception 'Choose a valid role.';
  end if;

  if actor_role = 'manager' and requested_role <> 'employee' then
    raise exception 'Managers may only edit employee profiles.';
  end if;

  if actor_role = 'manager' and membership_row.role <> 'employee' then
    raise exception 'Managers may only edit employee profiles.';
  end if;

  if membership_row.role = 'owner' then
    raise exception 'The owner role cannot be changed here.';
  end if;

  update public.workspace_memberships
  set
    role = requested_role,
    position_title = left(trim(coalesce(requested_position_title, '')), 80),
    hourly_rate = greatest(coalesce(requested_hourly_rate, 0), 0)
  where id = requested_membership_id;
end;
$$;

revoke all on function public.update_workspace_member(uuid, text, text, numeric) from public;
grant execute on function public.update_workspace_member(uuid, text, text, numeric) to authenticated;

-- Tighten team administration policies around the expanded roles.
drop policy if exists "Managers can update workspace members" on public.workspace_memberships;
create policy "Workspace admins can update workspace members"
on public.workspace_memberships for update to authenticated
using (public.can_admin_workspace(workspace_id))
with check (public.can_admin_workspace(workspace_id));

drop policy if exists "Managers can remove workspace members" on public.workspace_memberships;
create policy "Workspace admins can remove workspace members"
on public.workspace_memberships for delete to authenticated
using (public.can_admin_workspace(workspace_id) and role <> 'owner');

drop policy if exists "Managers can create invites" on public.workspace_invites;
create policy "Authorized members can create invites"
on public.workspace_invites for insert to authenticated
with check (
  invited_by = auth.uid()
  and public.can_invite_workspace_role(workspace_id, role)
);

drop policy if exists "Managers can view invites" on public.workspace_invites;
create policy "Authorized members can view invites"
on public.workspace_invites for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers can update invites" on public.workspace_invites;
create policy "Authorized members can update invites"
on public.workspace_invites for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (
  public.can_manage_workspace(workspace_id)
  and public.can_invite_workspace_role(workspace_id, role)
);

drop policy if exists "Managers can delete invites" on public.workspace_invites;
create policy "Workspace admins can delete invites"
on public.workspace_invites for delete to authenticated
using (public.can_admin_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- 2. Employee-specific labor rates and per-estimate labor assignments.
-- ---------------------------------------------------------------------------

alter table public.project_assignments
  add column if not exists hours numeric not null default 0,
  add column if not exists hourly_rate_snapshot numeric not null default 0;

alter table public.project_assignments
  drop constraint if exists project_assignments_hours_check;
alter table public.project_assignments
  add constraint project_assignments_hours_check check (hours >= 0);

alter table public.project_assignments
  drop constraint if exists project_assignments_hourly_rate_check;
alter table public.project_assignments
  add constraint project_assignments_hourly_rate_check
  check (hourly_rate_snapshot >= 0);

update public.project_assignments pa
set hourly_rate_snapshot = wm.hourly_rate
from public.workspace_memberships wm
where pa.workspace_id = wm.workspace_id
  and pa.user_id = wm.user_id
  and pa.hourly_rate_snapshot = 0;

-- Employees may see team identities and their assignments, but hourly rates are
-- deliberately excluded from direct table access. Managers retrieve rates
-- through the security-definer functions below.
revoke select on public.workspace_memberships from authenticated;
grant select (
  id, workspace_id, user_id, role, position_title, created_at
) on public.workspace_memberships to authenticated;

revoke select on public.project_assignments from authenticated;
grant select (
  id, workspace_id, project_id, user_id, assigned_by, hours, created_at
) on public.project_assignments to authenticated;

drop function if exists public.get_project_labor_assignments(uuid);

create function public.get_project_labor_assignments(
  requested_workspace_id uuid
)
returns table (
  project_id text,
  user_id uuid,
  hours numeric,
  hourly_rate_snapshot numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_workspace(requested_workspace_id) then
    raise exception 'You do not have permission to view labor rates.';
  end if;

  return query
  select
    pa.project_id,
    pa.user_id,
    pa.hours,
    pa.hourly_rate_snapshot
  from public.project_assignments pa
  where pa.workspace_id = requested_workspace_id;
end;
$$;

revoke all on function public.get_project_labor_assignments(uuid) from public;
grant execute on function public.get_project_labor_assignments(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public estimate delivery, viewing, acceptance, decline, and signature.
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
end
$$;

alter table public.projects
  add column if not exists sent_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists response_name text not null default '',
  add column if not exists response_message text not null default '',
  add column if not exists signature_data text not null default '';

create or replace function public.record_estimate_view(requested_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.projects
  set viewed_at = coalesce(viewed_at, now())
  where share_token = requested_token
    and share_enabled = true;
end;
$$;

revoke all on function public.record_estimate_view(uuid) from public;
grant execute on function public.record_estimate_view(uuid) to anon, authenticated;

create or replace function public.respond_to_estimate(
  requested_token uuid,
  requested_decision text,
  requested_name text,
  requested_signature text default '',
  requested_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  cleaned_name text;
  cleaned_signature text;
  cleaned_message text;
begin
  select * into project_row
  from public.projects
  where share_token = requested_token
    and share_enabled = true
  for update;

  if project_row.id is null then
    raise exception 'This estimate is unavailable.';
  end if;

  if project_row.responded_at is not null then
    raise exception 'This estimate has already been responded to.';
  end if;

  if requested_decision not in ('accepted', 'declined') then
    raise exception 'Choose Accept or Decline.';
  end if;

  cleaned_name := left(trim(coalesce(requested_name, '')), 120);
  cleaned_signature := coalesce(requested_signature, '');
  cleaned_message := left(trim(coalesce(requested_message, '')), 2000);

  if cleaned_name = '' then
    raise exception 'Enter your name.';
  end if;

  if requested_decision = 'accepted'
     and cleaned_signature not like 'data:image/%' then
    raise exception 'Add your signature before accepting.';
  end if;

  if length(cleaned_signature) > 900000 then
    raise exception 'The signature image is too large.';
  end if;

  update public.projects
  set
    estimate_status = requested_decision,
    responded_at = now(),
    accepted_at = case when requested_decision = 'accepted' then now() else null end,
    declined_at = case when requested_decision = 'declined' then now() else null end,
    response_name = cleaned_name,
    response_message = cleaned_message,
    signature_data = case
      when requested_decision = 'accepted' then cleaned_signature
      else ''
    end,
    updated_at = now()
  where id = project_row.id;

  return jsonb_build_object(
    'status', requested_decision,
    'responded_at', now(),
    'response_name', cleaned_name,
    'response_message', cleaned_message,
    'signature_data', case
      when requested_decision = 'accepted' then cleaned_signature
      else ''
    end
  );
end;
$$;

revoke all on function public.respond_to_estimate(uuid, text, text, text, text) from public;
grant execute on function public.respond_to_estimate(uuid, text, text, text, text)
  to anon, authenticated;

create or replace function public.get_public_estimate(requested_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'workspace_id', p.workspace_id,
      'created_by', p.created_by,
      'user_id', p.user_id,
      'name', p.name,
      'client', p.client,
      'address', p.address,
      'contact_id', p.contact_id,
      'property_id', p.property_id,
      'status', p.status,
      'estimate_status', p.estimate_status,
      'estimate_number', p.estimate_number,
      'issue_date', p.issue_date,
      'valid_until', p.valid_until,
      'project_type', p.project_type,
      'square_footage', p.square_footage,
      'labor_rate', p.labor_rate,
      'labor_hours', p.labor_hours,
      'line_items', p.line_items,
      'estimate_summary', p.estimate_summary,
      'scope_description', p.scope_description,
      'client_notes', p.client_notes,
      'terms', p.terms,
      'tax_rate', p.tax_rate,
      'discount_amount', p.discount_amount,
      'total_estimate', p.total_estimate,
      'share_token', p.share_token,
      'sent_at', p.sent_at,
      'viewed_at', p.viewed_at,
      'responded_at', p.responded_at,
      'accepted_at', p.accepted_at,
      'declined_at', p.declined_at,
      'response_name', p.response_name,
      'response_message', p.response_message,
      'signature_data', p.signature_data,
      'scheduled_start', p.scheduled_start,
      'scheduled_end', p.scheduled_end,
      'follow_up_at', p.follow_up_at,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ),
    'company', jsonb_build_object(
      'full_name', owner_profile.full_name,
      'email', owner_profile.email,
      'phone', owner_profile.phone,
      'company', coalesce(nullif(w.name, ''), owner_profile.company)
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'workspace_id', c.workspace_id,
        'name', c.name,
        'email', c.email,
        'phone', c.phone,
        'address', c.address,
        'city', c.city,
        'state', c.state,
        'zip', c.zip
      )
    end,
    'property', case
      when prop.id is null then null
      else jsonb_build_object(
        'id', prop.id,
        'workspace_id', prop.workspace_id,
        'contact_id', prop.contact_id,
        'name', prop.name,
        'address', prop.address,
        'city', prop.city,
        'state', prop.state,
        'zip', prop.zip,
        'description', prop.description,
        'client_notes', prop.client_notes
      )
    end,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ph.id,
            'workspace_id', ph.workspace_id,
            'property_id', ph.property_id,
            'storage_path', ph.storage_path,
            'caption', ph.caption,
            'created_at', ph.created_at
          )
          order by ph.created_at
        )
        from public.property_photos ph
        where ph.property_id = p.property_id
      ),
      '[]'::jsonb
    )
  )
  from public.projects p
  join public.workspaces w on w.id = p.workspace_id
  left join public.profiles owner_profile on owner_profile.id = w.created_by
  left join public.contacts c on c.id = p.contact_id
  left join public.properties prop on prop.id = p.property_id
  where p.share_token = requested_token
    and p.share_enabled = true
  limit 1;
$$;

revoke all on function public.get_public_estimate(uuid) from public;
grant execute on function public.get_public_estimate(uuid) to anon, authenticated;
