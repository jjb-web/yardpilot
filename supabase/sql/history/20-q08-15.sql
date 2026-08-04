-- YardPilot marketplace, client accounts, feedback, hiring, bidding, and unique gift codes.
-- Forward-only migration. Run AFTER yardpilot-subscriptions-paywall-v1.sql.
-- This migration does not delete existing YardPilot business records.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Account types
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists account_type text not null default 'landscaper';

update public.profiles
set account_type = 'landscaper'
where account_type not in ('landscaper', 'client') or account_type is null;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('landscaper', 'client'));

create or replace function public.yardpilot_apply_profile_account_type()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  requested_type text;
begin
  select lower(trim(coalesce(raw_user_meta_data ->> 'account_type', '')))
  into requested_type
  from auth.users
  where id = new.id;

  if requested_type in ('landscaper', 'client') then
    new.account_type := requested_type;
  end if;

  return new;
end;
$$;

revoke all on function public.yardpilot_apply_profile_account_type() from public;

drop trigger if exists yardpilot_profiles_account_type_from_auth on public.profiles;
create trigger yardpilot_profiles_account_type_from_auth
before insert on public.profiles
for each row execute function public.yardpilot_apply_profile_account_type();

create or replace function public.set_my_account_type(requested_account_type text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cleaned_type text := lower(trim(coalesce(requested_account_type, '')));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if cleaned_type not in ('landscaper', 'client') then
    raise exception 'Account type must be landscaper or client.';
  end if;

  if cleaned_type = 'client' and exists (
    select 1
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and coalesce(w.kind, 'personal') <> 'personal'
  ) then
    raise exception 'Leave company and workgroup memberships before switching to a client account.';
  end if;

  update public.profiles
  set account_type = cleaned_type,
      updated_at = now()
  where id = auth.uid();

  return cleaned_type;
end;
$$;

revoke all on function public.set_my_account_type(text) from public;
grant execute on function public.set_my_account_type(text) to authenticated;

-- The original billing migration accidentally marked this function STABLE even
-- though it inserts a missing workspace subscription row. Correct it here.
do $$
begin
  if to_regprocedure('public.get_workspace_billing_status(uuid)') is not null then
    execute 'alter function public.get_workspace_billing_status(uuid) volatile';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Shared helpers and platform admins
-- ---------------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.marketplace_workspace_role(requested_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role::text
  from public.workspace_memberships wm
  where wm.workspace_id = requested_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.marketplace_workspace_role(uuid) from public;
grant execute on function public.marketplace_workspace_role(uuid) to authenticated, service_role;

create or replace function public.marketplace_can_manage_workspace(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.marketplace_workspace_role(requested_workspace_id) in ('owner', 'co_owner', 'manager'), false);
$$;

revoke all on function public.marketplace_can_manage_workspace(uuid) from public;
grant execute on function public.marketplace_can_manage_workspace(uuid) to authenticated, service_role;

create or replace function public.marketplace_assert_safe_text(value_to_check text, field_label text default 'Content')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  allowed boolean := true;
begin
  if coalesce(trim(value_to_check), '') = '' then
    return;
  end if;

  if to_regprocedure('public.yardpilot_text_is_allowed(text)') is not null then
    execute 'select public.yardpilot_text_is_allowed($1)'
    into allowed
    using value_to_check;
  end if;

  if not coalesce(allowed, false) then
    raise exception '% contains language that is not allowed.', coalesce(nullif(field_label, ''), 'Content')
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.marketplace_assert_safe_text(text,text) from public;
grant execute on function public.marketplace_assert_safe_text(text,text) to authenticated, service_role;

create or replace function public.marketplace_touch_updated_at()
returns trigger
language plpgsql
volatile
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Feedback and YardPilot reviews
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  account_type text not null default 'landscaper' check (account_type in ('landscaper', 'client')),
  category text not null default 'feedback' check (category in ('feedback', 'review', 'bug', 'feature')),
  rating integer check (rating between 1 and 5),
  title text not null default '',
  message text not null,
  allow_public boolean not null default false,
  status text not null default 'new' check (status in ('new', 'reviewed', 'planned', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;
revoke all on public.feedback_submissions from anon, authenticated;
grant select, insert on public.feedback_submissions to authenticated;
grant all on public.feedback_submissions to service_role;

drop policy if exists feedback_select_own_or_admin on public.feedback_submissions;
create policy feedback_select_own_or_admin
on public.feedback_submissions
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
);

drop policy if exists feedback_insert_own on public.feedback_submissions;
create policy feedback_insert_own
on public.feedback_submissions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    workspace_id is null
    or exists (
      select 1 from public.workspace_memberships wm
      where wm.workspace_id = feedback_submissions.workspace_id
        and wm.user_id = auth.uid()
    )
  )
);

drop trigger if exists feedback_touch_updated_at on public.feedback_submissions;
create trigger feedback_touch_updated_at
before update on public.feedback_submissions
for each row execute function public.marketplace_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Public business profiles and worker profiles
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_business_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  display_name text not null,
  headline text not null default '',
  description text not null default '',
  services text[] not null default '{}',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  service_radius_miles integer not null default 25 check (service_radius_miles between 1 and 500),
  published boolean not null default false,
  accepting_client_work boolean not null default false,
  hiring boolean not null default false,
  availability_note text not null default '',
  website_url text not null default '',
  public_email text not null default '',
  public_phone text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_worker_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text not null default '',
  bio text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  years_experience numeric not null default 0 check (years_experience between 0 and 80),
  skills text[] not null default '{}',
  resume_path text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_business_location_idx
on public.marketplace_business_profiles (lower(state), lower(city))
where published = true;

create index if not exists marketplace_business_services_gin_idx
on public.marketplace_business_profiles using gin (services);

create index if not exists marketplace_business_display_name_trgm_idx
on public.marketplace_business_profiles using gin (display_name gin_trgm_ops);

create index if not exists marketplace_business_description_trgm_idx
on public.marketplace_business_profiles using gin (description gin_trgm_ops);

alter table public.marketplace_business_profiles enable row level security;
alter table public.marketplace_worker_profiles enable row level security;

revoke all on public.marketplace_business_profiles, public.marketplace_worker_profiles from anon, authenticated;
grant select, insert, update, delete on public.marketplace_business_profiles to authenticated;
grant select, insert, update on public.marketplace_worker_profiles to authenticated;
grant all on public.marketplace_business_profiles, public.marketplace_worker_profiles to service_role;

drop policy if exists marketplace_business_select_published_or_manager on public.marketplace_business_profiles;
create policy marketplace_business_select_published_or_manager
on public.marketplace_business_profiles
for select
to authenticated
using (published = true or public.marketplace_can_manage_workspace(workspace_id));

drop policy if exists marketplace_business_insert_manager on public.marketplace_business_profiles;
create policy marketplace_business_insert_manager
on public.marketplace_business_profiles
for insert
to authenticated
with check (
  public.marketplace_can_manage_workspace(workspace_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.workspaces w
    where w.id = marketplace_business_profiles.workspace_id
      and w.kind in ('company', 'workgroup')
  )
);

drop policy if exists marketplace_business_update_manager on public.marketplace_business_profiles;
create policy marketplace_business_update_manager
on public.marketplace_business_profiles
for update
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id))
with check (public.marketplace_can_manage_workspace(workspace_id));

drop policy if exists marketplace_business_delete_owner on public.marketplace_business_profiles;
create policy marketplace_business_delete_owner
on public.marketplace_business_profiles
for delete
to authenticated
using (public.marketplace_workspace_role(workspace_id) in ('owner', 'co_owner'));

drop policy if exists marketplace_worker_select_own on public.marketplace_worker_profiles;
create policy marketplace_worker_select_own
on public.marketplace_worker_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists marketplace_worker_insert_own on public.marketplace_worker_profiles;
create policy marketplace_worker_insert_own
on public.marketplace_worker_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists marketplace_worker_update_own on public.marketplace_worker_profiles;
create policy marketplace_worker_update_own
on public.marketplace_worker_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists marketplace_business_touch_updated_at on public.marketplace_business_profiles;
create trigger marketplace_business_touch_updated_at
before update on public.marketplace_business_profiles
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_worker_touch_updated_at on public.marketplace_worker_profiles;
create trigger marketplace_worker_touch_updated_at
before update on public.marketplace_worker_profiles
for each row execute function public.marketplace_touch_updated_at();

-- Private resume storage. Applicants upload into their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-resumes',
  'marketplace-resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 5. Hiring market: openings and applications
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_job_openings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text not null,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'seasonal', 'contract', 'temporary')),
  compensation_type text not null default 'hourly'
    check (compensation_type in ('hourly', 'salary', 'project', 'discuss')),
  pay_min numeric,
  pay_max numeric,
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pay_min is null or pay_min >= 0),
  check (pay_max is null or pay_max >= 0),
  check (pay_min is null or pay_max is null or pay_max >= pay_min)
);

create table if not exists public.marketplace_job_applications (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.marketplace_job_openings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  cover_note text not null default '',
  resume_path text,
  profile_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opening_id, applicant_user_id)
);

create index if not exists marketplace_openings_location_idx
on public.marketplace_job_openings (lower(state), lower(city), active);

create index if not exists marketplace_openings_title_trgm_idx
on public.marketplace_job_openings using gin (title gin_trgm_ops);

create index if not exists marketplace_applications_workspace_idx
on public.marketplace_job_applications (workspace_id, status, created_at desc);

alter table public.marketplace_job_openings enable row level security;
alter table public.marketplace_job_applications enable row level security;

revoke all on public.marketplace_job_openings, public.marketplace_job_applications from anon, authenticated;
grant select, insert, update, delete on public.marketplace_job_openings to authenticated;
grant select, insert, update on public.marketplace_job_applications to authenticated;
grant all on public.marketplace_job_openings, public.marketplace_job_applications to service_role;

drop policy if exists marketplace_openings_select_active_or_manager on public.marketplace_job_openings;
create policy marketplace_openings_select_active_or_manager
on public.marketplace_job_openings
for select
to authenticated
using (
  (active = true and (expires_at is null or expires_at > now()))
  or public.marketplace_can_manage_workspace(workspace_id)
);

drop policy if exists marketplace_openings_insert_manager on public.marketplace_job_openings;
create policy marketplace_openings_insert_manager
on public.marketplace_job_openings
for insert
to authenticated
with check (
  public.marketplace_can_manage_workspace(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists marketplace_openings_update_manager on public.marketplace_job_openings;
create policy marketplace_openings_update_manager
on public.marketplace_job_openings
for update
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id))
with check (public.marketplace_can_manage_workspace(workspace_id));

drop policy if exists marketplace_openings_delete_manager on public.marketplace_job_openings;
create policy marketplace_openings_delete_manager
on public.marketplace_job_openings
for delete
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id));

drop policy if exists marketplace_applications_select_applicant_or_manager on public.marketplace_job_applications;
create policy marketplace_applications_select_applicant_or_manager
on public.marketplace_job_applications
for select
to authenticated
using (
  applicant_user_id = auth.uid()
  or public.marketplace_can_manage_workspace(workspace_id)
);

drop policy if exists marketplace_applications_insert_applicant on public.marketplace_job_applications;
create policy marketplace_applications_insert_applicant
on public.marketplace_job_applications
for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.account_type = 'landscaper'
  )
  and exists (
    select 1
    from public.marketplace_job_openings o
    where o.id = marketplace_job_applications.opening_id
      and o.workspace_id = marketplace_job_applications.workspace_id
      and o.active = true
      and (o.expires_at is null or o.expires_at > now())
  )
);

drop policy if exists marketplace_applications_update_manager on public.marketplace_job_applications;
create policy marketplace_applications_update_manager
on public.marketplace_job_applications
for update
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id))
with check (public.marketplace_can_manage_workspace(workspace_id));

drop trigger if exists marketplace_openings_touch_updated_at on public.marketplace_job_openings;
create trigger marketplace_openings_touch_updated_at
before update on public.marketplace_job_openings
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists marketplace_applications_touch_updated_at on public.marketplace_job_applications;
create trigger marketplace_applications_touch_updated_at
before update on public.marketplace_job_applications
for each row execute function public.marketplace_touch_updated_at();

create or replace function public.approve_marketplace_application(
  requested_application_id uuid,
  requested_position_title text default 'Landscaper',
  requested_hourly_rate numeric default 0
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  application_row public.marketplace_job_applications%rowtype;
  existing_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into application_row
  from public.marketplace_job_applications
  where id = requested_application_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if not public.marketplace_can_manage_workspace(application_row.workspace_id) then
    raise exception 'Only a workspace owner or manager can approve this application.';
  end if;

  perform public.assert_workspace_feature(
    application_row.workspace_id,
    'team',
    'Adding an applicant to the team requires YardPilot Pro.'
  );

  select id into existing_membership_id
  from public.workspace_memberships
  where workspace_id = application_row.workspace_id
    and user_id = application_row.applicant_user_id
  limit 1;

  if existing_membership_id is null then
    insert into public.workspace_memberships (
      id,
      workspace_id,
      user_id,
      role,
      position_title,
      hourly_rate,
      created_at
    ) values (
      gen_random_uuid(),
      application_row.workspace_id,
      application_row.applicant_user_id,
      'employee',
      coalesce(nullif(trim(requested_position_title), ''), 'Landscaper'),
      greatest(coalesce(requested_hourly_rate, 0), 0),
      now()
    );
  else
    update public.workspace_memberships
    set role = case when role = 'owner' then role else 'employee' end,
        position_title = coalesce(nullif(trim(requested_position_title), ''), position_title, 'Landscaper'),
        hourly_rate = greatest(coalesce(requested_hourly_rate, hourly_rate, 0), 0)
    where id = existing_membership_id;
  end if;

  update public.marketplace_job_applications
  set status = 'accepted', updated_at = now()
  where id = application_row.id;

  return application_row.workspace_id;
end;
$$;

revoke all on function public.approve_marketplace_application(uuid,text,numeric) from public;
grant execute on function public.approve_marketplace_application(uuid,text,numeric) to authenticated;

-- Storage policies are created after applications exist because manager access
-- checks application ownership.
drop policy if exists marketplace_resumes_insert_own on storage.objects;
create policy marketplace_resumes_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_resumes_select_authorized on storage.objects;
create policy marketplace_resumes_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.marketplace_job_applications a
      where a.resume_path = storage.objects.name
        and public.marketplace_can_manage_workspace(a.workspace_id)
    )
  )
);

drop policy if exists marketplace_resumes_update_own on storage.objects;
create policy marketplace_resumes_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_resumes_delete_own on storage.objects;
create policy marketplace_resumes_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 6. Client bidding market
-- ---------------------------------------------------------------------------

create table if not exists public.client_job_requests (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  service_type text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  budget_min numeric,
  budget_max numeric,
  desired_start date,
  bid_deadline timestamptz,
  status text not null default 'open'
    check (status in ('draft', 'open', 'awarded', 'closed', 'cancelled')),
  awarded_bid_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_min >= 0),
  check (budget_max is null or budget_max >= 0),
  check (budget_min is null or budget_max is null or budget_max >= budget_min)
);

create table if not exists public.client_job_bids (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.client_job_requests(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  amount numeric,
  message text not null,
  proposed_start date,
  status text not null default 'submitted'
    check (status in ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, workspace_id),
  check (amount is null or amount >= 0)
);

alter table public.client_job_requests
  drop constraint if exists client_job_requests_awarded_bid_id_fkey;

alter table public.client_job_requests
  add constraint client_job_requests_awarded_bid_id_fkey
  foreign key (awarded_bid_id) references public.client_job_bids(id) on delete set null
  deferrable initially deferred;

create index if not exists client_job_requests_location_idx
on public.client_job_requests (lower(state), lower(city), status, created_at desc);

create index if not exists client_job_requests_title_trgm_idx
on public.client_job_requests using gin (title gin_trgm_ops);

create index if not exists client_job_bids_workspace_idx
on public.client_job_bids (workspace_id, status, created_at desc);

alter table public.client_job_requests enable row level security;
alter table public.client_job_bids enable row level security;

revoke all on public.client_job_requests, public.client_job_bids from anon, authenticated;
grant select, insert, update, delete on public.client_job_requests to authenticated;
grant select, insert, update on public.client_job_bids to authenticated;
grant all on public.client_job_requests, public.client_job_bids to service_role;

drop policy if exists client_requests_select_owner_or_landscaper on public.client_job_requests;
create policy client_requests_select_owner_or_landscaper
on public.client_job_requests
for select
to authenticated
using (
  client_user_id = auth.uid()
  or (
    status = 'open'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_type = 'landscaper'
    )
  )
);

drop policy if exists client_requests_insert_owner on public.client_job_requests;
create policy client_requests_insert_owner
on public.client_job_requests
for insert
to authenticated
with check (
  client_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'client'
  )
);

drop policy if exists client_requests_update_owner on public.client_job_requests;
create policy client_requests_update_owner
on public.client_job_requests
for update
to authenticated
using (client_user_id = auth.uid())
with check (client_user_id = auth.uid());

drop policy if exists client_requests_delete_owner on public.client_job_requests;
create policy client_requests_delete_owner
on public.client_job_requests
for delete
to authenticated
using (client_user_id = auth.uid());

drop policy if exists client_bids_select_client_or_workspace on public.client_job_bids;
create policy client_bids_select_client_or_workspace
on public.client_job_bids
for select
to authenticated
using (
  public.marketplace_can_manage_workspace(workspace_id)
  or exists (
    select 1 from public.client_job_requests r
    where r.id = client_job_bids.request_id
      and r.client_user_id = auth.uid()
  )
);

drop policy if exists client_bids_insert_workspace_manager on public.client_job_bids;
create policy client_bids_insert_workspace_manager
on public.client_job_bids
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and public.marketplace_can_manage_workspace(workspace_id)
  and exists (
    select 1 from public.client_job_requests r
    where r.id = client_job_bids.request_id
      and r.status = 'open'
  )
  and exists (
    select 1 from public.marketplace_business_profiles bp
    where bp.workspace_id = client_job_bids.workspace_id
      and bp.published = true
      and bp.accepting_client_work = true
  )
);

drop policy if exists client_bids_update_workspace_manager on public.client_job_bids;
create policy client_bids_update_workspace_manager
on public.client_job_bids
for update
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id))
with check (public.marketplace_can_manage_workspace(workspace_id));

drop trigger if exists client_requests_touch_updated_at on public.client_job_requests;
create trigger client_requests_touch_updated_at
before update on public.client_job_requests
for each row execute function public.marketplace_touch_updated_at();

drop trigger if exists client_bids_touch_updated_at on public.client_job_bids;
create trigger client_bids_touch_updated_at
before update on public.client_job_bids
for each row execute function public.marketplace_touch_updated_at();

create or replace function public.accept_client_job_bid(requested_bid_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  bid_row public.client_job_bids%rowtype;
  request_row public.client_job_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into bid_row
  from public.client_job_bids
  where id = requested_bid_id
  for update;

  if bid_row.id is null then
    raise exception 'Bid not found.';
  end if;

  select * into request_row
  from public.client_job_requests
  where id = bid_row.request_id
  for update;

  if request_row.client_user_id <> auth.uid() then
    raise exception 'Only the client who posted this request can accept a bid.';
  end if;

  if request_row.status <> 'open' then
    raise exception 'This request is no longer accepting bids.';
  end if;

  update public.client_job_bids
  set status = case when id = bid_row.id then 'accepted' else 'rejected' end,
      updated_at = now()
  where request_id = request_row.id
    and status in ('submitted', 'shortlisted');

  update public.client_job_requests
  set status = 'awarded',
      awarded_bid_id = bid_row.id,
      updated_at = now()
  where id = request_row.id;

  return bid_row.workspace_id;
end;
$$;

revoke all on function public.accept_client_job_bid(uuid) from public;
grant execute on function public.accept_client_job_bid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Server-side, paginated marketplace search functions
-- ---------------------------------------------------------------------------

create or replace function public.search_marketplace_businesses(
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
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bp.workspace_id,
    bp.display_name,
    bp.headline,
    bp.description,
    bp.services,
    bp.city,
    bp.state,
    bp.postal_code,
    bp.service_radius_miles,
    bp.accepting_client_work,
    bp.hiring,
    bp.availability_note,
    bp.website_url,
    bp.public_email,
    bp.public_phone,
    bp.updated_at,
    count(*) over() as total_count
  from public.marketplace_business_profiles bp
  where auth.uid() is not null
    and bp.published = true
    and (
      trim(coalesce(requested_city, '')) = ''
      or lower(bp.city) = lower(trim(requested_city))
    )
    and (
      trim(coalesce(requested_state, '')) = ''
      or lower(bp.state) = lower(trim(requested_state))
    )
    and (
      trim(coalesce(requested_service, '')) = ''
      or exists (
        select 1 from unnest(bp.services) service
        where service ilike '%' || trim(requested_service) || '%'
      )
    )
    and (
      trim(coalesce(search_query, '')) = ''
      or bp.display_name ilike '%' || trim(search_query) || '%'
      or bp.headline ilike '%' || trim(search_query) || '%'
      or bp.description ilike '%' || trim(search_query) || '%'
      or exists (
        select 1 from unnest(bp.services) service
        where service ilike '%' || trim(search_query) || '%'
      )
    )
  order by
    bp.accepting_client_work desc,
    bp.hiring desc,
    bp.updated_at desc
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

revoke all on function public.search_marketplace_businesses(text,text,text,text,integer,integer) from public;
grant execute on function public.search_marketplace_businesses(text,text,text,text,integer,integer) to authenticated;

create or replace function public.search_marketplace_job_openings(
  search_query text default '',
  requested_city text default '',
  requested_state text default '',
  requested_employment_type text default '',
  page_size integer default 20,
  page_offset integer default 0
)
returns table (
  id uuid,
  workspace_id uuid,
  business_name text,
  business_headline text,
  title text,
  description text,
  employment_type text,
  compensation_type text,
  pay_min numeric,
  pay_max numeric,
  city text,
  state text,
  postal_code text,
  expires_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.workspace_id,
    bp.display_name as business_name,
    bp.headline as business_headline,
    o.title,
    o.description,
    o.employment_type,
    o.compensation_type,
    o.pay_min,
    o.pay_max,
    o.city,
    o.state,
    o.postal_code,
    o.expires_at,
    o.created_at,
    count(*) over() as total_count
  from public.marketplace_job_openings o
  join public.marketplace_business_profiles bp on bp.workspace_id = o.workspace_id
  where auth.uid() is not null
    and o.active = true
    and (o.expires_at is null or o.expires_at > now())
    and bp.published = true
    and bp.hiring = true
    and (
      trim(coalesce(requested_city, '')) = ''
      or lower(o.city) = lower(trim(requested_city))
    )
    and (
      trim(coalesce(requested_state, '')) = ''
      or lower(o.state) = lower(trim(requested_state))
    )
    and (
      trim(coalesce(requested_employment_type, '')) = ''
      or o.employment_type = lower(trim(requested_employment_type))
    )
    and (
      trim(coalesce(search_query, '')) = ''
      or o.title ilike '%' || trim(search_query) || '%'
      or o.description ilike '%' || trim(search_query) || '%'
      or bp.display_name ilike '%' || trim(search_query) || '%'
    )
  order by o.created_at desc
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

revoke all on function public.search_marketplace_job_openings(text,text,text,text,integer,integer) from public;
grant execute on function public.search_marketplace_job_openings(text,text,text,text,integer,integer) to authenticated;

create or replace function public.search_client_job_requests(
  search_query text default '',
  requested_city text default '',
  requested_state text default '',
  requested_service text default '',
  page_size integer default 20,
  page_offset integer default 0
)
returns table (
  id uuid,
  client_user_id uuid,
  title text,
  description text,
  service_type text,
  city text,
  state text,
  postal_code text,
  budget_min numeric,
  budget_max numeric,
  desired_start date,
  bid_deadline timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_type = 'landscaper'
  ) then
    raise exception 'Only landscaper accounts can browse the bidding market.';
  end if;

  return query
  select
    r.id,
    r.client_user_id,
    r.title,
    r.description,
    r.service_type,
    r.city,
    r.state,
    r.postal_code,
    r.budget_min,
    r.budget_max,
    r.desired_start,
    r.bid_deadline,
    r.created_at,
    count(*) over() as total_count
  from public.client_job_requests r
  where r.status = 'open'
    and (r.bid_deadline is null or r.bid_deadline > now())
    and (
      trim(coalesce(requested_city, '')) = ''
      or lower(r.city) = lower(trim(requested_city))
    )
    and (
      trim(coalesce(requested_state, '')) = ''
      or lower(r.state) = lower(trim(requested_state))
    )
    and (
      trim(coalesce(requested_service, '')) = ''
      or r.service_type ilike '%' || trim(requested_service) || '%'
    )
    and (
      trim(coalesce(search_query, '')) = ''
      or r.title ilike '%' || trim(search_query) || '%'
      or r.description ilike '%' || trim(search_query) || '%'
      or r.service_type ilike '%' || trim(search_query) || '%'
    )
  order by r.created_at desc
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

revoke all on function public.search_client_job_requests(text,text,text,text,integer,integer) from public;
grant execute on function public.search_client_job_requests(text,text,text,text,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Marketplace moderation triggers
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_validate_record_text()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  payload text := '';
begin
  if tg_table_name = 'feedback_submissions' then
    payload := concat_ws(' ', new.title, new.message);
  elsif tg_table_name = 'marketplace_business_profiles' then
    payload := concat_ws(' ', new.display_name, new.headline, new.description, array_to_string(new.services, ' '), new.availability_note);
  elsif tg_table_name = 'marketplace_worker_profiles' then
    payload := concat_ws(' ', new.headline, new.bio, array_to_string(new.skills, ' '));
  elsif tg_table_name = 'marketplace_job_openings' then
    payload := concat_ws(' ', new.title, new.description);
  elsif tg_table_name = 'marketplace_job_applications' then
    payload := concat_ws(' ', new.cover_note, new.profile_snapshot::text);
  elsif tg_table_name = 'client_job_requests' then
    payload := concat_ws(' ', new.title, new.description, new.service_type);
  elsif tg_table_name = 'client_job_bids' then
    payload := concat_ws(' ', new.message);
  end if;

  perform public.marketplace_assert_safe_text(payload, 'Marketplace content');
  return new;
end;
$$;

revoke all on function public.marketplace_validate_record_text() from public;

-- The label above is only a visual marker in this file; PostgreSQL ignores comments,
-- and the following trigger statements are explicit for safe re-runs.

drop trigger if exists feedback_validate_text on public.feedback_submissions;
create trigger feedback_validate_text
before insert or update on public.feedback_submissions
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists marketplace_business_validate_text on public.marketplace_business_profiles;
create trigger marketplace_business_validate_text
before insert or update on public.marketplace_business_profiles
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists marketplace_worker_validate_text on public.marketplace_worker_profiles;
create trigger marketplace_worker_validate_text
before insert or update on public.marketplace_worker_profiles
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists marketplace_openings_validate_text on public.marketplace_job_openings;
create trigger marketplace_openings_validate_text
before insert or update on public.marketplace_job_openings
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists marketplace_applications_validate_text on public.marketplace_job_applications;
create trigger marketplace_applications_validate_text
before insert or update on public.marketplace_job_applications
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists client_requests_validate_text on public.client_job_requests;
create trigger client_requests_validate_text
before insert or update on public.client_job_requests
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists client_bids_validate_text on public.client_job_bids;
create trigger client_bids_validate_text
before insert or update on public.client_job_bids
for each row execute function public.marketplace_validate_record_text();


-- ---------------------------------------------------------------------------
-- 9. Accepted-bid work orders and existing estimate/invoice integration
-- ---------------------------------------------------------------------------

alter table public.client_job_requests
  add column if not exists client_name text not null default '',
  add column if not exists client_email text not null default '',
  add column if not exists client_phone text not null default '';

-- Once a client accepts a bid, the accepted company keeps access to the request
-- while other landscapers only retain access to requests that are still open.
drop policy if exists client_requests_select_owner_or_landscaper on public.client_job_requests;
create policy client_requests_select_owner_or_landscaper
on public.client_job_requests
for select
to authenticated
using (
  client_user_id = auth.uid()
  or (
    status = 'open'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_type = 'landscaper'
    )
  )
  or exists (
    select 1
    from public.client_job_bids b
    where b.request_id = client_job_requests.id
      and b.status = 'accepted'
      and public.marketplace_can_manage_workspace(b.workspace_id)
  )
);

create table if not exists public.marketplace_work_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.client_job_requests(id) on delete cascade,
  bid_id uuid not null unique references public.client_job_bids(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  project_id text,
  invoice_id text,
  status text not null default 'accepted'
    check (status in ('accepted', 'estimate_created', 'invoiced', 'paid', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_work_orders_workspace_idx
on public.marketplace_work_orders(workspace_id, status, updated_at desc);

create index if not exists marketplace_work_orders_client_idx
on public.marketplace_work_orders(client_user_id, status, updated_at desc);

alter table public.marketplace_work_orders enable row level security;
revoke all on public.marketplace_work_orders from anon, authenticated;
grant select on public.marketplace_work_orders to authenticated;
grant all on public.marketplace_work_orders to service_role;

drop policy if exists marketplace_work_orders_select_participants on public.marketplace_work_orders;
create policy marketplace_work_orders_select_participants
on public.marketplace_work_orders
for select
to authenticated
using (
  client_user_id = auth.uid()
  or public.marketplace_can_manage_workspace(workspace_id)
);

drop trigger if exists marketplace_work_orders_touch_updated_at on public.marketplace_work_orders;
create trigger marketplace_work_orders_touch_updated_at
before update on public.marketplace_work_orders
for each row execute function public.marketplace_touch_updated_at();

create or replace function public.accept_client_job_bid(requested_bid_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  bid_row public.client_job_bids%rowtype;
  request_row public.client_job_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into bid_row
  from public.client_job_bids
  where id = requested_bid_id
  for update;

  if bid_row.id is null then
    raise exception 'Bid not found.';
  end if;

  select * into request_row
  from public.client_job_requests
  where id = bid_row.request_id
  for update;

  if request_row.client_user_id <> auth.uid() then
    raise exception 'Only the client who posted this request can accept a bid.';
  end if;

  if request_row.status <> 'open' then
    raise exception 'This request is no longer accepting bids.';
  end if;

  update public.client_job_bids
  set status = case when id = bid_row.id then 'accepted' else 'rejected' end,
      updated_at = now()
  where request_id = request_row.id
    and status in ('submitted', 'shortlisted');

  update public.client_job_requests
  set status = 'awarded',
      awarded_bid_id = bid_row.id,
      updated_at = now()
  where id = request_row.id;

  insert into public.marketplace_work_orders(
    request_id,
    bid_id,
    workspace_id,
    client_user_id,
    status
  ) values (
    request_row.id,
    bid_row.id,
    bid_row.workspace_id,
    request_row.client_user_id,
    'accepted'
  )
  on conflict (request_id) do update set
    bid_id = excluded.bid_id,
    workspace_id = excluded.workspace_id,
    client_user_id = excluded.client_user_id,
    status = 'accepted',
    updated_at = now();

  return bid_row.workspace_id;
end;
$$;

revoke all on function public.accept_client_job_bid(uuid) from public;
grant execute on function public.accept_client_job_bid(uuid) to authenticated;

create or replace function public.get_marketplace_request_for_estimate(requested_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select jsonb_build_object(
    'requestId', r.id,
    'workOrderId', wo.id,
    'workspaceId', wo.workspace_id,
    'title', r.title,
    'description', r.description,
    'serviceType', r.service_type,
    'city', r.city,
    'state', r.state,
    'postalCode', r.postal_code,
    'clientName', r.client_name,
    'clientEmail', r.client_email,
    'clientPhone', r.client_phone,
    'desiredStart', r.desired_start,
    'acceptedBidAmount', b.amount,
    'acceptedBidMessage', b.message,
    'proposedStart', b.proposed_start,
    'projectId', wo.project_id
  ) into result
  from public.marketplace_work_orders wo
  join public.client_job_requests r on r.id = wo.request_id
  join public.client_job_bids b on b.id = wo.bid_id
  where wo.request_id = requested_request_id
    and public.marketplace_can_manage_workspace(wo.workspace_id)
  limit 1;

  if result is null then
    raise exception 'Accepted marketplace request not found for the active workspace.';
  end if;

  return result;
end;
$$;

revoke all on function public.get_marketplace_request_for_estimate(uuid) from public;
grant execute on function public.get_marketplace_request_for_estimate(uuid) to authenticated;

create or replace function public.link_marketplace_request_project(
  requested_request_id uuid,
  requested_project_id text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  work_order_row public.marketplace_work_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into work_order_row
  from public.marketplace_work_orders
  where request_id = requested_request_id
  for update;

  if work_order_row.id is null
     or not public.marketplace_can_manage_workspace(work_order_row.workspace_id) then
    raise exception 'You cannot link this marketplace request.';
  end if;

  if not exists (
    select 1 from public.projects p
    where p.id::text = requested_project_id
      and p.workspace_id = work_order_row.workspace_id
  ) then
    raise exception 'The estimate does not belong to the accepted workspace.';
  end if;

  update public.marketplace_work_orders
  set project_id = requested_project_id,
      status = case when status in ('paid', 'completed') then status else 'estimate_created' end,
      updated_at = now()
  where id = work_order_row.id;

  return work_order_row.id;
end;
$$;

revoke all on function public.link_marketplace_request_project(uuid,text) from public;
grant execute on function public.link_marketplace_request_project(uuid,text) to authenticated;

-- Automatically connect an invoice to the marketplace work order whenever the
-- existing YardPilot invoice workflow links that invoice to the accepted project.
create or replace function public.marketplace_sync_invoice_work_order()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.project_id is null then
    return new;
  end if;

  update public.marketplace_work_orders
  set invoice_id = new.id::text,
      status = case
        when coalesce(new.payment_status, '') = 'paid' or new.paid_at is not null then 'paid'
        else 'invoiced'
      end,
      updated_at = now()
  where project_id = new.project_id::text
    and workspace_id = new.workspace_id;

  return new;
end;
$$;

revoke all on function public.marketplace_sync_invoice_work_order() from public;

drop trigger if exists marketplace_invoice_work_order_sync on public.invoices;
create trigger marketplace_invoice_work_order_sync
after insert or update of project_id, payment_status, paid_at, share_enabled
on public.invoices
for each row execute function public.marketplace_sync_invoice_work_order();

create or replace function public.get_my_marketplace_work_orders()
returns table (
  work_order_id uuid,
  request_id uuid,
  request_title text,
  workspace_id uuid,
  business_name text,
  bid_amount numeric,
  work_status text,
  project_id text,
  invoice_id text,
  invoice_number text,
  invoice_amount numeric,
  invoice_payment_status text,
  invoice_share_token text,
  invoice_share_enabled boolean,
  invoice_paid_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.id,
    wo.request_id,
    r.title,
    wo.workspace_id,
    coalesce(bp.display_name, w.name),
    b.amount,
    wo.status,
    wo.project_id,
    wo.invoice_id,
    i.invoice_number,
    i.amount,
    i.payment_status::text,
    i.share_token,
    coalesce(i.share_enabled, false),
    i.paid_at,
    wo.updated_at
  from public.marketplace_work_orders wo
  join public.client_job_requests r on r.id = wo.request_id
  join public.client_job_bids b on b.id = wo.bid_id
  join public.workspaces w on w.id = wo.workspace_id
  left join public.marketplace_business_profiles bp on bp.workspace_id = wo.workspace_id
  left join public.invoices i on i.id::text = wo.invoice_id
  where wo.client_user_id = auth.uid()
  order by wo.updated_at desc;
$$;

revoke all on function public.get_my_marketplace_work_orders() from public;
grant execute on function public.get_my_marketplace_work_orders() to authenticated;

create or replace function public.get_workspace_marketplace_work_orders(
  requested_workspace_id uuid
)
returns table (
  work_order_id uuid,
  request_id uuid,
  request_title text,
  request_description text,
  service_type text,
  city text,
  state text,
  postal_code text,
  client_name text,
  client_email text,
  client_phone text,
  bid_amount numeric,
  work_status text,
  project_id text,
  invoice_id text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.marketplace_can_manage_workspace(requested_workspace_id) then
    raise exception 'Only a workspace owner or manager can view accepted marketplace projects.';
  end if;

  return query
  select
    wo.id,
    wo.request_id,
    r.title,
    r.description,
    r.service_type,
    r.city,
    r.state,
    r.postal_code,
    r.client_name,
    r.client_email,
    r.client_phone,
    b.amount,
    wo.status,
    wo.project_id,
    wo.invoice_id,
    wo.updated_at
  from public.marketplace_work_orders wo
  join public.client_job_requests r on r.id = wo.request_id
  join public.client_job_bids b on b.id = wo.bid_id
  where wo.workspace_id = requested_workspace_id
  order by wo.updated_at desc;
end;
$$;

revoke all on function public.get_workspace_marketplace_work_orders(uuid) from public;
grant execute on function public.get_workspace_marketplace_work_orders(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Employee payment ledger
-- ---------------------------------------------------------------------------

create table if not exists public.employee_payment_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  period_start date,
  period_end date,
  scheduled_for date,
  hours numeric not null default 0 check (hours >= 0),
  hourly_rate numeric not null default 0 check (hourly_rate >= 0),
  adjustment_amount numeric not null default 0,
  gross_amount numeric not null default 0 check (gross_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'due', 'paid', 'void')),
  payment_method text not null default ''
    check (payment_method in ('', 'payroll_provider', 'bank_transfer', 'cash', 'check', 'card', 'other')),
  external_reference text not null default '',
  notes text not null default '',
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_end >= period_start)
);

create index if not exists employee_payment_records_workspace_idx
on public.employee_payment_records(workspace_id, status, created_at desc);

create index if not exists employee_payment_records_employee_idx
on public.employee_payment_records(employee_user_id, created_at desc);

alter table public.employee_payment_records enable row level security;
revoke all on public.employee_payment_records from anon, authenticated;
grant select, insert, update, delete on public.employee_payment_records to authenticated;
grant all on public.employee_payment_records to service_role;

drop policy if exists employee_payments_select_participants on public.employee_payment_records;
create policy employee_payments_select_participants
on public.employee_payment_records
for select
to authenticated
using (
  employee_user_id = auth.uid()
  or public.marketplace_can_manage_workspace(workspace_id)
);

drop policy if exists employee_payments_insert_manager on public.employee_payment_records;
create policy employee_payments_insert_manager
on public.employee_payment_records
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.marketplace_can_manage_workspace(workspace_id)
);

drop policy if exists employee_payments_update_manager on public.employee_payment_records;
create policy employee_payments_update_manager
on public.employee_payment_records
for update
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id))
with check (public.marketplace_can_manage_workspace(workspace_id));

drop policy if exists employee_payments_delete_manager on public.employee_payment_records;
create policy employee_payments_delete_manager
on public.employee_payment_records
for delete
to authenticated
using (public.marketplace_can_manage_workspace(workspace_id));

create or replace function public.validate_employee_payment_record()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  membership_role text;
begin
  perform public.assert_workspace_feature(
    new.workspace_id,
    'team',
    'Employee payment records require YardPilot Pro.'
  );

  select wm.role::text into membership_role
  from public.workspace_memberships wm
  where wm.workspace_id = new.workspace_id
    and wm.user_id = new.employee_user_id
  limit 1;

  if membership_role is null or membership_role <> 'employee' then
    raise exception 'Choose an employee who belongs to this workspace.';
  end if;

  new.hours := greatest(coalesce(new.hours, 0), 0);
  new.hourly_rate := greatest(coalesce(new.hourly_rate, 0), 0);
  new.adjustment_amount := coalesce(new.adjustment_amount, 0);
  new.gross_amount := greatest(
    round((new.hours * new.hourly_rate) + new.adjustment_amount, 2),
    0
  );

  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.paid_by := coalesce(new.paid_by, auth.uid());
  elsif new.status in ('draft', 'due') then
    new.paid_at := null;
    new.paid_by := null;
  end if;

  perform public.marketplace_assert_safe_text(
    concat_ws(' ', new.notes, new.external_reference),
    'Employee payment notes'
  );

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_employee_payment_record() from public;

drop trigger if exists employee_payment_records_validate on public.employee_payment_records;
create trigger employee_payment_records_validate
before insert or update on public.employee_payment_records
for each row execute function public.validate_employee_payment_record();

commit;

-- ---------------------------------------------------------------------------
-- After the migration succeeds, add your own login as a platform admin.
-- Replace the email before running this separate statement:
--
-- insert into public.platform_admins(user_id)
-- select id from auth.users where lower(email) = lower('YOUR_LOGIN_EMAIL')
-- on conflict (user_id) do nothing;
-- ---------------------------------------------------------------------------

select
  'marketplace migration complete' as status,
  count(*) filter (where account_type = 'client') as client_profiles,
  count(*) filter (where account_type = 'landscaper') as landscaper_profiles
from public.profiles;
