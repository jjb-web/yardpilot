-- YardPilot launch-readiness preflight v2
-- READ ONLY. One SELECT statement so Supabase displays every check together.
-- Do not run the launch migration unless every REQUIRED row shows status = PASS.

with
required_relations(object_name) as (
  values
    ('public.support_messages'),
    ('public.feature_flags'),
    ('public.platform_admins'),
    ('public.notifications'),
    ('public.marketplace_business_profiles'),
    ('public.client_job_requests'),
    ('public.client_job_bids'),
    ('public.marketplace_work_orders'),
    ('public.projects'),
    ('public.invoices')
),
relation_checks as (
  select
    'REQUIRED TABLE'::text as category,
    object_name as item,
    case when to_regclass(object_name) is not null then 'PASS' else 'FAIL' end as status,
    case
      when to_regclass(object_name) is not null then 'Table exists'
      else 'Missing required table'
    end as details
  from required_relations
),
required_functions(signature) as (
  values
    ('public.marketplace_can_manage_workspace(uuid)'),
    ('public.marketplace_touch_updated_at()'),
    ('public.marketplace_assert_safe_text(text,text)'),
    ('public.yardpilot_text_is_allowed(text)'),
    ('public.yardpilot_notify_user(uuid,uuid,text,text,text,text,jsonb)'),
    ('public.yardpilot_notify_workspace_managers(uuid,text,text,text,text,jsonb)')
),
function_checks as (
  select
    'REQUIRED FUNCTION'::text as category,
    signature as item,
    case when to_regprocedure(signature) is not null then 'PASS' else 'FAIL' end as status,
    case
      when to_regprocedure(signature) is not null then 'Function exists'
      else 'Missing required function'
    end as details
  from required_functions
),
duplicate_check as (
  select
    'DATA INTEGRITY'::text as category,
    'accepted bids: at most one per request'::text as item,
    case
      when exists (
        select 1
        from public.client_job_bids
        where status = 'accepted'
        group by request_id
        having count(*) > 1
      ) then 'FAIL'
      else 'PASS'
    end as status,
    case
      when exists (
        select 1
        from public.client_job_bids
        where status = 'accepted'
        group by request_id
        having count(*) > 1
      ) then 'One or more requests have multiple accepted bids'
      else 'No duplicate accepted bids'
    end as details
),
flag_checks as (
  select
    'FEATURE FLAG'::text as category,
    key as item,
    'INFO'::text as status,
    'enabled=' || enabled::text || ' — ' || description as details
  from public.feature_flags
  where key in (
    'public_registration',
    'marketplace_bidding',
    'marketplace_hiring',
    'browser_push',
    'ai_assistant',
    'real_payroll'
  )
),
missing_flags as (
  select
    'FEATURE FLAG'::text as category,
    expected.key as item,
    'WARN'::text as status,
    'Feature flag is missing'::text as details
  from (
    values
      ('public_registration'),
      ('marketplace_bidding'),
      ('marketplace_hiring'),
      ('browser_push'),
      ('ai_assistant'),
      ('real_payroll')
  ) as expected(key)
  where not exists (
    select 1 from public.feature_flags ff where ff.key = expected.key
  )
)
select category, item, status, details
from (
  select * from relation_checks
  union all
  select * from function_checks
  union all
  select * from duplicate_check
  union all
  select * from flag_checks
  union all
  select * from missing_flags
) checks
order by
  case category
    when 'REQUIRED TABLE' then 1
    when 'REQUIRED FUNCTION' then 2
    when 'DATA INTEGRITY' then 3
    when 'FEATURE FLAG' then 4
    else 5
  end,
  item;
