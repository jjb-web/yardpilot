-- YardPilot client job requests RLS recursion fix v1
-- Fixes:
--   infinite recursion detected in policy for relation "client_job_requests"
--
-- Cause:
--   client_job_requests SELECT policy queried client_job_bids,
--   while client_job_bids policies queried client_job_requests.
--
-- This is a forward-only policy patch. It deletes no marketplace data.

begin;

-- These helpers execute as the database owner and return only booleans.
-- That lets policies check the related table without invoking that table's RLS
-- and recursively returning to the original policy.

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

-- Replace the request SELECT policy without directly querying client_job_bids.
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
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.account_type = 'landscaper'
    )
  )
  or public.marketplace_user_manages_accepted_request(id)
);

-- Replace bid policies without directly querying client_job_requests.
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

commit;

-- Diagnostic: these policies should no longer contain direct cross-references
-- between client_job_requests and client_job_bids.
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
