-- YardPilot jobs, invoices, contacts, profile, invite, and photo-policy update.
-- Run AFTER the corrected workspace lifecycle V2 and polish-workflow migrations.
-- This migration is designed to be safely re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Editable profile details. Email remains controlled by Supabase Auth.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists city text not null default '',
  add column if not exists state text not null default '';

create or replace function public.update_my_profile(
  requested_full_name text,
  requested_phone text,
  requested_company text,
  requested_city text,
  requested_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.profiles
  set
    full_name = left(trim(coalesce(requested_full_name, '')), 120),
    phone = left(trim(coalesce(requested_phone, '')), 40),
    company = left(trim(coalesce(requested_company, '')), 120),
    city = left(trim(coalesce(requested_city, '')), 100),
    state = left(trim(coalesce(requested_state, '')), 60)
  where id = auth.uid()
  returning * into profile_row;

  if profile_row.id is null then
    raise exception 'Profile not found.';
  end if;

  return jsonb_build_object(
    'full_name', profile_row.full_name,
    'email', profile_row.email,
    'phone', profile_row.phone,
    'company', profile_row.company,
    'city', profile_row.city,
    'state', profile_row.state
  );
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Prevent self-invites and duplicate member invites at the database layer.
-- ---------------------------------------------------------------------------

create or replace function public.validate_workspace_invite_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inviter_email text;
begin
  new.email := lower(trim(new.email));
  if trim(coalesce(new.code, '')) = '' then
    new.code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  else
    new.code := upper(trim(new.code));
  end if;

  select u.email into inviter_email
  from auth.users u
  where u.id = new.invited_by;

  if lower(coalesce(inviter_email, '')) = new.email then
    raise exception 'You are already a member of this workspace and cannot invite yourself.';
  end if;

  if exists (
    select 1
    from public.workspace_memberships wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = new.workspace_id
      and lower(coalesce(p.email, '')) = new.email
  ) then
    raise exception 'That email already belongs to a member of this workspace.';
  end if;

  if exists (
    select 1
    from public.workspace_invites wi
    where wi.workspace_id = new.workspace_id
      and lower(wi.email) = new.email
      and wi.status = 'pending'
      and wi.id <> new.id
  ) then
    raise exception 'A pending invitation already exists for that email.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_workspace_invite_before_insert
  on public.workspace_invites;

create trigger validate_workspace_invite_before_insert
before insert on public.workspace_invites
for each row execute function public.validate_workspace_invite_insert();

-- ---------------------------------------------------------------------------
-- 3. Repair property-photo RLS for workspace owners, co-owners, and managers.
-- ---------------------------------------------------------------------------

create or replace function public.can_upload_property_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(
    auth.uid() is not null
    and (storage.foldername(object_name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.properties prop
      join public.workspace_memberships wm
        on wm.workspace_id = prop.workspace_id
       and wm.user_id = auth.uid()
      where prop.id = (storage.foldername(object_name))[2]
        and wm.role in ('owner', 'co_owner', 'manager')
    ),
    false
  );
$$;

revoke all on function public.can_upload_property_photo_object(text) from public;
grant execute on function public.can_upload_property_photo_object(text) to authenticated;

drop policy if exists "Workspace managers can create property photos"
  on public.property_photos;

create policy "Workspace managers can create property photos"
on public.property_photos for insert to authenticated
with check (
  user_id = auth.uid()
  and public.can_manage_workspace(workspace_id)
  and exists (
    select 1
    from public.properties prop
    where prop.id = property_id
      and prop.workspace_id = property_photos.workspace_id
  )
);

drop policy if exists "Workspace managers can upload property photo objects"
  on storage.objects;

create policy "Workspace managers can upload property photo objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos'
  and public.can_upload_property_photo_object(name)
);

-- ---------------------------------------------------------------------------
-- 4. Final invoices are immutable estimate snapshots and can be shared.
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists estimate_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists share_token uuid default gen_random_uuid(),
  add column if not exists share_enabled boolean not null default false,
  add column if not exists sent_at timestamptz,
  add column if not exists viewed_at timestamptz;

update public.invoices
set share_token = gen_random_uuid()
where share_token is null;

alter table public.invoices
  alter column share_token set default gen_random_uuid(),
  alter column share_token set not null;

create unique index if not exists invoices_share_token_unique_idx
  on public.invoices(share_token);

create index if not exists invoices_project_idx
  on public.invoices(workspace_id, project_id, created_at desc);

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

  select i.id into existing_invoice_id
  from public.invoices i
  where i.workspace_id = project_row.workspace_id
    and i.project_id = project_row.id
    and i.status <> 'void'
  order by i.created_at desc
  limit 1;

  update public.projects
  set
    status = 'completed',
    updated_at = now()
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
            'name', coalesce(nullif(p.full_name, ''), split_part(coalesce(p.email, ''), '@', 1), 'Team member'),
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
    share_enabled
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
    'Final invoice created from accepted estimate ' || coalesce(project_row.estimate_number, project_row.name) || '.',
    snapshot,
    false
  )
  returning id into new_invoice_id;

  return new_invoice_id;
end;
$$;

revoke all on function public.complete_project_and_create_invoice(text) from public;
grant execute on function public.complete_project_and_create_invoice(text) to authenticated;

-- Completed jobs disappear from the calendar, but existing follow-ups remain
-- until they are completed or dismissed through the normal follow-up workflow.
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

  if new.status = 'active' and new.scheduled_start is not null then
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
      coalesce(new.address, ''),
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
      status = 'pending',
      updated_at = now();
  elsif new.status in ('completed', 'archived') then
    delete from public.schedule_events
      where auto_key = 'project:' || new.id || ':schedule';
  else
    delete from public.schedule_events
      where auto_key = 'project:' || new.id || ':schedule';
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':appointment';
  end if;

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
  elsif new.status = 'active' then
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':followup';
  end if;

  if new.valid_until is not null and new.estimate_status in ('draft', 'sent') then
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
  elsif new.status = 'active' then
    delete from public.follow_ups
      where auto_key = 'project:' || new.id || ':expiry';
  end if;

  return new;
end;
$$;

create or replace function public.record_invoice_view(requested_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
  set viewed_at = coalesce(viewed_at, now())
  where share_token = requested_token
    and share_enabled = true;
end;
$$;

revoke all on function public.record_invoice_view(uuid) from public;
grant execute on function public.record_invoice_view(uuid) to anon, authenticated;

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
      'status', i.status,
      'amount', i.amount,
      'notes', i.notes,
      'estimate_snapshot', i.estimate_snapshot,
      'share_token', i.share_token,
      'share_enabled', i.share_enabled,
      'sent_at', i.sent_at,
      'viewed_at', i.viewed_at,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ),
    'company', jsonb_build_object(
      'full_name', owner_profile.full_name,
      'email', owner_profile.email,
      'phone', owner_profile.phone,
      'company', coalesce(nullif(w.name, ''), owner_profile.company),
      'city', owner_profile.city,
      'state', owner_profile.state
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

create or replace function public.can_view_shared_invoice_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_photos ph
    join public.invoices i on i.property_id = ph.property_id
    where ph.storage_path = object_name
      and i.share_enabled = true
  );
$$;

revoke all on function public.can_view_shared_invoice_photo(text) from public;
grant execute on function public.can_view_shared_invoice_photo(text) to anon, authenticated;

drop policy if exists "Public can read photos used by shared invoices"
  on storage.objects;

create policy "Public can read photos used by shared invoices"
on storage.objects for select to anon
using (
  bucket_id = 'property-photos'
  and public.can_view_shared_invoice_photo(name)
);
