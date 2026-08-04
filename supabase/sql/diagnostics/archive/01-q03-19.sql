-- Read-only YardPilot launch diagnostics v1

-- Accepted-bid duplicates must be empty before the hardening migration.
select request_id, count(*) as accepted_bid_count, array_agg(id order by created_at) as bid_ids
from public.client_job_bids
where status = 'accepted'
group by request_id
having count(*) > 1;

-- Current feature flags.
select key, enabled, description, updated_at
from public.feature_flags
order by key;

-- Billing/paywall functions that write must be VOLATILE.
select p.oid::regprocedure as function_name,
       case p.provolatile
         when 'v' then 'volatile'
         when 's' then 'stable'
         when 'i' then 'immutable'
       end as volatility
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_workspace_billing_status', 'enforce_workspace_paywall')
order by p.oid::regprocedure::text;

-- Failed/processing webhook records.
select event_id, event_type, livemode, status, attempts, claimed_at, completed_at, last_error
from public.stripe_webhook_events
where status <> 'processed'
order by claimed_at desc
limit 100;

-- Marketplace tables should have RLS enabled.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'marketplace_business_profiles','marketplace_worker_profiles',
    'marketplace_job_openings','marketplace_job_applications',
    'client_job_requests','client_job_bids','projects','invoices','notifications'
  )
order by c.relname;
