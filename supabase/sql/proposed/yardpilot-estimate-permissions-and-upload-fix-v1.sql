-- YardPilot estimate permissions and property-photo upload hardening v1
-- Forward-only and data-safe. Does not delete estimates, jobs, invoices, or files.

begin;

-- Keep the storage bucket aligned with the image formats accepted by the app.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]
where id = 'property-photos';

-- Owner/co-owner/manager-created estimates do not require a second internal
-- approval. Employee-created estimates remain drafts until submitted and
-- reviewed by a manager.
create or replace function public.yardpilot_guard_estimate_approval()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  member_role text;
  creator_role text;
  employee_submit_transition boolean := false;
begin
  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = new.workspace_id
    and wm.user_id = auth.uid()
  limit 1;

  select wm.role::text into creator_role
  from public.workspace_memberships wm
  where wm.workspace_id = new.workspace_id
    and wm.user_id = new.created_by
  limit 1;

  -- A manager creating an estimate has already supplied the internal business
  -- approval. Existing estimates created by a current manager are normalized
  -- the next time they are edited.
  if creator_role in ('owner', 'co_owner', 'manager') then
    new.internal_approval_status := 'approved';
    new.submitted_for_approval_at := null;
    new.submitted_for_approval_by := null;
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, new.created_by);
    if trim(coalesce(new.approval_notes, '')) = '' then
      new.approval_notes := 'Internal review not required for an owner or manager-created estimate.';
    end if;
  end if;

  if tg_op = 'UPDATE' and member_role = 'employee' then
    employee_submit_transition :=
      old.internal_approval_status in ('draft', 'changes_requested')
      and new.internal_approval_status = 'pending'
      and new.submitted_for_approval_by = auth.uid()
      and new.submitted_for_approval_at is not null;
  end if;

  if member_role = 'employee' then
    if new.created_by <> auth.uid() then
      raise exception 'Employees may edit only estimates they created.';
    end if;
    if new.estimate_status <> 'draft' or new.share_enabled then
      raise exception 'Employees may save drafts but cannot send estimates.';
    end if;

    if tg_op = 'INSERT' and new.internal_approval_status <> 'draft' then
      raise exception 'Employee-created estimates must begin as internal drafts.';
    end if;

    if tg_op = 'UPDATE'
       and not employee_submit_transition
       and new.internal_approval_status not in ('draft', 'changes_requested') then
      raise exception 'Submit or wait for manager review before making further changes.';
    end if;
  end if;

  if (new.share_enabled = true or new.estimate_status in ('sent', 'accepted'))
     and new.internal_approval_status <> 'approved' then
    raise exception 'This employee-created estimate must be internally approved before it can be sent or accepted.';
  end if;

  return new;
end;
$$;

revoke all on function public.yardpilot_guard_estimate_approval() from public;

create or replace function public.submit_estimate_for_approval(requested_project_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  member_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into project_row
  from public.projects
  where id::text = requested_project_id
  for update;

  if project_row.id is null then
    raise exception 'Estimate not found.';
  end if;

  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = project_row.workspace_id
    and wm.user_id = auth.uid()
  limit 1;

  if member_role <> 'employee' then
    raise exception 'Owner, co-owner, and manager-created estimates do not require submission for internal approval.';
  end if;
  if project_row.created_by <> auth.uid() then
    raise exception 'Employees may submit only estimates they created.';
  end if;
  if project_row.estimate_status <> 'draft' then
    raise exception 'Only draft estimates can be submitted for internal approval.';
  end if;
  if project_row.internal_approval_status not in ('draft', 'changes_requested') then
    raise exception 'This estimate is already submitted or approved.';
  end if;

  update public.projects
  set internal_approval_status = 'pending',
      submitted_for_approval_at = now(),
      submitted_for_approval_by = auth.uid(),
      approved_at = null,
      approved_by = null,
      updated_at = now()
  where id = project_row.id;

  perform public.yardpilot_notify_workspace_managers(
    project_row.workspace_id,
    'estimate_approval',
    'Employee estimate awaiting approval',
    project_row.name || ' was submitted for internal approval.',
    '/app/estimates/' || project_row.id::text,
    jsonb_build_object('projectId', project_row.id, 'status', 'pending')
  );

  insert into public.audit_log(
    workspace_id, actor_user_id, action, entity_type, entity_id, details
  ) values (
    project_row.workspace_id,
    auth.uid(),
    'estimate_submitted_for_approval',
    'project',
    project_row.id::text,
    '{}'::jsonb
  );

  return jsonb_build_object('projectId', project_row.id, 'status', 'pending');
end;
$$;

create or replace function public.review_estimate_approval(
  requested_project_id text,
  requested_decision text,
  requested_notes text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  member_role text;
  cleaned_decision text := lower(trim(coalesce(requested_decision, '')));
  new_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if cleaned_decision not in ('approve', 'changes_requested') then
    raise exception 'Decision must be approve or changes_requested.';
  end if;

  select * into project_row
  from public.projects
  where id::text = requested_project_id
  for update;

  if project_row.id is null then
    raise exception 'Estimate not found.';
  end if;

  select wm.role::text into member_role
  from public.workspace_memberships wm
  where wm.workspace_id = project_row.workspace_id
    and wm.user_id = auth.uid()
  limit 1;

  if member_role not in ('owner', 'co_owner', 'manager') then
    raise exception 'Only an owner, co-owner, or manager can review employee estimates.';
  end if;
  if project_row.internal_approval_status <> 'pending'
     or project_row.submitted_for_approval_by is null then
    raise exception 'Only an employee estimate that has been submitted can be reviewed.';
  end if;
  if project_row.created_by = auth.uid() then
    raise exception 'The estimate creator cannot perform the employee-review step.';
  end if;

  new_status := case
    when cleaned_decision = 'approve' then 'approved'
    else 'changes_requested'
  end;

  update public.projects
  set internal_approval_status = new_status,
      approval_notes = left(trim(coalesce(requested_notes, '')), 3000),
      approved_at = case when new_status = 'approved' then now() else null end,
      approved_by = case when new_status = 'approved' then auth.uid() else null end,
      updated_at = now()
  where id = project_row.id;

  perform public.yardpilot_notify_user(
    project_row.created_by,
    project_row.workspace_id,
    'estimate_approval',
    case when new_status = 'approved' then 'Estimate approved' else 'Estimate needs changes' end,
    case when new_status = 'approved'
      then project_row.name || ' is approved and may be sent to the client.'
      else project_row.name || ' was returned with requested changes.'
    end,
    '/app/estimates/' || project_row.id::text,
    jsonb_build_object('projectId', project_row.id, 'status', new_status)
  );

  insert into public.audit_log(
    workspace_id, actor_user_id, action, entity_type, entity_id, details
  ) values (
    project_row.workspace_id,
    auth.uid(),
    case when new_status = 'approved' then 'estimate_approved' else 'estimate_changes_requested' end,
    'project',
    project_row.id::text,
    jsonb_build_object('notes', left(trim(coalesce(requested_notes, '')), 3000))
  );

  return jsonb_build_object('projectId', project_row.id, 'status', new_status);
end;
$$;

revoke all on function public.submit_estimate_for_approval(text) from public;
revoke all on function public.review_estimate_approval(text,text,text) from public;
grant execute on function public.submit_estimate_for_approval(text) to authenticated;
grant execute on function public.review_estimate_approval(text,text,text) to authenticated;

-- Employees can read only their own payment statements. Managers retain
-- workspace-wide access for recording external payroll/payment activity.
drop policy if exists employee_payments_select_participants on public.employee_payment_records;
create policy employee_payments_select_participants
on public.employee_payment_records
for select
to authenticated
using (
  employee_user_id = auth.uid()
  or public.marketplace_can_manage_workspace(workspace_id)
);

-- Normalize legacy manager-created estimates without changing employee drafts.
update public.projects p
set internal_approval_status = 'approved',
    submitted_for_approval_at = null,
    submitted_for_approval_by = null,
    approved_at = coalesce(p.approved_at, p.created_at, now()),
    approved_by = coalesce(p.approved_by, p.created_by),
    approval_notes = case
      when trim(coalesce(p.approval_notes, '')) = ''
        then 'Internal review not required for an owner or manager-created estimate.'
      else p.approval_notes
    end,
    updated_at = now()
from public.workspace_memberships wm
where wm.workspace_id = p.workspace_id
  and wm.user_id = p.created_by
  and wm.role::text in ('owner', 'co_owner', 'manager')
  and p.internal_approval_status <> 'approved';

commit;

select
  count(*) filter (where internal_approval_status = 'pending') as pending_employee_reviews,
  count(*) filter (where internal_approval_status = 'approved') as approved_estimates
from public.projects;
