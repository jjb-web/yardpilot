-- YardPilot estimate permissions and upload preflight v1
-- READ ONLY. Run before yardpilot-estimate-permissions-and-upload-fix-v1.sql.

with checks as (
  select
    'required table'::text as category,
    object_name as item,
    case when to_regclass(object_name) is not null then 'PASS' else 'FAIL' end as status,
    case when to_regclass(object_name) is not null then 'Table exists' else 'Missing table' end as details
  from (values
    ('public.projects'),
    ('public.workspace_memberships'),
    ('public.employee_payment_records'),
    ('public.notifications'),
    ('public.audit_log')
  ) required(object_name)

  union all

  select
    'required function',
    signature,
    case when to_regprocedure(signature) is not null then 'PASS' else 'FAIL' end,
    case when to_regprocedure(signature) is not null then 'Function exists' else 'Missing function' end
  from (values
    ('public.yardpilot_guard_estimate_approval()'),
    ('public.submit_estimate_for_approval(text)'),
    ('public.review_estimate_approval(text,text,text)'),
    ('public.yardpilot_notify_user(uuid,uuid,text,text,text,text,jsonb)'),
    ('public.yardpilot_notify_workspace_managers(uuid,text,text,text,text,jsonb)'),
    ('public.marketplace_can_manage_workspace(uuid)')
  ) required(signature)

  union all

  select
    'storage bucket',
    'property-photos',
    case when exists (select 1 from storage.buckets where id = 'property-photos') then 'PASS' else 'FAIL' end,
    case when exists (select 1 from storage.buckets where id = 'property-photos')
      then 'Bucket exists'
      else 'Missing property-photos bucket'
    end

  union all

  select
    'data review',
    'manager-created estimates still awaiting internal approval',
    'INFO',
    count(*)::text || ' row(s) will be normalized to approved'
  from public.projects p
  where p.internal_approval_status <> 'approved'
    and exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = p.workspace_id
        and wm.user_id = p.created_by
        and wm.role::text in ('owner', 'co_owner', 'manager')
    )

  union all

  select
    'data review',
    'duplicate estimate numbers in the same workspace',
    case when count(*) = 0 then 'PASS' else 'WARN' end,
    count(*)::text || ' duplicate number group(s)'
  from (
    select workspace_id, lower(trim(estimate_number))
    from public.projects
    where trim(coalesce(estimate_number, '')) <> ''
    group by workspace_id, lower(trim(estimate_number))
    having count(*) > 1
  ) duplicates
)
select category, item, status, details
from checks
order by
  case category
    when 'required table' then 1
    when 'required function' then 2
    when 'storage bucket' then 3
    when 'data review' then 4
    else 5
  end,
  item;
