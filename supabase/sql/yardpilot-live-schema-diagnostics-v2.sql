-- YardPilot live schema diagnostics v2
-- Read-only. Run in the Supabase SQL Editor after the corrected launch-hardening migration.

-- Required tables used by the current frontend/hardening release.
with required(name) as (
  values
    ('profiles'), ('profile_modes'), ('workspaces'), ('workspace_memberships'),
    ('projects'), ('project_assignments'), ('contacts'), ('properties'),
    ('property_photos'), ('invoices'), ('schedule_events'), ('follow_ups'),
    ('job_requests'), ('workspace_invites'), ('workspace_subscriptions'),
    ('billing_plans'), ('billing_plan_features'), ('feature_flags'),
    ('notifications'), ('notification_preferences'), ('audit_log'),
    ('marketplace_business_profiles'), ('marketplace_worker_profiles'),
    ('marketplace_job_openings'), ('marketplace_job_applications'),
    ('client_job_requests'), ('client_job_bids'), ('stripe_webhook_events')
)
select 'table' as object_type,
       name as object_name,
       to_regclass('public.' || name) is not null as present
from required
order by present, object_name;

-- Required RPC names used by the current application.
with required(name) as (
  values
    ('get_my_profile_modes'), ('enable_my_profile_mode'), ('set_active_profile_mode'),
    ('get_my_workspaces'), ('get_workspace_members'),
    ('get_project_labor_assignments'), ('get_employee_assigned_projects'),
    ('get_employee_estimate_drafts'), ('get_employee_project_operational_details'),
    ('get_workspace_billing_status'), ('submit_estimate_for_approval'),
    ('review_estimate_approval'), ('mark_all_notifications_read'),
    ('claim_stripe_webhook_event'), ('finish_stripe_webhook_event')
)
select 'function' as object_type,
       r.name as object_name,
       exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.name
       ) as present
from required r
order by present, object_name;

-- Billing/paywall functions that perform writes must be VOLATILE.
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

-- RLS state for high-value tables.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'projects','invoices','contacts','properties','notifications',
    'marketplace_business_profiles','marketplace_worker_profiles',
    'marketplace_job_openings','marketplace_job_applications',
    'client_job_requests','client_job_bids'
  )
order by c.relname;

-- Current project policies, including restrictive/permissive type.
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('projects','project_assignments','invoices','client_job_requests','client_job_bids')
order by tablename, policyname;

-- Accepted-bid duplicates must be empty.
select request_id, count(*) as accepted_bid_count, array_agg(id order by created_at) as bid_ids
from public.client_job_bids
where status = 'accepted'
group by request_id
having count(*) > 1;

-- Feature flags should exist after launch hardening.
select key, enabled, description, updated_at
from public.feature_flags
order by key;

-- Failed or stuck webhook records.
select event_id, event_type, livemode, status, attempts, claimed_at, completed_at, last_error
from public.stripe_webhook_events
where status <> 'processed'
order by claimed_at desc
limit 100;
