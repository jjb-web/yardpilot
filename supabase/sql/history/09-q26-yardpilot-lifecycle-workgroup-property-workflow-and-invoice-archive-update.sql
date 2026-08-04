-- YardPilot lifecycle, workgroup, property workflow, and invoice archive update.
-- Run AFTER yardpilot-jobs-invoices-contacts-polish.sql.
-- This migration is designed to be safely re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Workgroups: same collaboration model as companies, but duplicate names
--    are allowed. Company names remain uniquely claimed.
-- ---------------------------------------------------------------------------

alter table public.workspaces
  drop constraint if exists workspaces_kind_check;

alter table public.workspaces
  add constraint workspaces_kind_check
  check (kind in ('personal', 'company', 'workgroup'));

create or replace function public.create_workgroup_workspace(requested_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text;
  new_workspace_id uuid;
  generated_slug text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a workgroup.';
  end if;

  cleaned_name := regexp_replace(trim(coalesce(requested_name, '')), '\s+', ' ', 'g');

  if length(cleaned_name) < 2 then
    raise exception 'Enter a workgroup name with at least 2 characters.';
  end if;

  if length(cleaned_name) > 100 then
    raise exception 'Workgroup names must be 100 characters or fewer.';
  end if;

  new_workspace_id := gen_random_uuid();
  generated_slug := trim(both '-' from regexp_replace(lower(cleaned_name), '[^a-z0-9]+', '-', 'g'))
                    || '-' || left(new_workspace_id::text, 8);

  insert into public.workspaces (
    id,
    name,
    slug,
    created_by,
    is_personal,
    kind
  )
  values (
    new_workspace_id,
    cleaned_name,
    generated_slug,
    auth.uid(),
    false,
    'workgroup'
  );

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    position_title
  )
  values (new_workspace_id, auth.uid(), 'owner', 'Owner');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_workgroup_workspace(text) from public;
grant execute on function public.create_workgroup_workspace(text) to authenticated;

-- Owners can maintain their own position title and internal hourly rate,
-- including inside their personal workspace.
create or replace function public.update_my_workspace_rate(
  requested_workspace_id uuid,
  requested_position_title text,
  requested_hourly_rate numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if greatest(coalesce(requested_hourly_rate, 0), 0) > 100000 then
    raise exception 'Hourly rate is outside the allowed range.';
  end if;

  update public.workspace_memberships
  set
    position_title = left(trim(coalesce(requested_position_title, '')), 80),
    hourly_rate = greatest(coalesce(requested_hourly_rate, 0), 0)
  where workspace_id = requested_workspace_id
    and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this workspace.';
  end if;
end;
$$;

revoke all on function public.update_my_workspace_rate(uuid, text, numeric) from public;
grant execute on function public.update_my_workspace_rate(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Estimate -> accepted job -> completed past job -> invoice lifecycle.
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists archived_at timestamptz;

create index if not exists invoices_workspace_archive_idx
  on public.invoices(workspace_id, archived_at, updated_at desc);

-- Only accepted estimates create job calendar entries. Draft, sent, and
-- declined estimates remain estimates and never appear as scheduled jobs.
create or replace function public.sync_project_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_user uuid;
begin
  select pa.user_id into assigned_user
  from public.project_assignments pa
  where pa.project_id = new.id
  order by pa.created_at
  limit 1;

  if new.status = 'active'
     and new.estimate_status = 'accepted'
     and new.scheduled_start is not null then
    insert into public.schedule_events (
      workspace_id, created_by, title, description, start_at, end_at,
      all_day, source_type, project_id, contact_id, assigned_user_id,
      status, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      new.name,
      coalesce(new.scope_description, ''),
      new.scheduled_start,
      new.scheduled_end,
      false,
      'project',
      new.id,
      new.contact_id,
      assigned_user,
      'scheduled',
      'project:' || new.id || ':schedule',
      now()
    )
    on conflict (auto_key) do update set
      workspace_id = excluded.workspace_id,
      title = excluded.title,
      description = excluded.description,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = excluded.status,
      updated_at = now();

    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Upcoming appointment: ' || new.name,
      trim(concat_ws(', ', nullif(new.address, ''), nullif(new.city, ''))),
      new.scheduled_start - interval '1 day',
      'appointment',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':appointment',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = case
        when follow_ups.status = 'completed' then 'completed'
        else 'pending'
      end,
      updated_at = now();
  else
    delete from public.schedule_events
    where auto_key = 'project:' || new.id || ':schedule';

    delete from public.follow_ups
    where auto_key = 'project:' || new.id || ':appointment';
  end if;

  -- A deliberate custom follow-up stays until the user completes or dismisses it.
  if new.follow_up_at is not null then
    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Follow up: ' || new.name,
      coalesce(new.client_notes, ''),
      new.follow_up_at,
      'estimate',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':followup',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = case
        when follow_ups.status = 'completed' then 'completed'
        else 'pending'
      end,
      updated_at = now();
  else
    delete from public.follow_ups
    where auto_key = 'project:' || new.id || ':followup';
  end if;

  if new.status = 'active'
     and new.valid_until is not null
     and new.estimate_status in ('draft', 'sent') then
    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, assigned_user_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      coalesce(new.created_by, new.user_id),
      'Estimate expires soon: ' || new.name,
      'Estimate ' || new.estimate_number || ' is approaching its expiration date.',
      (new.valid_until::timestamptz + interval '12 hours') - interval '2 days',
      'estimate',
      'pending',
      'email',
      new.contact_id,
      new.id,
      assigned_user,
      'project:' || new.id || ':expiry',
      now()
    )
    on conflict (auto_key) do update set
      title = excluded.title,
      notes = excluded.notes,
      due_at = excluded.due_at,
      contact_id = excluded.contact_id,
      assigned_user_id = excluded.assigned_user_id,
      status = case
        when follow_ups.status = 'completed' then 'completed'
        else 'pending'
      end,
      updated_at = now();
  else
    delete from public.follow_ups
    where auto_key = 'project:' || new.id || ':expiry';
  end if;

  return new;
end;
$$;

-- Completing a job creates one final invoice snapshot. Only an accepted
-- estimate can be completed as a job.
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
    current_date + 14,
    'draft',
    greatest(coalesce(project_row.total_estimate, 0), 0),
    'Final invoice created from accepted estimate ' ||
      coalesce(project_row.estimate_number, project_row.name) || '.',
    snapshot,
    false,
    null
  )
  returning id into new_invoice_id;

  return new_invoice_id;
end;
$$;

revoke all on function public.complete_project_and_create_invoice(text) from public;
grant execute on function public.complete_project_and_create_invoice(text) to authenticated;

-- Completing an invoice removes it from the active invoice list while keeping
-- the final status and document attached to its Past Job.
create or replace function public.complete_invoice(requested_invoice_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

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
      when status not in ('paid', 'void') and due_date < current_date then 'overdue'
      else status
    end,
    archived_at = coalesce(archived_at, now()),
    updated_at = now()
  where id = requested_invoice_id;
end;
$$;

revoke all on function public.complete_invoice(text) from public;
grant execute on function public.complete_invoice(text) to authenticated;

-- Archived invoices no longer create calendar items. Their status is preserved
-- so Past Jobs can show "Archived · Paid", "Archived · Void", etc.
create or replace function public.sync_invoice_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived_at is null and new.status <> 'void' then
    insert into public.schedule_events (
      workspace_id, created_by, title, description, start_at, all_day,
      source_type, invoice_id, project_id, contact_id, status, auto_key, updated_at
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
      case when new.status = 'paid' then 'completed' else 'scheduled' end,
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

    insert into public.follow_ups (
      workspace_id, created_by, title, notes, due_at, type, status,
      channel, contact_id, project_id, invoice_id, auto_key, updated_at
    )
    values (
      new.workspace_id,
      new.created_by,
      'Payment due: ' || new.invoice_number,
      coalesce(new.notes, ''),
      new.due_date::timestamptz + interval '9 hours',
      'payment',
      case when new.status = 'paid' then 'completed' else 'pending' end,
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
      status = excluded.status,
      updated_at = now();
  else
    delete from public.schedule_events
    where auto_key = 'invoice:' || new.id || ':due';

    if new.status = 'void' then
      delete from public.follow_ups
      where auto_key = 'invoice:' || new.id || ':payment';
    elsif new.status = 'paid' then
      update public.follow_ups
      set status = 'completed', updated_at = now()
      where auto_key = 'invoice:' || new.id || ':payment';
    end if;
  end if;

  return new;
end;
$$;

-- Delete an estimate and all operational records generated from it.
create or replace function public.delete_project_with_connected_data(
  requested_project_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.projects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into project_row
  from public.projects
  where id = requested_project_id
  for update;

  if project_row.id is null then
    raise exception 'Estimate not found.';
  end if;

  if not public.can_manage_workspace(project_row.workspace_id) then
    raise exception 'You do not have permission to delete this estimate.';
  end if;

  delete from public.schedule_events
  where project_id = requested_project_id
     or invoice_id in (
       select id from public.invoices where project_id = requested_project_id
     );

  delete from public.follow_ups
  where project_id = requested_project_id
     or invoice_id in (
       select id from public.invoices where project_id = requested_project_id
     );

  delete from public.invoices
  where project_id = requested_project_id;

  delete from public.project_assignments
  where project_id = requested_project_id;

  delete from public.projects
  where id = requested_project_id;
end;
$$;

revoke all on function public.delete_project_with_connected_data(text) from public;
grant execute on function public.delete_project_with_connected_data(text) to authenticated;

-- Re-run the project/invoice sync logic for current records.
update public.projects set updated_at = updated_at;
update public.invoices set updated_at = updated_at;
