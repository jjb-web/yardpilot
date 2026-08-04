-- YardPilot estimate simplification
-- Removes profit/internal-cost tracking and restores simple estimate pricing:
--
--   materials/services
-- + sum(worker hours × worker hourly rate)
-- + tax
-- - discount
--
-- Safe to run after the existing YardPilot payments/workspace migrations.

begin;

-- Remove saved internal-cost keys from project line items.
update public.projects p
set line_items = coalesce(
  (
    select jsonb_agg(item - 'internalCost' - 'internal_cost')
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p.line_items, '[]'::jsonb)) = 'array'
          then coalesce(p.line_items, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) item
  ),
  '[]'::jsonb
);

-- Remove old internal-cost fields from saved invoice snapshots.
update public.invoices
set estimate_snapshot =
  coalesce(estimate_snapshot, '{}'::jsonb)
  - 'internalOtherCost'
  - 'internal_other_cost'
where estimate_snapshot is not null;

update public.invoices i
set estimate_snapshot = jsonb_set(
  i.estimate_snapshot,
  '{line_items}',
  coalesce(
    (
      select jsonb_agg(item - 'internalCost' - 'internal_cost')
      from jsonb_array_elements(i.estimate_snapshot -> 'line_items') item
    ),
    '[]'::jsonb
  ),
  true
)
where jsonb_typeof(i.estimate_snapshot -> 'line_items') = 'array';

update public.invoices i
set estimate_snapshot = jsonb_set(
  i.estimate_snapshot,
  '{lineItems}',
  coalesce(
    (
      select jsonb_agg(item - 'internalCost' - 'internal_cost')
      from jsonb_array_elements(i.estimate_snapshot -> 'lineItems') item
    ),
    '[]'::jsonb
  ),
  true
)
where jsonb_typeof(i.estimate_snapshot -> 'lineItems') = 'array';

-- Recalculate existing estimate totals using each assigned worker's saved rate.
with estimate_amounts as (
  select
    p.id,
    coalesce(
      (
        select sum(
          coalesce(nullif(item ->> 'qty', '')::numeric, 0) *
          coalesce(
            nullif(
              coalesce(item ->> 'unitCost', item ->> 'unit_cost'),
              ''
            )::numeric,
            0
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
      0
    ) as materials,
    case
      when exists (
        select 1
        from public.project_assignments pa
        where pa.project_id = p.id
      )
      then coalesce(
        (
          select sum(
            coalesce(pa.hours, 0) *
            coalesce(pa.hourly_rate_snapshot, 0)
          )
          from public.project_assignments pa
          where pa.project_id = p.id
        ),
        0
      )
      else coalesce(p.labor_hours, 0) * coalesce(p.labor_rate, 0)
    end as labor,
    coalesce(p.tax_rate, 0) as tax_rate,
    greatest(coalesce(p.discount_amount, 0), 0) as discount
  from public.projects p
  where p.estimate_status <> 'accepted'
),
new_totals as (
  select
    id,
    greatest(
      0,
      materials
      + labor
      + ((materials + labor) * tax_rate / 100)
      - discount
    ) as total
  from estimate_amounts
)
update public.projects p
set
  total_estimate = n.total,
  updated_at = now()
from new_totals n
where n.id = p.id;

-- Remove the database column used only by the deleted profit feature.
alter table public.projects
  drop constraint if exists projects_internal_other_cost_check;

alter table public.projects
  drop column if exists internal_other_cost;

-- Keep employee proposal approval compatible with the simplified projects table.
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

-- Public estimates now include billable worker hours/rates so the shared
-- estimate calculates the same labor total as the private estimate.
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
      'labor_assignments', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', pa.user_id,
              'name', coalesce(
                nullif(profile.full_name, ''),
                split_part(coalesce(profile.email, ''), '@', 1),
                'Crew member'
              ),
              'hours', pa.hours,
              'hourly_rate', pa.hourly_rate_snapshot
            )
            order by pa.created_at
          )
          from public.project_assignments pa
          left join public.profiles profile on profile.id = pa.user_id
          where pa.project_id = p.id
        ),
        '[]'::jsonb
      ),
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

commit;

-- Verification: this should return no internal_other_cost column.
select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
order by ordinal_position;
