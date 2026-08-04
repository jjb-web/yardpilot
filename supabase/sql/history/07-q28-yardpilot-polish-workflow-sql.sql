-- YardPilot polish and workflow migration.
-- Run AFTER yardpilot-workspace-lifecycle.sql (the corrected V2 migration).
-- Re-runnable. Do not rerun older Query 4 or Query 5 afterward.

create extension if not exists pgcrypto;

-- Estimate location and pricing method.
alter table public.projects
  add column if not exists city text not null default '',
  add column if not exists billing_method text not null default 'fixed';

update public.projects
set billing_method = 'fixed'
where billing_method is null
   or billing_method not in ('fixed', 'hourly');

alter table public.projects
  drop constraint if exists projects_billing_method_check;

alter table public.projects
  add constraint projects_billing_method_check
  check (billing_method in ('fixed', 'hourly'));

-- Human-friendly, optionally customized team codes. The UUID token remains
-- the secure value used in invitation links. Both forms are tied to the
-- invited email address and expire with the invitation.
alter table public.workspace_invites
  add column if not exists code text;

update public.workspace_invites
set code = upper(substr(replace(token::text, '-', ''), 1, 10))
where code is null or trim(code) = '';

update public.workspace_invites
set code = upper(trim(code));

alter table public.workspace_invites
  alter column code set default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12)),
  alter column code set not null;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_code_check;

alter table public.workspace_invites
  add constraint workspace_invites_code_check
  check (code ~ '^[A-Z0-9_-]{6,32}$');

drop index if exists public.workspace_invites_pending_code_unique_idx;
create unique index workspace_invites_pending_code_unique_idx
  on public.workspace_invites (lower(code))
  where status = 'pending';

create or replace function public.accept_workspace_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.workspace_invites%rowtype;
  current_email text;
  cleaned_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  cleaned_code := trim(coalesce(invite_code, ''));
  if cleaned_code = '' then
    raise exception 'Enter an invite code or invitation link.';
  end if;

  select email into current_email
  from auth.users
  where id = auth.uid();

  select * into invite_row
  from public.workspace_invites
  where status = 'pending'
    and (
      token::text = cleaned_code
      or lower(code) = lower(cleaned_code)
    )
  order by created_at desc
  limit 1
  for update;

  if invite_row.id is null then
    raise exception 'Invite code is invalid or no longer active.';
  end if;

  if invite_row.expires_at < now() then
    update public.workspace_invites
    set status = 'expired'
    where id = invite_row.id;
    raise exception 'Invite code has expired.';
  end if;

  if lower(invite_row.email) <> lower(coalesce(current_email, '')) then
    raise exception 'Sign in with the email address that was invited.';
  end if;

  insert into public.workspace_memberships (
    workspace_id, user_id, role, position_title
  )
  values (
    invite_row.workspace_id,
    auth.uid(),
    invite_row.role,
    case invite_row.role
      when 'co_owner' then 'Co-owner'
      when 'manager' then 'Manager'
      else 'Employee'
    end
  )
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        position_title = case
          when public.workspace_memberships.position_title = ''
          then excluded.position_title
          else public.workspace_memberships.position_title
        end;

  update public.workspace_invites
  set status = 'accepted'
  where id = invite_row.id;

  return invite_row.workspace_id;
end;
$$;

revoke all on function public.accept_workspace_invite(text) from public;
grant execute on function public.accept_workspace_invite(text) to authenticated;

-- Keep the client-facing estimate payload synchronized with the new fields.
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
      'project_type', p.project_type,
      'billing_method', p.billing_method,
      'square_footage', p.square_footage,
      'labor_rate', p.labor_rate,
      'labor_hours', p.labor_hours,
      'line_items', p.line_items,
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
