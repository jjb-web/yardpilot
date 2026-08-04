-- YardPilot launch-readiness preflight
-- READ ONLY. Run before yardpilot-launch-readiness-v1.sql.

with required_relations(object_name) as (
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
)
select object_name, to_regclass(object_name) is not null as present
from required_relations
order by object_name;

with required_functions(signature) as (
  values
    ('public.marketplace_can_manage_workspace(uuid)'),
    ('public.marketplace_touch_updated_at()'),
    ('public.marketplace_assert_safe_text(text,text)'),
    ('public.yardpilot_text_is_allowed(text)'),
    ('public.yardpilot_notify_user(uuid,uuid,text,text,text,text,jsonb)'),
    ('public.yardpilot_notify_workspace_managers(uuid,text,text,text,text,jsonb)')
)
select signature, to_regprocedure(signature) is not null as present
from required_functions
order by signature;

select request_id, count(*) as accepted_bid_count
from public.client_job_bids
where status = 'accepted'
group by request_id
having count(*) > 1;

select key, enabled, description
from public.feature_flags
where key in ('public_registration','marketplace_bidding','marketplace_hiring','browser_push','ai_assistant','real_payroll')
order by key;
