-- YardPilot live database object audit v1
-- READ ONLY. This file does not insert, update, delete, alter, create, or drop anything.
-- Run the entire file in the Supabase SQL Editor and preserve every result tab.

-- ============================================================================
-- 1. Current application tables expected by the uploaded YardPilot code
-- ============================================================================
with required_tables(object_name, purpose) as (
  values
    ('profiles', 'Authentication profile'),
    ('projects', 'Estimates and jobs'),
    ('contacts', 'Customers and leads'),
    ('properties', 'Customer properties'),
    ('property_photos', 'Property photo metadata'),
    ('workspaces', 'Companies and personal workspaces'),
    ('workspace_memberships', 'Workspace roles'),
    ('workspace_invites', 'Team invitations'),
    ('project_assignments', 'Employee job assignments'),
    ('invoices', 'Invoices and payment state'),
    ('schedule_events', 'Scheduling'),
    ('follow_ups', 'Follow-ups and reminders'),
    ('job_requests', 'Internal job requests'),
    ('billing_plans', 'Subscription plans'),
    ('billing_plan_features', 'Plan features'),
    ('workspace_subscriptions', 'Workspace subscription state'),
    ('access_codes', 'Promotional access codes'),
    ('access_code_redemptions', 'Access-code redemption history'),
    ('platform_admins', 'Platform administrators'),
    ('feedback_submissions', 'In-app feedback'),
    ('marketplace_business_profiles', 'Marketplace companies'),
    ('marketplace_worker_profiles', 'Marketplace workers'),
    ('marketplace_job_openings', 'Hiring listings'),
    ('marketplace_job_applications', 'Hiring applications'),
    ('client_job_requests', 'Client marketplace requests'),
    ('client_job_bids', 'Marketplace bids'),
    ('marketplace_work_orders', 'Accepted marketplace work'),
    ('employee_payment_records', 'Employee payment records'),
    ('profile_modes', 'Client/landscaper modes'),
    ('legal_acceptances', 'Terms and privacy acceptance'),
    ('notifications', 'In-app notifications'),
    ('notification_preferences', 'Notification settings'),
    ('audit_log', 'Application audit trail'),
    ('feature_flags', 'Emergency feature switches'),
    ('client_error_reports', 'Client-side error reporting'),
    ('support_messages', 'Contact form submissions'),
    ('interest_signups', 'Landing-page interest signups'),
    ('public_request_limits', 'Public endpoint rate limits'),
    ('stripe_webhook_events', 'Stripe webhook idempotency')
)
select
  rt.object_name,
  rt.purpose,
  to_regclass('public.' || rt.object_name) is not null as exists_in_public
from required_tables rt
order by rt.object_name;

-- ============================================================================
-- 2. RPCs currently called by the uploaded YardPilot frontend
-- ============================================================================
with required_functions(function_name) as (
  values
    ('get_my_profile_modes'),
    ('get_my_workspaces'),
    ('get_workspace_members'),
    ('get_project_labor_assignments'),
    ('get_employee_assigned_projects'),
    ('get_employee_estimate_drafts'),
    ('get_employee_project_operational_details'),
    ('update_my_profile'),
    ('set_active_profile_mode'),
    ('create_company_workspace'),
    ('create_workgroup_workspace'),
    ('enable_my_profile_mode'),
    ('accept_workspace_invite'),
    ('update_workspace_member'),
    ('update_my_workspace_rate'),
    ('remove_workspace_member'),
    ('leave_workspace'),
    ('submit_estimate_for_approval'),
    ('review_estimate_approval'),
    ('delete_project_with_connected_data'),
    ('employee_claim_project'),
    ('complete_project_and_create_invoice'),
    ('bulk_delete_projects'),
    ('complete_invoice'),
    ('void_invoice'),
    ('mark_invoice_paid'),
    ('approve_job_request'),
    ('mark_all_notifications_read'),
    ('get_my_marketplace_work_orders'),
    ('accept_client_job_bid'),
    ('approve_marketplace_application'),
    ('get_workspace_marketplace_work_orders'),
    ('search_client_job_requests'),
    ('search_marketplace_job_openings'),
    ('record_estimate_view'),
    ('record_invoice_view')
)
select
  rf.function_name,
  count(p.oid) as overload_count,
  coalesce(
    array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
      filter (where p.oid is not null),
    '{}'::text[]
  ) as signatures
from required_functions rf
left join pg_proc p on p.proname = rf.function_name
left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.oid is null or n.nspname = 'public'
group by rf.function_name
order by rf.function_name;

-- ============================================================================
-- 3. Public tables: size, estimated rows, RLS and forced RLS
-- ============================================================================
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by pg_total_relation_size(c.oid) desc, c.relname;

-- ============================================================================
-- 4. Exposed public tables with RLS disabled
-- Any returned row needs review.
-- ============================================================================
select
  n.nspname as schema_name,
  c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by c.relname;

-- ============================================================================
-- 5. Every RLS policy in public and storage
-- ============================================================================
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- ============================================================================
-- 6. Exact duplicate policy definitions under different names
-- Any returned group is a cleanup candidate, not an automatic drop instruction.
-- ============================================================================
with normalized as (
  select
    schemaname,
    tablename,
    policyname,
    permissive,
    roles::text as roles_text,
    cmd,
    regexp_replace(coalesce(qual, ''), '\s+', '', 'g') as qual_normalized,
    regexp_replace(coalesce(with_check, ''), '\s+', '', 'g') as check_normalized
  from pg_policies
  where schemaname in ('public', 'storage')
)
select
  schemaname,
  tablename,
  permissive,
  roles_text,
  cmd,
  array_agg(policyname order by policyname) as duplicate_policy_names,
  count(*) as duplicate_count
from normalized
group by
  schemaname, tablename, permissive, roles_text, cmd,
  qual_normalized, check_normalized
having count(*) > 1
order by schemaname, tablename, cmd;

-- ============================================================================
-- 7. Known YardPilot legacy/duplicate candidates
-- ============================================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where
  (schemaname = 'storage' and tablename = 'objects' and policyname in (
    'marketplace_resumes_insert_own',
    'marketplace_resumes_select_authorized',
    'marketplace_resumes_update_own',
    'marketplace_resumes_delete_own',
    'marketplace_resume_insert_own',
    'marketplace_resume_select_authorized',
    'marketplace_resume_update_own',
    'marketplace_resume_delete_own'
  ))
order by policyname;

select
  p.oid::regprocedure as function_signature,
  case p.provolatile
    when 'v' then 'volatile'
    when 's' then 'stable'
    when 'i' then 'immutable'
  end as volatility,
  p.prosecdef as security_definer,
  p.proacl as privileges
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'employee_claim_project'
order by p.oid::regprocedure::text;

-- ============================================================================
-- 8. User-created triggers
-- ============================================================================
select
  event_object_schema as table_schema,
  event_object_table as table_name,
  trigger_name,
  action_timing,
  string_agg(event_manipulation, ', ' order by event_manipulation) as events,
  action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth', 'storage')
group by
  event_object_schema, event_object_table, trigger_name,
  action_timing, action_statement
order by event_object_schema, event_object_table, trigger_name;

-- ============================================================================
-- 9. SECURITY DEFINER functions without an explicit search_path
-- Returned rows require security review.
-- ============================================================================
select
  n.nspname as schema_name,
  p.oid::regprocedure as function_signature,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, '{}'::text[])) setting
    where setting like 'search_path=%'
  )
order by p.oid::regprocedure::text;

-- ============================================================================
-- 10. Function overloads: same function name with multiple signatures
-- Not automatically wrong, but useful for spotting obsolete overloads.
-- ============================================================================
select
  p.proname as function_name,
  count(*) as overload_count,
  array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) as signatures
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
group by p.proname
having count(*) > 1
order by p.proname;

-- ============================================================================
-- 11. Invalid or not-ready indexes
-- Any returned row needs repair before launch.
-- ============================================================================
select
  n.nspname as schema_name,
  c.relname as table_name,
  i.relname as index_name,
  x.indisvalid,
  x.indisready,
  x.indislive
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class c on c.oid = x.indrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and (not x.indisvalid or not x.indisready or not x.indislive)
order by n.nspname, c.relname, i.relname;

-- ============================================================================
-- 12. Non-unique indexes with zero scans since statistics were reset
-- These are review candidates only. Do not drop an index from this result alone.
-- ============================================================================
select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  s.idx_scan,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
from pg_stat_user_indexes s
join pg_index x on x.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and s.idx_scan = 0
  and not x.indisunique
  and not x.indisprimary
order by pg_relation_size(s.indexrelid) desc, s.relname, s.indexrelname;

-- ============================================================================
-- 13. Foreign-key relationships
-- Useful before considering any table or column deletion.
-- ============================================================================
select
  con.conname as constraint_name,
  src_ns.nspname as source_schema,
  src.relname as source_table,
  pg_get_constraintdef(con.oid) as definition,
  dst_ns.nspname as referenced_schema,
  dst.relname as referenced_table
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class dst on dst.oid = con.confrelid
join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
where con.contype = 'f'
  and src_ns.nspname in ('public', 'storage')
order by source_schema, source_table, constraint_name;

-- ============================================================================
-- 14. Migration-history availability
-- Some hosted projects do not expose supabase_migrations.schema_migrations
-- through the SQL Editor. This safe check never references a missing relation.
-- ============================================================================
select
  to_regclass('supabase_migrations.schema_migrations') as migration_history_relation,
  case
    when to_regclass('supabase_migrations.schema_migrations') is null then
      'Migration history table is not exposed in this project. Use the Supabase CLI (migration list / db pull) to inspect remote migration history.'
    else
      'Migration history table is available.'
  end as note;
