-- YardPilot operations/team upgrade.
-- Run AFTER yardpilot-estimates-properties-darkmode.sql.
-- Adds workspaces, partner/employee roles, assignments, invoices,
-- schedule events, follow-ups, and employee job proposals.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Workspaces, members, and invite codes.
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_personal_owner_idx
  on public.workspaces(created_by)
  where is_personal = true;

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner', 'employee')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships(user_id, created_at);

create index if not exists workspace_memberships_workspace_idx
  on public.workspace_memberships(workspace_id, role);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('partner', 'employee')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites(workspace_id, status, created_at desc);

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

  if result_id is null then
    select coalesce(nullif(company, ''), nullif(full_name, ''), 'YardPilot Workspace')
      into workspace_name
    from public.profiles
    where id = target_user_id;

    insert into public.workspaces (name, created_by, is_personal)
    values (coalesce(workspace_name, 'YardPilot Workspace'), target_user_id, true)
    returning id into result_id;
  end if;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (result_id, target_user_id, 'owner')
  on conflict (workspace_id, user_id) do update
    set role = 'owner';

  return result_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(uuid) from public;

-- Preserve profile creation and also create a personal workspace for new users.
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

-- Backfill personal workspaces for current accounts.
do $$
declare
  account record;
begin
  for account in select id from auth.users loop
    perform public.ensure_personal_workspace(account.id);
  end loop;
end
$$;

create or replace function public.is_workspace_member(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = requested_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(requested_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_memberships wm
  where wm.workspace_id = requested_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_workspace(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.workspace_role(requested_workspace_id) in ('owner', 'partner'), false);
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.workspace_role(uuid) from public;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Add workspace and scheduling fields to existing records.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists follow_up_at timestamptz;

alter table public.contacts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.properties
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.property_photos
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.projects p
set
  workspace_id = coalesce(p.workspace_id, public.ensure_personal_workspace(p.user_id)),
  created_by = coalesce(p.created_by, p.user_id)
where p.workspace_id is null or p.created_by is null;

update public.contacts c
set workspace_id = coalesce(c.workspace_id, public.ensure_personal_workspace(c.user_id))
where c.workspace_id is null;

update public.properties p
set workspace_id = coalesce(p.workspace_id, public.ensure_personal_workspace(p.user_id))
where p.workspace_id is null;

update public.property_photos p
set workspace_id = coalesce(p.workspace_id, public.ensure_personal_workspace(p.user_id))
where p.workspace_id is null;

alter table public.projects alter column workspace_id set not null;
alter table public.contacts alter column workspace_id set not null;
alter table public.properties alter column workspace_id set not null;
alter table public.property_photos alter column workspace_id set not null;

create index if not exists projects_workspace_idx
  on public.projects(workspace_id, updated_at desc);
create index if not exists contacts_workspace_idx
  on public.contacts(workspace_id, activity_status, updated_at desc);
create index if not exists properties_workspace_idx
  on public.properties(workspace_id, updated_at desc);
create index if not exists property_photos_workspace_idx
  on public.property_photos(workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. Assignments, invoices, calendar, follow-ups, and job requests.
-- ---------------------------------------------------------------------------

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_assignments_workspace_idx
  on public.project_assignments(workspace_id, user_id, project_id);

create table if not exists public.invoices (
  id text primary key default gen_random_uuid()::text,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  project_id text references public.projects(id) on delete set null,
  contact_id text references public.contacts(id) on delete set null,
  property_id text references public.properties(id) on delete set null,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date not null default (current_date + 14),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  amount numeric not null default 0 check (amount >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);

create index if not exists invoices_workspace_idx
  on public.invoices(workspace_id, due_date, status);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'project', 'invoice')),
  project_id text references public.projects(id) on delete cascade,
  invoice_id text references public.invoices(id) on delete cascade,
  contact_id text references public.contacts(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  auto_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_events_workspace_idx
  on public.schedule_events(workspace_id, start_at, status);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  due_at timestamptz not null,
  type text not null default 'general'
    check (type in ('general', 'estimate', 'appointment', 'payment', 'customer')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'dismissed')),
  channel text not null default 'none'
    check (channel in ('email', 'sms', 'phone', 'none')),
  contact_id text references public.contacts(id) on delete set null,
  project_id text references public.projects(id) on delete cascade,
  invoice_id text references public.invoices(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  auto_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists follow_ups_workspace_idx
  on public.follow_ups(workspace_id, status, due_at);

create table if not exists public.job_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  client text not null default '',
  address text not null default '',
  scope_description text not null default '',
  proposed_start timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  manager_notes text not null default '',
  created_project_id text references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_requests_workspace_idx
  on public.job_requests(workspace_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Automatic schedule and follow-up synchronization.
-- ---------------------------------------------------------------------------

create or replace function public.sync_project_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_user uuid;
begin
  select pa.user_id into assigned_user
  from public.project_assignments pa
  where pa.project_id = new.id
  order by pa.created_at
  limit 1;

  if new.scheduled_start is not null then
    insert into public.schedule_events (
      workspace_id, created_by, title, description, start_at, end_at,
      all_day, source_type, project_id, contact_id, assigned_user_id,
      status, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      new.name,
      coalesce(new.scope_description, ''),
      new.scheduled_start,
      new.scheduled_end,
      false,
      'project',
      new.id,
      new.contact_id,
      assigned_user,
      case when new.status = 'completed' then 'completed' else 'scheduled' end,
      'project:' || new.id || ':schedule',
      now()
    )
    on conflict (auto_key) do update set
      workspace_id = excluded.workspace_id,
      title = excluded.title,
      description = excluded.description,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = excluded.status,
      updated_at = now();

    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Upcoming appointment: ' || new.name,
      coalesce(new.address, ''),
      new.scheduled_start - interval '1 day',
      'appointment',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':appointment',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = 'pending',
      updated_at = now();
  else
    delete from public.schedule_events
      where auto_key = 'project:' || new.id || ':schedule';
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':appointment';
  end if;

  if new.follow_up_at is not null then
    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Follow up: ' || new.name,
      coalesce(new.client_notes, ''),
      new.follow_up_at,
      'estimate',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':followup',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = 'pending',
      updated_at = now();
  else
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':followup';
  end if;

  if new.valid_until is not null and new.estimate_status in ('draft', 'sent') then
    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Estimate expires soon: ' || new.name,
      'Estimate ' || new.estimate_number || ' is approaching its expiration date.',
      (new.valid_until::timestamptz + interval '12 hours') - interval '2 days',
      'estimate',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':expiry',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = 'pending',
      updated_at = now();
  else
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':expiry';
  end if;

  return new;
end;
$$;

create or replace function public.sync_invoice_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'void' then
    insert into public.schedule_events (
      workspace_id, created_by, title, description, start_at, all_day,
      source_type, invoice_id, project_id, contact_id, status, auto_key, updated_at
    )
    values (
      new.workspace_id,
      new.created_by,
      'Invoice due: ' || new.invoice_number,
      coalesce(new.notes, ''),
      new.due_date::timestamptz + interval '12 hours',
      true,
      'invoice',
      new.id,
      new.project_id,
      new.contact_id,
      case when new.status = 'paid' then 'completed' else 'scheduled' end,
      'invoice:' || new.id || ':due',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      description = excluded.description,
      start_at = excluded.start_at,
      project_id = excluded.project_id,
      contact_id = excluded.contact_id,
      status = excluded.status,
      updated_at = now();

    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, invoice_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      new.created_by,
      'Payment due: ' || new.invoice_number,
      coalesce(new.notes, ''),
      new.due_date::timestamptz + interval '9 hours',
      'payment',
      case when new.status = 'paid' then 'completed' else 'pending' end,
      'email',
      new.contact_id,
      new.project_id,
      new.id,
      'invoice:' || new.id || ':payment',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      project_id = excluded.project_id,
      contact_id = excluded.contact_id,
      status = excluded.status,
      updated_at = now();
  else
    delete from public.schedule_events
      where auto_key = 'invoice:' || new.id || ':due';
    delete from public.follow_ups
      where auto_key = 'invoice:' || new.id || ':payment';
  end if;

  return new;
end;
$$;

create or replace function public.cleanup_removed_workspace_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.project_assignments
  where workspace_id = old.workspace_id
    and user_id = old.user_id;

  update public.schedule_events
  set assigned_user_id = null, updated_at = now()
  where workspace_id = old.workspace_id
    and assigned_user_id = old.user_id;

  update public.follow_ups
  set assigned_user_id = null, updated_at = now()
  where workspace_id = old.workspace_id
    and assigned_user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists cleanup_removed_workspace_member_trigger
  on public.workspace_memberships;
create trigger cleanup_removed_workspace_member_trigger
  after delete on public.workspace_memberships
  for each row execute function public.cleanup_removed_workspace_member();

create or replace function public.sync_assignment_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_project text;
  assigned_user uuid;
begin
  if tg_op = 'DELETE' then
    affected_project := old.project_id;
  else
    affected_project := new.project_id;
  end if;

  select pa.user_id into assigned_user
  from public.project_assignments pa
  where pa.project_id = affected_project
  order by pa.created_at
  limit 1;

  update public.schedule_events
  set assigned_user_id = assigned_user, updated_at = now()
  where project_id = affected_project
    and source_type = 'project';

  update public.follow_ups
  set assigned_user_id = assigned_user, updated_at = now()
  where project_id = affected_project;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_project_operations_trigger on public.projects;
create trigger sync_project_operations_trigger
  after insert or update on public.projects
  for each row execute function public.sync_project_operations();

drop trigger if exists sync_invoice_operations_trigger on public.invoices;
create trigger sync_invoice_operations_trigger
  after insert or update on public.invoices
  for each row execute function public.sync_invoice_operations();

drop trigger if exists sync_assignment_operations_trigger on public.project_assignments;
create trigger sync_assignment_operations_trigger
  after insert or update or delete on public.project_assignments
  for each row execute function public.sync_assignment_operations();

-- Populate generated schedule/follow-up rows for existing projects.
update public.projects set updated_at = updated_at;

-- ---------------------------------------------------------------------------
-- 5. Role-aware RPC functions.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_workspaces()
returns table (
  id uuid,
  name text,
  created_by uuid,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.name, w.created_by, wm.role, w.created_at
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid()
  order by
    case wm.role when 'owner' then 0 when 'partner' then 1 else 2 end,
    w.created_at;
$$;

create or replace function public.get_workspace_members(requested_workspace_id uuid)
returns table (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  role text,
  full_name text,
  email text,
  company text,
  phone text,
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
    wm.created_at
  from public.workspace_memberships wm
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = requested_workspace_id
    and public.is_workspace_member(requested_workspace_id)
  order by
    case wm.role when 'owner' then 0 when 'partner' then 1 else 2 end,
    wm.created_at;
$$;

create or replace function public.accept_workspace_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.workspace_invites%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select email into current_email from auth.users where id = auth.uid();

  select * into invite_row
  from public.workspace_invites
  where token::text = trim(invite_code)
    and status = 'pending'
  limit 1;

  if invite_row.id is null then
    raise exception 'Invite code is invalid or no longer active.';
  end if;

  if invite_row.expires_at < now() then
    update public.workspace_invites set status = 'expired' where id = invite_row.id;
    raise exception 'Invite code has expired.';
  end if;

  if lower(invite_row.email) <> lower(coalesce(current_email, '')) then
    raise exception 'Sign in with the email address that was invited.';
  end if;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (invite_row.workspace_id, auth.uid(), invite_row.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  update public.workspace_invites
  set status = 'accepted'
  where id = invite_row.id;

  return invite_row.workspace_id;
end;
$$;

create or replace function public.get_employee_projects(requested_workspace_id uuid)
returns table (
  id text,
  user_id uuid,
  workspace_id uuid,
  created_by uuid,
  name text,
  client text,
  address text,
  contact_id text,
  property_id text,
  status text,
  estimate_status text,
  estimate_number text,
  issue_date date,
  valid_until date,
  project_type text,
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
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  follow_up_at timestamptz,
  assigned_member_ids uuid[],
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
    p.contact_id,
    p.property_id,
    p.status,
    p.estimate_status,
    p.estimate_number,
    p.issue_date,
    p.valid_until,
    p.project_type,
    p.square_footage,
    0::numeric as labor_rate,
    p.labor_hours,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item ->> 'id',
            'description', item ->> 'description',
            'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
            'unit', item ->> 'unit',
            'unitCost', 0
          )
        )
        from jsonb_array_elements(coalesce(p.line_items, '[]'::jsonb)) item
      ),
      '[]'::jsonb
    ) as line_items,
    null::text as estimate_summary,
    p.scope_description,
    p.client_notes,
    ''::text as terms,
    0::numeric as tax_rate,
    0::numeric as discount_amount,
    0::numeric as total_estimate,
    ''::text as notes,
    p.share_token,
    false as share_enabled,
    p.scheduled_start,
    p.scheduled_end,
    p.follow_up_at,
    coalesce(
      array(
        select pa.user_id
        from public.project_assignments pa
        where pa.project_id = p.id
        order by pa.created_at
      ),
      array[]::uuid[]
    ) as assigned_member_ids,
    p.created_at,
    p.updated_at
  from public.projects p
  where p.workspace_id = requested_workspace_id
    and public.workspace_role(requested_workspace_id) = 'employee'
    and p.status = 'active'
    and (
      not exists (
        select 1 from public.project_assignments pa0
        where pa0.project_id = p.id
      )
      or exists (
        select 1 from public.project_assignments pa1
        where pa1.project_id = p.id
          and pa1.user_id = auth.uid()
      )
    )
  order by p.scheduled_start nulls last, p.updated_at desc;
$$;

create or replace function public.employee_claim_project(requested_project_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_workspace uuid;
begin
  select workspace_id into project_workspace
  from public.projects
  where id = requested_project_id;

  if project_workspace is null
     or public.workspace_role(project_workspace) <> 'employee' then
    raise exception 'You cannot claim this job.';
  end if;

  if exists (
    select 1 from public.project_assignments
    where project_id = requested_project_id
      and user_id <> auth.uid()
  ) then
    raise exception 'This job is already assigned.';
  end if;

  insert into public.project_assignments (
    workspace_id, project_id, user_id, assigned_by
  )
  values (
    project_workspace, requested_project_id, auth.uid(), auth.uid()
  )
  on conflict (project_id, user_id) do nothing;
end;
$$;

create or replace function public.approve_job_request(requested_job_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.job_requests%rowtype;
  new_project_id text;
  now_value timestamptz := now();
begin
  select * into request_row
  from public.job_requests
  where id = requested_job_request_id
  for update;

  if request_row.id is null
     or not public.can_manage_workspace(request_row.workspace_id) then
    raise exception 'You cannot approve this request.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  new_project_id := gen_random_uuid()::text;

  insert into public.projects (
    id, user_id, workspace_id, created_by, name, client, address,
    status, estimate_status, estimate_number, issue_date, valid_until,
    project_type, square_footage, labor_rate, labor_hours, line_items,
    estimate_summary, scope_description, client_notes, terms, tax_rate,
    discount_amount, total_estimate, notes, share_token, share_enabled,
    scheduled_start, created_at, updated_at
  )
  values (
    new_project_id,
    auth.uid(),
    request_row.workspace_id,
    auth.uid(),
    request_row.title,
    request_row.client,
    request_row.address,
    'active',
    'draft',
    'JOB-' || upper(substr(replace(new_project_id, '-', ''), 1, 10)),
    current_date,
    current_date + 30,
    'Other',
    0,
    0,
    0,
    '[]'::jsonb,
    null,
    request_row.scope_description,
    '',
    '',
    0,
    0,
    0,
    '',
    gen_random_uuid(),
    false,
    request_row.proposed_start,
    now_value,
    now_value
  );

  insert into public.project_assignments (
    workspace_id, project_id, user_id, assigned_by
  )
  values (
    request_row.workspace_id,
    new_project_id,
    request_row.requested_by,
    auth.uid()
  );

  update public.job_requests
  set
    status = 'approved',
    created_project_id = new_project_id,
    updated_at = now()
  where id = request_row.id;

  return new_project_id;
end;
$$;

revoke all on function public.get_my_workspaces() from public;
revoke all on function public.get_workspace_members(uuid) from public;
revoke all on function public.accept_workspace_invite(text) from public;
revoke all on function public.get_employee_projects(uuid) from public;
revoke all on function public.employee_claim_project(text) from public;
revoke all on function public.approve_job_request(uuid) from public;

grant execute on function public.get_my_workspaces() to authenticated;
grant execute on function public.get_workspace_members(uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.get_employee_projects(uuid) to authenticated;
grant execute on function public.employee_claim_project(text) to authenticated;
grant execute on function public.approve_job_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS policies.
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.project_assignments enable row level security;
alter table public.invoices enable row level security;
alter table public.schedule_events enable row level security;
alter table public.follow_ups enable row level security;
alter table public.job_requests enable row level security;

grant select, insert, update, delete on
  public.workspaces,
  public.workspace_memberships,
  public.workspace_invites,
  public.project_assignments,
  public.invoices,
  public.schedule_events,
  public.follow_ups,
  public.job_requests
  to authenticated;

-- Workspaces.
drop policy if exists "Members can view workspaces" on public.workspaces;
create policy "Members can view workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists "Owners can update workspaces" on public.workspaces;
create policy "Owners can update workspaces"
on public.workspaces for update to authenticated
using (public.workspace_role(id) = 'owner')
with check (public.workspace_role(id) = 'owner');

-- Memberships.
drop policy if exists "Members can view workspace members" on public.workspace_memberships;
create policy "Members can view workspace members"
on public.workspace_memberships for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Managers can update workspace members" on public.workspace_memberships;
create policy "Managers can update workspace members"
on public.workspace_memberships for update to authenticated
using (public.can_manage_workspace(workspace_id) and role <> 'owner' and user_id <> auth.uid())
with check (public.can_manage_workspace(workspace_id) and role in ('partner', 'employee') and user_id <> auth.uid());

drop policy if exists "Managers can remove workspace members" on public.workspace_memberships;
create policy "Managers can remove workspace members"
on public.workspace_memberships for delete to authenticated
using (public.can_manage_workspace(workspace_id) and role <> 'owner' and user_id <> auth.uid());

-- Invites.
drop policy if exists "Managers can view invites" on public.workspace_invites;
create policy "Managers can view invites"
on public.workspace_invites for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers can create invites" on public.workspace_invites;
create policy "Managers can create invites"
on public.workspace_invites for insert to authenticated
with check (
  public.can_manage_workspace(workspace_id)
  and invited_by = auth.uid()
);

drop policy if exists "Managers can update invites" on public.workspace_invites;
create policy "Managers can update invites"
on public.workspace_invites for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers can delete invites" on public.workspace_invites;
create policy "Managers can delete invites"
on public.workspace_invites for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Replace old per-user policies with workspace manager policies.
drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can create their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;

drop policy if exists "Workspace managers can view projects" on public.projects;
create policy "Workspace managers can view projects"
on public.projects for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can create projects" on public.projects;
create policy "Workspace managers can create projects"
on public.projects for insert to authenticated
with check (
  public.can_manage_workspace(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "Workspace managers can update projects" on public.projects;
create policy "Workspace managers can update projects"
on public.projects for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can delete projects" on public.projects;
create policy "Workspace managers can delete projects"
on public.projects for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Contacts.
drop policy if exists "Users can view their own contacts" on public.contacts;
drop policy if exists "Users can create their own contacts" on public.contacts;
drop policy if exists "Users can update their own contacts" on public.contacts;
drop policy if exists "Users can delete their own contacts" on public.contacts;

drop policy if exists "Workspace managers can view contacts" on public.contacts;
create policy "Workspace managers can view contacts"
on public.contacts for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can create contacts" on public.contacts;
create policy "Workspace managers can create contacts"
on public.contacts for insert to authenticated
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can update contacts" on public.contacts;
create policy "Workspace managers can update contacts"
on public.contacts for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can delete contacts" on public.contacts;
create policy "Workspace managers can delete contacts"
on public.contacts for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Properties.
drop policy if exists "Users can view their own properties" on public.properties;
drop policy if exists "Users can create their own properties" on public.properties;
drop policy if exists "Users can update their own properties" on public.properties;
drop policy if exists "Users can delete their own properties" on public.properties;

drop policy if exists "Workspace managers can view properties" on public.properties;
create policy "Workspace managers can view properties"
on public.properties for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can create properties" on public.properties;
create policy "Workspace managers can create properties"
on public.properties for insert to authenticated
with check (
  public.can_manage_workspace(workspace_id)
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id and c.workspace_id = properties.workspace_id
  )
);

drop policy if exists "Workspace managers can update properties" on public.properties;
create policy "Workspace managers can update properties"
on public.properties for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can delete properties" on public.properties;
create policy "Workspace managers can delete properties"
on public.properties for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Photo records.
drop policy if exists "Users can view their own property photos" on public.property_photos;
drop policy if exists "Users can create their own property photos" on public.property_photos;
drop policy if exists "Users can update their own property photos" on public.property_photos;
drop policy if exists "Users can delete their own property photos" on public.property_photos;

drop policy if exists "Workspace managers can view property photos" on public.property_photos;
create policy "Workspace managers can view property photos"
on public.property_photos for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can create property photos" on public.property_photos;
create policy "Workspace managers can create property photos"
on public.property_photos for insert to authenticated
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can update property photos" on public.property_photos;
create policy "Workspace managers can update property photos"
on public.property_photos for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can delete property photos" on public.property_photos;
create policy "Workspace managers can delete property photos"
on public.property_photos for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Assignments.
drop policy if exists "Members can view assignments" on public.project_assignments;
create policy "Members can view assignments"
on public.project_assignments for select to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or user_id = auth.uid()
);

drop policy if exists "Managers can create assignments" on public.project_assignments;
create policy "Managers can create assignments"
on public.project_assignments for insert to authenticated
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers can update assignments" on public.project_assignments;
create policy "Managers can update assignments"
on public.project_assignments for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers can delete assignments" on public.project_assignments;
create policy "Managers can delete assignments"
on public.project_assignments for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Invoices: financial data remains manager-only.
drop policy if exists "Workspace managers can view invoices" on public.invoices;
create policy "Workspace managers can view invoices"
on public.invoices for select to authenticated
using (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can create invoices" on public.invoices;
create policy "Workspace managers can create invoices"
on public.invoices for insert to authenticated
with check (public.can_manage_workspace(workspace_id) and created_by = auth.uid());

drop policy if exists "Workspace managers can update invoices" on public.invoices;
create policy "Workspace managers can update invoices"
on public.invoices for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Workspace managers can delete invoices" on public.invoices;
create policy "Workspace managers can delete invoices"
on public.invoices for delete to authenticated
using (public.can_manage_workspace(workspace_id));

-- Schedule events.
drop policy if exists "Members can view relevant schedule events" on public.schedule_events;
create policy "Members can view relevant schedule events"
on public.schedule_events for select to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or assigned_user_id = auth.uid()
  or (
    source_type = 'project'
    and exists (
      select 1 from public.project_assignments pa
      where pa.project_id = schedule_events.project_id
        and pa.user_id = auth.uid()
    )
  )
  or (source_type = 'manual' and created_by = auth.uid())
);

drop policy if exists "Members can create personal schedule events" on public.schedule_events;
create policy "Members can create personal schedule events"
on public.schedule_events for insert to authenticated
with check (
  public.can_manage_workspace(workspace_id)
  or (
    public.workspace_role(workspace_id) = 'employee'
    and created_by = auth.uid()
    and assigned_user_id = auth.uid()
    and source_type = 'manual'
  )
);

drop policy if exists "Members can update permitted schedule events" on public.schedule_events;
create policy "Members can update permitted schedule events"
on public.schedule_events for update to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or (source_type = 'manual' and created_by = auth.uid())
)
with check (
  public.can_manage_workspace(workspace_id)
  or (source_type = 'manual' and created_by = auth.uid())
);

drop policy if exists "Members can delete permitted schedule events" on public.schedule_events;
create policy "Members can delete permitted schedule events"
on public.schedule_events for delete to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or (source_type = 'manual' and created_by = auth.uid())
);

-- Follow-ups.
drop policy if exists "Members can view relevant follow ups" on public.follow_ups;
create policy "Members can view relevant follow ups"
on public.follow_ups for select to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or assigned_user_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "Members can create follow ups" on public.follow_ups;
create policy "Members can create follow ups"
on public.follow_ups for insert to authenticated
with check (
  public.can_manage_workspace(workspace_id)
  or (
    public.workspace_role(workspace_id) = 'employee'
    and created_by = auth.uid()
    and assigned_user_id = auth.uid()
  )
);

drop policy if exists "Members can update relevant follow ups" on public.follow_ups;
create policy "Members can update relevant follow ups"
on public.follow_ups for update to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or assigned_user_id = auth.uid()
  or created_by = auth.uid()
)
with check (
  public.can_manage_workspace(workspace_id)
  or assigned_user_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "Members can delete relevant follow ups" on public.follow_ups;
create policy "Members can delete relevant follow ups"
on public.follow_ups for delete to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or created_by = auth.uid()
);

-- Job requests.
drop policy if exists "Members can view relevant job requests" on public.job_requests;
create policy "Members can view relevant job requests"
on public.job_requests for select to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or requested_by = auth.uid()
);

drop policy if exists "Employees can create job requests" on public.job_requests;
create policy "Employees can create job requests"
on public.job_requests for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and requested_by = auth.uid()
);

drop policy if exists "Managers can update job requests" on public.job_requests;
create policy "Managers can update job requests"
on public.job_requests for update to authenticated
using (public.can_manage_workspace(workspace_id))
with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Requesters and managers can delete job requests" on public.job_requests;
create policy "Requesters and managers can delete job requests"
on public.job_requests for delete to authenticated
using (
  public.can_manage_workspace(workspace_id)
  or (requested_by = auth.uid() and status = 'pending')
);

-- ---------------------------------------------------------------------------
-- 7. Workspace-aware Storage policies.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can read their own property photo objects" on storage.objects;
drop policy if exists "Users can upload their own property photo objects" on storage.objects;
drop policy if exists "Users can update their own property photo objects" on storage.objects;
drop policy if exists "Users can delete their own property photo objects" on storage.objects;

drop policy if exists "Workspace managers can read property photo objects" on storage.objects;
create policy "Workspace managers can read property photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-photos'
  and exists (
    select 1
    from public.property_photos ph
    where ph.storage_path = name
      and public.can_manage_workspace(ph.workspace_id)
  )
);

drop policy if exists "Workspace managers can upload property photo objects" on storage.objects;
create policy "Workspace managers can upload property photo objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.properties prop
    where prop.id = (storage.foldername(name))[2]
      and public.can_manage_workspace(prop.workspace_id)
  )
);

drop policy if exists "Workspace managers can update property photo objects" on storage.objects;
create policy "Workspace managers can update property photo objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'property-photos'
  and exists (
    select 1
    from public.property_photos ph
    where ph.storage_path = name
      and public.can_manage_workspace(ph.workspace_id)
  )
)
with check (
  bucket_id = 'property-photos'
  and exists (
    select 1
    from public.property_photos ph
    where ph.storage_path = name
      and public.can_manage_workspace(ph.workspace_id)
  )
);

drop policy if exists "Workspace managers can delete property photo objects" on storage.objects;
create policy "Workspace managers can delete property photo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-photos'
  and exists (
    select 1
    from public.property_photos ph
    where ph.storage_path = name
      and public.can_manage_workspace(ph.workspace_id)
  )
);

-- ---------------------------------------------------------------------------
-- 8. Public estimate function now uses the workspace owner/company.
-- ---------------------------------------------------------------------------

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
      'scheduled_start', p.scheduled_start,
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
