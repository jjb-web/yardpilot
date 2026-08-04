-- YardPilot marketplace visibility and RLS repair v2
-- Run once after the marketplace v1 migration and the earlier recursion fix.
-- Forward-only: deletes no users, requests, bids, openings, applications, or payments.

begin;

-- A user may browse landscaper-side marketplaces when their profile is a
-- landscaper account OR they belong to an existing YardPilot workspace.
create or replace function public.marketplace_user_has_landscaper_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and coalesce(p.account_type, 'landscaper') = 'landscaper'
      )
      or exists (
        select 1
        from public.workspace_memberships wm
        where wm.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.marketplace_user_has_landscaper_access() from public;
grant execute on function public.marketplace_user_has_landscaper_access()
  to authenticated, service_role;

-- Recursion-safe ownership helpers. These bypass table RLS only to return a
-- boolean used by another policy; they do not expose rows directly.
create or replace function public.marketplace_client_owns_request(
  requested_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.client_job_requests r
    where r.id = requested_request_id
      and r.client_user_id = auth.uid()
  );
$$;

create or replace function public.marketplace_request_is_open(
  requested_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.client_job_requests r
    where r.id = requested_request_id
      and r.status = 'open'
      and (r.bid_deadline is null or r.bid_deadline > now())
  );
$$;

create or replace function public.marketplace_user_manages_accepted_request(
  requested_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.client_job_bids b
    where b.request_id = requested_request_id
      and b.status = 'accepted'
      and public.marketplace_can_manage_workspace(b.workspace_id)
  );
$$;

revoke all on function public.marketplace_client_owns_request(uuid) from public;
revoke all on function public.marketplace_request_is_open(uuid) from public;
revoke all on function public.marketplace_user_manages_accepted_request(uuid) from public;

grant execute on function public.marketplace_client_owns_request(uuid)
  to authenticated, service_role;
grant execute on function public.marketplace_request_is_open(uuid)
  to authenticated, service_role;
grant execute on function public.marketplace_user_manages_accepted_request(uuid)
  to authenticated, service_role;

-- Replace cross-referencing request/bid policies with recursion-safe policies.
drop policy if exists client_requests_select_owner_or_landscaper
  on public.client_job_requests;

create policy client_requests_select_owner_or_landscaper
on public.client_job_requests
for select
to authenticated
using (
  client_user_id = auth.uid()
  or (
    status = 'open'
    and public.marketplace_user_has_landscaper_access()
  )
  or public.marketplace_user_manages_accepted_request(id)
);

drop policy if exists client_bids_select_client_or_workspace
  on public.client_job_bids;

create policy client_bids_select_client_or_workspace
on public.client_job_bids
for select
to authenticated
using (
  public.marketplace_can_manage_workspace(workspace_id)
  or public.marketplace_client_owns_request(request_id)
);

drop policy if exists client_bids_insert_workspace_manager
  on public.client_job_bids;

create policy client_bids_insert_workspace_manager
on public.client_job_bids
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and public.marketplace_can_manage_workspace(workspace_id)
  and public.marketplace_request_is_open(request_id)
  and exists (
    select 1
    from public.marketplace_business_profiles bp
    where bp.workspace_id = client_job_bids.workspace_id
      and bp.published = true
      and bp.accepting_client_work = true
  )
);

-- Repair the client-project search. It now accepts existing workspace members,
-- uses forgiving location matching, remains paginated, and bypasses RLS safely
-- inside this purpose-built search function.
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
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.marketplace_user_has_landscaper_access() then
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
      or r.city ilike '%' || trim(requested_city) || '%'
    )
    and (
      trim(coalesce(requested_state, '')) = ''
      or lower(trim(r.state)) = lower(trim(requested_state))
      or (
        length(trim(requested_state)) > 2
        and r.state ilike trim(requested_state) || '%'
      )
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
grant execute on function public.search_client_job_requests(text,text,text,text,integer,integer)
  to authenticated;

-- Repair the employee job market. An active opening from a published company is
-- sufficient; the separate profile.hiring checkbox no longer hides a real job.
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
set search_path = public, pg_temp
set row_security = off
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
  join public.marketplace_business_profiles bp
    on bp.workspace_id = o.workspace_id
  where auth.uid() is not null
    and o.active = true
    and (o.expires_at is null or o.expires_at > now())
    and bp.published = true
    and (
      trim(coalesce(requested_city, '')) = ''
      or o.city ilike '%' || trim(requested_city) || '%'
    )
    and (
      trim(coalesce(requested_state, '')) = ''
      or lower(trim(o.state)) = lower(trim(requested_state))
      or (
        length(trim(requested_state)) > 2
        and o.state ilike trim(requested_state) || '%'
      )
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
grant execute on function public.search_marketplace_job_openings(text,text,text,text,integer,integer)
  to authenticated;

commit;

-- Diagnostics: no request/bid policy should directly query the other table.
select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('client_job_requests', 'client_job_bids')
order by tablename, policyname;
