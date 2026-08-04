-- YardPilot payments, membership controls, profit tracking, and invoice workflow.
-- Run AFTER yardpilot-lifecycle-workgroups-properties.sql.
-- Designed to be safely re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. New workspace, estimate, invoice, and proposal fields.
-- ---------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

create unique index if not exists workspaces_stripe_account_unique_idx
  on public.workspaces(stripe_account_id)
  where stripe_account_id is not null;

alter table public.projects
  add column if not exists invoice_due_date date,
  add column if not exists internal_other_cost numeric not null default 0;

alter table public.projects
  drop constraint if exists projects_internal_other_cost_check;

alter table public.projects
  add constraint projects_internal_other_cost_check
  check (internal_other_cost >= 0);

alter table public.invoices
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text not null default '',
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists currency text not null default 'usd',
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.invoices
  drop constraint if exists invoices_payment_status_check;

alter table public.invoices
  add constraint invoices_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'failed', 'refunded'));

alter table public.invoices
  drop constraint if exists invoices_currency_check;

alter table public.invoices
  add constraint invoices_currency_check
  check (currency ~ '^[a-z]{3}$');

create unique index if not exists invoices_stripe_checkout_session_unique_idx
  on public.invoices(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.job_requests
  add column if not exists city text not null default '',
  add column if not exists project_type text not null default 'Other job type';

update public.invoices
set
  payment_status = case when status = 'paid' then 'paid' else coalesce(payment_status, 'unpaid') end,
  paid_at = case when status = 'paid' then coalesce(paid_at, updated_at, now()) else paid_at end,
  completed_at = case
    when archived_at is not null then coalesce(completed_at, archived_at)
    else completed_at
  end;

-- ---------------------------------------------------------------------------
-- 2. Workspace list now exposes payment readiness, never banking data.
-- ---------------------------------------------------------------------------

drop function if exists public.get_my_workspaces();

create function public.get_my_workspaces()
returns table (
  id uuid,
  name text,
  slug text,
  kind text,
  is_personal boolean,
  created_by uuid,
  role text,
  stripe_account_id text,
  stripe_onboarding_complete boolean,
  stripe_charges_enabled boolean,
  stripe_payouts_enabled boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.slug,
    w.kind,
    w.is_personal,
    w.created_by,
    wm.role,
    w.stripe_account_id,
    w.stripe_onboarding_complete,
    w.stripe_charges_enabled,
    w.stripe_payouts_enabled,
    w.created_at
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid()
  order by
    case when w.is_personal then 1 else 0 end,
    case wm.role
      when 'owner' then 0
      when 'co_owner' then 1
      when 'manager' then 2
      else 3
    end,
    w.created_at;
$$;

revoke all on function public.get_my_workspaces() from public;
grant execute on function public.get_my_workspaces() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Secure member removal and leaving a company/workgroup.
-- ---------------------------------------------------------------------------

create or replace function public.remove_workspace_member(
  requested_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.workspace_memberships%rowtype;
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into target
  from public.workspace_memberships
  where id = requested_membership_id
  for update;

  if target.id is null then
    raise exception 'Team member not found.';
  end if;

  if target.user_id = auth.uid() then
    raise exception 'Use Leave Workspace to remove yourself.';
  end if;

  if target.role = 'owner' then
    raise exception 'The workspace owner cannot be removed.';
  end if;

  actor_role := public.workspace_role(target.workspace_id);

  if actor_role in ('owner', 'co_owner') then
    delete from public.workspace_memberships where id = target.id;
    return;
  end if;

  if actor_role = 'manager' and target.role = 'employee' then
    delete from public.workspace_memberships where id = target.id;
    return;
  end if;

  raise exception 'You do not have permission to remove this member.';
end;
$$;

revoke all on function public.remove_workspace_member(uuid) from public;
grant execute on function public.remove_workspace_member(uuid) to authenticated;

create or replace function public.leave_workspace(
  requested_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_row public.workspaces%rowtype;
  membership_row public.workspace_memberships%rowtype;
  replacement_owner_id uuid;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = requested_workspace_id
  for update;

  if workspace_row.id is null then
    raise exception 'Workspace not found.';
  end if;

  if workspace_row.is_personal or workspace_row.kind = 'personal' then
    raise exception 'Your Personal workspace remains with your account.';
  end if;

  select * into membership_row
  from public.workspace_memberships
  where workspace_id = requested_workspace_id
    and user_id = auth.uid()
  for update;

  if membership_row.id is null then
    raise exception 'You are not a member of this workspace.';
  end if;

  if membership_row.role <> 'owner' then
    delete from public.workspace_memberships where id = membership_row.id;
    return;
  end if;

  select count(*) into member_count
  from public.workspace_memberships
  where workspace_id = requested_workspace_id;

  if member_count = 1 then
    delete from public.workspaces where id = requested_workspace_id;
    return;
  end if;

  select user_id into replacement_owner_id
  from public.workspace_memberships
  where workspace_id = requested_workspace_id
    and role = 'co_owner'
    and user_id <> auth.uid()
  order by created_at
  limit 1;

  if replacement_owner_id is null then
    raise exception 'Promote a member to Co-owner before leaving this workspace.';
  end if;

  update public.workspace_memberships
  set role = 'owner', position_title = coalesce(nullif(position_title, ''), 'Owner')
  where workspace_id = requested_workspace_id
    and user_id = replacement_owner_id;

  update public.workspaces
  set created_by = replacement_owner_id, updated_at = now()
  where id = requested_workspace_id;

  delete from public.workspace_memberships where id = membership_row.id;
end;
$$;

revoke all on function public.leave_workspace(uuid) from public;
grant execute on function public.leave_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Employee proposals create draft estimates, not already-approved jobs.
-- ---------------------------------------------------------------------------

create or replace function public.approve_job_request(
  requested_job_request_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.job_requests%rowtype;
  new_project_id text;
  now_value timestamptz := now();
begin
  select * into request_row
  from public.job_requests
  where id = requested_job_request_id
  for update;

  if request_row.id is null
     or not public.can_manage_workspace(request_row.workspace_id) then
    raise exception 'You cannot approve this estimate proposal.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'This proposal has already been reviewed.';
  end if;

  new_project_id := gen_random_uuid()::text;

  insert into public.projects (
    id,
    user_id,
    workspace_id,
    created_by,
    name,
    client,
    address,
    city,
    status,
    estimate_status,
    estimate_number,
    issue_date,
    valid_until,
    project_type,
    billing_method,
    square_footage,
    labor_rate,
    labor_hours,
    line_items,
    estimate_summary,
    scope_description,
    client_notes,
    terms,
    tax_rate,
    discount_amount,
    total_estimate,
    internal_other_cost,
    notes,
    share_token,
    share_enabled,
    scheduled_start,
    created_at,
    updated_at
  )
  values (
    new_project_id,
    auth.uid(),
    request_row.workspace_id,
    auth.uid(),
    request_row.title,
    request_row.client,
    request_row.address,
    coalesce(request_row.city, ''),
    'active',
    'draft',
    'EST-' || upper(substr(replace(new_project_id, '-', ''), 1, 10)),
    current_date,
    current_date + 30,
    coalesce(nullif(request_row.project_type, ''), 'Other job type'),
    'fixed',
    0,
    0,
    0,
    '[]'::jsonb,
    null,
    request_row.scope_description,
    '',
    '',
    0,
    0,
    0,
    0,
    'Created from an employee estimate proposal.',
    gen_random_uuid(),
    false,
    request_row.proposed_start,
    now_value,
    now_value
  );

  insert into public.project_assignments (
    workspace_id,
    project_id,
    user_id,
    assigned_by,
    hours,
    hourly_rate_snapshot
  )
  select
    request_row.workspace_id,
    new_project_id,
    request_row.requested_by,
    auth.uid(),
    0,
    coalesce(wm.hourly_rate, 0)
  from public.workspace_memberships wm
  where wm.workspace_id = request_row.workspace_id
    and wm.user_id = request_row.requested_by
  on conflict (project_id, user_id) do nothing;

  update public.job_requests
  set
    status = 'approved',
    created_project_id = new_project_id,
    updated_at = now()
  where id = request_row.id;

  return new_project_id;
end;
$$;

revoke all on function public.approve_job_request(uuid) from public;
grant execute on function public.approve_job_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Job completion and invoice lifecycle.
-- ---------------------------------------------------------------------------

create or replace function public.complete_project_and_create_invoice(
  requested_project_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
  existing_invoice_id text;
  new_invoice_id text;
  snapshot jsonb;
  generated_number text;
  final_due_date date;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into project_row
  from public.projects
  where id = requested_project_id
  for update;

  if project_row.id is null then
    raise exception 'Job not found.';
  end if;

  if not public.can_manage_workspace(project_row.workspace_id) then
    raise exception 'Only an owner, co-owner, or manager can complete this job.';
  end if;

  if project_row.estimate_status <> 'accepted' then
    raise exception 'Only an accepted estimate can be completed as a job.';
  end if;

  select i.id into existing_invoice_id
  from public.invoices i
  where i.workspace_id = project_row.workspace_id
    and i.project_id = project_row.id
  order by i.created_at desc
  limit 1;

  update public.projects
  set status = 'completed', updated_at = now()
  where id = project_row.id;

  if existing_invoice_id is not null then
    return existing_invoice_id;
  end if;

  snapshot := to_jsonb(project_row) || jsonb_build_object(
    'labor_assignments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', pa.user_id,
            'name', coalesce(
              nullif(p.full_name, ''),
              split_part(coalesce(p.email, ''), '@', 1),
              'Team member'
            ),
            'hours', pa.hours,
            'hourly_rate', pa.hourly_rate_snapshot
          )
          order by pa.created_at
        )
        from public.project_assignments pa
        left join public.profiles p on p.id = pa.user_id
        where pa.project_id = project_row.id
      ),
      '[]'::jsonb
    )
  );

  generated_number := 'INV-' || to_char(current_date, 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  final_due_date := case
    when project_row.invoice_due_date is not null
      then project_row.invoice_due_date
    else current_date + 14
  end;

  insert into public.invoices (
    workspace_id,
    created_by,
    project_id,
    contact_id,
    property_id,
    invoice_number,
    issue_date,
    due_date,
    status,
    amount,
    notes,
    estimate_snapshot,
    share_enabled,
    payment_status,
    payment_method,
    archived_at
  )
  values (
    project_row.workspace_id,
    auth.uid(),
    project_row.id,
    project_row.contact_id,
    project_row.property_id,
    generated_number,
    current_date,
    final_due_date,
    'draft',
    greatest(coalesce(project_row.total_estimate, 0), 0),
    'Final invoice created from accepted estimate ' ||
      coalesce(project_row.estimate_number, project_row.name) || '.',
    snapshot,
    false,
    'unpaid',
    '',
    null
  )
  returning id into new_invoice_id;

  return new_invoice_id;
end;
$$;

revoke all on function public.complete_project_and_create_invoice(text) from public;
grant execute on function public.complete_project_and_create_invoice(text) to authenticated;

create or replace function public.mark_invoice_paid(
  requested_invoice_id text,
  requested_method text default 'offline'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
begin
  select * into invoice_row
  from public.invoices
  where id = requested_invoice_id
  for update;

  if invoice_row.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.can_manage_workspace(invoice_row.workspace_id) then
    raise exception 'You do not have permission to mark this invoice paid.';
  end if;

  if invoice_row.status = 'void' then
    raise exception 'A void invoice cannot be marked paid.';
  end if;

  update public.invoices
  set
    status = 'paid',
    payment_status = 'paid',
    payment_method = left(trim(coalesce(requested_method, 'offline')), 40),
    paid_at = coalesce(paid_at, now()),
    completed_at = coalesce(completed_at, now()),
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = requested_invoice_id;
end;
$$;

revoke all on function public.mark_invoice_paid(text, text) from public;
grant execute on function public.mark_invoice_paid(text, text) to authenticated;

create or replace function public.void_invoice(
  requested_invoice_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
begin
  select * into invoice_row
  from public.invoices
  where id = requested_invoice_id
  for update;

  if invoice_row.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.can_manage_workspace(invoice_row.workspace_id) then
    raise exception 'You do not have permission to void this invoice.';
  end if;

  if invoice_row.payment_status = 'paid' or invoice_row.status = 'paid' then
    raise exception 'A paid invoice cannot be voided. Record a refund separately.';
  end if;

  update public.invoices
  set
    status = 'void',
    payment_status = 'unpaid',
    voided_at = coalesce(voided_at, now()),
    completed_at = coalesce(completed_at, now()),
    archived_at = coalesce(archived_at, now()),
    share_enabled = false,
    stripe_checkout_url = null,
    updated_at = now()
  where id = requested_invoice_id;
end;
$$;

revoke all on function public.void_invoice(text) from public;
grant execute on function public.void_invoice(text) to authenticated;

create or replace function public.complete_invoice(
  requested_invoice_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
begin
  select * into invoice_row
  from public.invoices
  where id = requested_invoice_id
  for update;

  if invoice_row.id is null then
    raise exception 'Invoice not found.';
  end if;

  if not public.can_manage_workspace(invoice_row.workspace_id) then
    raise exception 'You do not have permission to complete this invoice.';
  end if;

  update public.invoices
  set
    status = case
      when status = 'sent' and due_date < current_date then 'overdue'
      else status
    end,
    completed_at = coalesce(completed_at, now()),
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = requested_invoice_id;
end;
$$;

revoke all on function public.complete_invoice(text) from public;
grant execute on function public.complete_invoice(text) to authenticated;

-- Deliberate bulk deletion is restricted to already-completed Past Jobs.
create or replace function public.bulk_delete_projects(
  requested_project_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_id_value text;
  project_row public.projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  foreach project_id_value in array coalesce(requested_project_ids, array[]::text[])
  loop
    select * into project_row
    from public.projects
    where id = project_id_value
    for update;

    if project_row.id is null then
      continue;
    end if;

    if project_row.status not in ('completed', 'archived') then
      raise exception 'Only Past Jobs may be bulk deleted.';
    end if;

    if not public.can_manage_workspace(project_row.workspace_id) then
      raise exception 'You do not have permission to delete one or more selected jobs.';
    end if;

    perform public.delete_project_with_connected_data(project_id_value);
  end loop;
end;
$$;

revoke all on function public.bulk_delete_projects(text[]) from public;
grant execute on function public.bulk_delete_projects(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Calendar and follow-up synchronization.
-- Completed follow-ups are preserved. Invoice completion only removes the
-- calendar event; paid follow-ups become Completed and void follow-ups Dismissed.
-- ---------------------------------------------------------------------------

create or replace function public.sync_invoice_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived_at is null and new.status <> 'void' then
    insert into public.schedule_events (
      workspace_id,
      created_by,
      title,
      description,
      start_at,
      all_day,
      source_type,
      invoice_id,
      project_id,
      contact_id,
      status,
      auto_key,
      updated_at
    )
    values (
      new.workspace_id,
      new.created_by,
      'Invoice due: ' || new.invoice_number,
      coalesce(new.notes, ''),
      new.due_date::timestamptz + interval '12 hours',
      true,
      'invoice',
      new.id,
      new.project_id,
      new.contact_id,
      'scheduled',
      'invoice:' || new.id || ':due',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      description = excluded.description,
      start_at = excluded.start_at,
      project_id = excluded.project_id,
      contact_id = excluded.contact_id,
      status = excluded.status,
      updated_at = now();
  else
    delete from public.schedule_events
    where auto_key = 'invoice:' || new.id || ':due';
  end if;

  insert into public.follow_ups (
    workspace_id,
    created_by,
    title,
    notes,
    due_at,
    type,
    status,
    channel,
    contact_id,
    project_id,
    invoice_id,
    auto_key,
    updated_at
  )
  values (
    new.workspace_id,
    new.created_by,
    'Payment due: ' || new.invoice_number,
    coalesce(new.notes, ''),
    new.due_date::timestamptz + interval '9 hours',
    'payment',
    case
      when new.payment_status = 'paid' or new.status = 'paid' then 'completed'
      when new.status = 'void' then 'dismissed'
      else 'pending'
    end,
    'email',
    new.contact_id,
    new.project_id,
    new.id,
    'invoice:' || new.id || ':payment',
    now()
  )
  on conflict (auto_key) do update set
    title = excluded.title,
    notes = excluded.notes,
    due_at = excluded.due_at,
    project_id = excluded.project_id,
    contact_id = excluded.contact_id,
    status = case
      when follow_ups.status = 'completed' then 'completed'
      else excluded.status
    end,
    updated_at = now();

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Public invoice payload is sanitized and includes only payment readiness.
-- Internal material costs, payroll rates, and other internal costs are never
-- sent to the customer's browser.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_invoice(requested_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'workspace_id', i.workspace_id,
      'created_by', i.created_by,
      'project_id', i.project_id,
      'contact_id', i.contact_id,
      'property_id', i.property_id,
      'invoice_number', i.invoice_number,
      'issue_date', i.issue_date,
      'due_date', i.due_date,
      'status', case
        when i.payment_status = 'paid' then 'paid'
        when i.status = 'sent' and i.due_date < current_date then 'overdue'
        else i.status
      end,
      'amount', i.amount,
      'notes', i.notes,
      'estimate_snapshot', jsonb_build_object(
        'estimate_number', coalesce(i.estimate_snapshot ->> 'estimate_number', i.estimate_snapshot ->> 'estimateNumber', ''),
        'name', coalesce(i.estimate_snapshot ->> 'name', ''),
        'client', coalesce(i.estimate_snapshot ->> 'client', ''),
        'address', coalesce(i.estimate_snapshot ->> 'address', ''),
        'city', coalesce(i.estimate_snapshot ->> 'city', ''),
        'project_type', coalesce(i.estimate_snapshot ->> 'project_type', i.estimate_snapshot ->> 'projectType', ''),
        'billing_method', coalesce(i.estimate_snapshot ->> 'billing_method', i.estimate_snapshot ->> 'billingMethod', 'fixed'),
        'line_items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', coalesce(item ->> 'id', ''),
                'description', coalesce(item ->> 'description', ''),
                'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
                'unit', coalesce(item ->> 'unit', 'flat'),
                'unit_cost', coalesce(nullif(coalesce(item ->> 'unit_cost', item ->> 'unitCost'), '')::numeric, 0)
              )
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(
                  coalesce(
                    i.estimate_snapshot -> 'line_items',
                    i.estimate_snapshot -> 'lineItems',
                    '[]'::jsonb
                  )
                ) = 'array'
                then coalesce(
                  i.estimate_snapshot -> 'line_items',
                  i.estimate_snapshot -> 'lineItems',
                  '[]'::jsonb
                )
                else '[]'::jsonb
              end
            ) item
          ),
          '[]'::jsonb
        ),
        'labor_assignments', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'user_id', coalesce(assignment ->> 'user_id', assignment ->> 'userId', ''),
                'name', coalesce(assignment ->> 'name', 'Team member'),
                'hours', coalesce(nullif(assignment ->> 'hours', '')::numeric, 0)
              )
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(
                  coalesce(
                    i.estimate_snapshot -> 'labor_assignments',
                    i.estimate_snapshot -> 'laborAssignments',
                    '[]'::jsonb
                  )
                ) = 'array'
                then coalesce(
                  i.estimate_snapshot -> 'labor_assignments',
                  i.estimate_snapshot -> 'laborAssignments',
                  '[]'::jsonb
                )
                else '[]'::jsonb
              end
            ) assignment
          ),
          '[]'::jsonb
        ),
        'labor_hours', coalesce(i.estimate_snapshot ->> 'labor_hours', i.estimate_snapshot ->> 'laborHours', '0'),
        'labor_rate', coalesce(i.estimate_snapshot ->> 'labor_rate', i.estimate_snapshot ->> 'laborRate', '0'),
        'estimate_summary', coalesce(i.estimate_snapshot ->> 'estimate_summary', i.estimate_snapshot ->> 'aiEstimate', ''),
        'scope_description', coalesce(i.estimate_snapshot ->> 'scope_description', i.estimate_snapshot ->> 'scopeDescription', ''),
        'client_notes', coalesce(i.estimate_snapshot ->> 'client_notes', i.estimate_snapshot ->> 'clientNotes', ''),
        'terms', coalesce(i.estimate_snapshot ->> 'terms', ''),
        'tax_rate', coalesce(i.estimate_snapshot ->> 'tax_rate', i.estimate_snapshot ->> 'taxRate', '0'),
        'discount_amount', coalesce(i.estimate_snapshot ->> 'discount_amount', i.estimate_snapshot ->> 'discountAmount', '0'),
        'total_estimate', coalesce(i.estimate_snapshot ->> 'total_estimate', i.estimate_snapshot ->> 'totalEstimate', i.amount::text),
        'response_name', coalesce(i.estimate_snapshot ->> 'response_name', i.estimate_snapshot ->> 'responseName', ''),
        'signature_data', coalesce(i.estimate_snapshot ->> 'signature_data', i.estimate_snapshot ->> 'signatureData', ''),
        'accepted_at', coalesce(i.estimate_snapshot ->> 'accepted_at', i.estimate_snapshot ->> 'acceptedAt', '')
      ),
      'share_token', i.share_token,
      'sent_at', i.sent_at,
      'viewed_at', i.viewed_at,
      'payment_status', i.payment_status,
      'payment_method', i.payment_method,
      'paid_at', i.paid_at,
      'completed_at', i.completed_at,
      'voided_at', i.voided_at,
      'archived_at', i.archived_at,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ),
    'payments', jsonb_build_object(
      'enabled', (
        w.stripe_account_id is not null
        and w.stripe_onboarding_complete
        and w.stripe_charges_enabled
        and w.stripe_payouts_enabled
      )
    ),
    'company', jsonb_build_object(
      'full_name', owner_profile.full_name,
      'email', owner_profile.email,
      'phone', owner_profile.phone,
      'city', owner_profile.city,
      'state', owner_profile.state,
      'company', coalesce(nullif(w.name, ''), owner_profile.company)
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'workspace_id', c.workspace_id,
        'name', c.name,
        'email', c.email,
        'phone', c.phone,
        'address', c.address,
        'city', c.city,
        'state', c.state,
        'zip', c.zip
      )
    end,
    'property', case
      when prop.id is null then null
      else jsonb_build_object(
        'id', prop.id,
        'workspace_id', prop.workspace_id,
        'contact_id', prop.contact_id,
        'name', prop.name,
        'address', prop.address,
        'city', prop.city,
        'state', prop.state,
        'zip', prop.zip,
        'description', prop.description,
        'client_notes', prop.client_notes
      )
    end,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ph.id,
            'workspace_id', ph.workspace_id,
            'property_id', ph.property_id,
            'storage_path', ph.storage_path,
            'caption', ph.caption,
            'created_at', ph.created_at
          )
          order by ph.created_at
        )
        from public.property_photos ph
        where ph.property_id = i.property_id
      ),
      '[]'::jsonb
    )
  )
  from public.invoices i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles owner_profile on owner_profile.id = w.created_by
  left join public.contacts c on c.id = i.contact_id
  left join public.properties prop on prop.id = i.property_id
  where i.share_token = requested_token
    and i.share_enabled = true
  limit 1;
$$;

revoke all on function public.get_public_invoice(uuid) from public;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;

-- Realtime keeps an open owner dashboard synchronized after Stripe webhooks.
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;
end
$$;

-- Re-run sync logic with the new columns/functions.
update public.projects set updated_at = updated_at;
update public.invoices set updated_at = updated_at;

-- Public estimates also strip newly added internal unit costs.
create or replace function public.get_public_estimate(requested_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'workspace_id', p.workspace_id,
      'created_by', p.created_by,
      'user_id', p.user_id,
      'name', p.name,
      'client', p.client,
      'address', p.address,
      'city', p.city,
      'contact_id', p.contact_id,
      'property_id', p.property_id,
      'status', p.status,
      'estimate_status', p.estimate_status,
      'estimate_number', p.estimate_number,
      'issue_date', p.issue_date,
      'valid_until', p.valid_until,
      'invoice_due_date', p.invoice_due_date,
      'project_type', p.project_type,
      'billing_method', p.billing_method,
      'square_footage', p.square_footage,
      'labor_rate', p.labor_rate,
      'labor_hours', p.labor_hours,
      'line_items', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(item ->> 'id', ''),
              'description', coalesce(item ->> 'description', ''),
              'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
              'unit', coalesce(item ->> 'unit', 'flat'),
              'unitCost', coalesce(
                nullif(coalesce(item ->> 'unitCost', item ->> 'unit_cost'), '')::numeric,
                0
              )
            )
          )
          from jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(p.line_items, '[]'::jsonb)) = 'array'
                then coalesce(p.line_items, '[]'::jsonb)
              else '[]'::jsonb
            end
          ) item
        ),
        '[]'::jsonb
      ),
      'estimate_summary', p.estimate_summary,
      'scope_description', p.scope_description,
      'client_notes', p.client_notes,
      'terms', p.terms,
      'tax_rate', p.tax_rate,
      'discount_amount', p.discount_amount,
      'total_estimate', p.total_estimate,
      'share_token', p.share_token,
      'sent_at', p.sent_at,
      'viewed_at', p.viewed_at,
      'responded_at', p.responded_at,
      'accepted_at', p.accepted_at,
      'declined_at', p.declined_at,
      'response_name', p.response_name,
      'response_message', p.response_message,
      'signature_data', p.signature_data,
      'scheduled_start', p.scheduled_start,
      'scheduled_end', p.scheduled_end,
      'follow_up_at', p.follow_up_at,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ),
    'company', jsonb_build_object(
      'full_name', owner_profile.full_name,
      'email', owner_profile.email,
      'phone', owner_profile.phone,
      'city', owner_profile.city,
      'state', owner_profile.state,
      'company', coalesce(nullif(w.name, ''), owner_profile.company)
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'workspace_id', c.workspace_id,
        'name', c.name,
        'email', c.email,
        'phone', c.phone,
        'address', c.address,
        'city', c.city,
        'state', c.state,
        'zip', c.zip
      )
    end,
    'property', case
      when prop.id is null then null
      else jsonb_build_object(
        'id', prop.id,
        'workspace_id', prop.workspace_id,
        'contact_id', prop.contact_id,
        'name', prop.name,
        'address', prop.address,
        'city', prop.city,
        'state', prop.state,
        'zip', prop.zip,
        'description', prop.description,
        'client_notes', prop.client_notes
      )
    end,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ph.id,
            'workspace_id', ph.workspace_id,
            'property_id', ph.property_id,
            'storage_path', ph.storage_path,
            'caption', ph.caption,
            'created_at', ph.created_at
          )
          order by ph.created_at
        )
        from public.property_photos ph
        where ph.property_id = p.property_id
      ),
      '[]'::jsonb
    )
  )
  from public.projects p
  join public.workspaces w on w.id = p.workspace_id
  left join public.profiles owner_profile on owner_profile.id = w.created_by
  left join public.contacts c on c.id = p.contact_id
  left join public.properties prop on prop.id = p.property_id
  where p.share_token = requested_token
    and p.share_enabled = true
  limit 1;
$$;

revoke all on function public.get_public_estimate(uuid) from public;
grant execute on function public.get_public_estimate(uuid) to anon, authenticated;
