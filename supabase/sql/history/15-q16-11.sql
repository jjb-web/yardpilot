-- YardPilot multi-job estimates and workflow polish.
-- Forward-only migration. Run after the existing lifecycle, Stripe onboarding,
-- and estimate simplification migrations.
--
-- This migration preserves existing customers, estimates, jobs, invoices,
-- assignments, photos, and Stripe data. It does not drop legacy columns or
-- delete old rows.

begin;

alter table public.projects
  add column if not exists job_sections jsonb not null default '[]'::jsonb;

comment on column public.projects.job_sections is
  'Customer estimate job sections. Internal notes remain private and are removed from the public estimate RPC.';

-- Convert each legacy single-job estimate into one job section. Existing rows
-- with job sections are left unchanged.
update public.projects p
set job_sections = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', coalesce(nullif(p.name, ''), 'Job 1'),
    'projectType', coalesce(nullif(p.project_type, ''), 'Other job type'),
    'scopeDescription', coalesce(p.scope_description, ''),
    'internalNotes', coalesce(p.notes, ''),
    'squareFootage', coalesce(p.square_footage, 0),
    'pricePerSquareFoot', 0,
    'scheduledStart', p.scheduled_start,
    'scheduledEnd', p.scheduled_end,
    'laborRate', coalesce(p.labor_rate, 0),
    'laborHours', coalesce(p.labor_hours, 0),
    'laborAssignments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'userId', pa.user_id,
            'name', coalesce(
              nullif(pr.full_name, ''),
              split_part(coalesce(pr.email, ''), '@', 1),
              'Team member'
            ),
            'hours', coalesce(pa.hours, 0),
            'hourlyRate', coalesce(pa.hourly_rate_snapshot, 0)
          )
          order by pa.created_at
        )
        from public.project_assignments pa
        left join public.profiles pr on pr.id = pa.user_id
        where pa.project_id = p.id
      ),
      '[]'::jsonb
    ),
    'lineItems', case
      when jsonb_typeof(coalesce(p.line_items, '[]'::jsonb)) = 'array'
        then coalesce(p.line_items, '[]'::jsonb)
      else '[]'::jsonb
    end,
    'photoIds', '[]'::jsonb
  )
)
where jsonb_typeof(coalesce(p.job_sections, '[]'::jsonb)) <> 'array'
   or jsonb_array_length(coalesce(p.job_sections, '[]'::jsonb)) = 0;

-- Keep manager approval of employee proposals compatible with multi-job
-- estimates. Managers/co-owners/owners retain approval authority through the
-- existing can_manage_workspace check.
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
    job_sections,
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
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'title', request_row.title,
        'projectType', coalesce(nullif(request_row.project_type, ''), 'Other job type'),
        'scopeDescription', coalesce(request_row.scope_description, ''),
        'internalNotes', 'Created from an employee estimate proposal.',
        'squareFootage', 0,
        'pricePerSquareFoot', 0,
        'scheduledStart', request_row.proposed_start,
        'scheduledEnd', null,
        'laborRate', 0,
        'laborHours', 0,
        'laborAssignments', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'userId', wm.user_id,
                'name', coalesce(nullif(pr.full_name, ''), split_part(coalesce(pr.email, ''), '@', 1), 'Team member'),
                'hours', 0,
                'hourlyRate', coalesce(wm.hourly_rate, 0)
              )
            )
            from public.workspace_memberships wm
            left join public.profiles pr on pr.id = wm.user_id
            where wm.workspace_id = request_row.workspace_id
              and wm.user_id = request_row.requested_by
          ),
          '[]'::jsonb
        ),
        'lineItems', '[]'::jsonb,
        'photoIds', '[]'::jsonb
      )
    ),
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

-- ---------------------------------------------------------------------------
-- Employee job details and assigned-job photo access.
--
-- This replaces only the existing employee-project RPC. It does not delete
-- project rows. Employees receive operational job details for current work and
-- their own completed work, while customer pricing, totals, discounts, and
-- worker rates remain hidden.
-- ---------------------------------------------------------------------------

drop function if exists public.get_employee_projects(uuid);

create function public.get_employee_projects(
  requested_workspace_id uuid
)
returns table (
  id text,
  user_id uuid,
  workspace_id uuid,
  created_by uuid,
  name text,
  client text,
  address text,
  city text,
  contact_id text,
  property_id text,
  status text,
  estimate_status text,
  estimate_number text,
  issue_date date,
  valid_until date,
  invoice_due_date date,
  project_type text,
  job_sections jsonb,
  billing_method text,
  square_footage numeric,
  labor_rate numeric,
  labor_hours numeric,
  line_items jsonb,
  estimate_summary text,
  scope_description text,
  client_notes text,
  terms text,
  tax_rate numeric,
  discount_amount numeric,
  total_estimate numeric,
  notes text,
  share_token uuid,
  share_enabled boolean,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  response_name text,
  response_message text,
  signature_data text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  follow_up_at timestamptz,
  assigned_member_ids uuid[],
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.workspace_id,
    p.created_by,
    p.name,
    p.client,
    p.address,
    coalesce(p.city, ''),
    p.contact_id,
    p.property_id,
    p.status,
    p.estimate_status,
    p.estimate_number,
    p.issue_date,
    p.valid_until,
    p.invoice_due_date,
    p.project_type,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', coalesce(job ->> 'id', 'job-' || job_position::text),
            'title', coalesce(job ->> 'title', p.name),
            'projectType', coalesce(job ->> 'projectType', job ->> 'project_type', p.project_type),
            'scopeDescription', coalesce(job ->> 'scopeDescription', job ->> 'scope_description', ''),
            'internalNotes', coalesce(job ->> 'internalNotes', job ->> 'internal_notes', ''),
            'squareFootage', coalesce(nullif(coalesce(job ->> 'squareFootage', job ->> 'square_footage'), '')::numeric, 0),
            'pricePerSquareFoot', 0,
            'scheduledStart', coalesce(job -> 'scheduledStart', job -> 'scheduled_start', 'null'::jsonb),
            'scheduledEnd', coalesce(job -> 'scheduledEnd', job -> 'scheduled_end', 'null'::jsonb),
            'laborRate', 0,
            'laborHours', coalesce(nullif(coalesce(job ->> 'laborHours', job ->> 'labor_hours'), '')::numeric, 0),
            'laborAssignments', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'userId', coalesce(assignment ->> 'userId', assignment ->> 'user_id', ''),
                    'name', coalesce(assignment ->> 'name', 'Team member'),
                    'hours', coalesce(nullif(assignment ->> 'hours', '')::numeric, 0),
                    'hourlyRate', 0
                  )
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(
                      coalesce(job -> 'laborAssignments', job -> 'labor_assignments', '[]'::jsonb)
                    ) = 'array'
                    then coalesce(job -> 'laborAssignments', job -> 'labor_assignments', '[]'::jsonb)
                    else '[]'::jsonb
                  end
                ) assignment
              ),
              '[]'::jsonb
            ),
            'lineItems', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', coalesce(item ->> 'id', 'item-' || item_position::text),
                    'itemType', coalesce(item ->> 'itemType', item ->> 'item_type', 'material'),
                    'description', coalesce(item ->> 'description', ''),
                    'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
                    'unit', coalesce(item ->> 'unit', 'flat'),
                    'unitCost', 0
                  )
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(coalesce(job -> 'lineItems', job -> 'line_items', '[]'::jsonb)) = 'array'
                    then coalesce(job -> 'lineItems', job -> 'line_items', '[]'::jsonb)
                    else '[]'::jsonb
                  end
                ) with ordinality as job_items(item, item_position)
              ),
              '[]'::jsonb
            ),
            'photoIds', case
              when jsonb_typeof(coalesce(job -> 'photoIds', job -> 'photo_ids', '[]'::jsonb)) = 'array'
              then coalesce(job -> 'photoIds', job -> 'photo_ids', '[]'::jsonb)
              else '[]'::jsonb
            end
          )
          order by job_position
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(p.job_sections, '[]'::jsonb)) = 'array'
            then coalesce(p.job_sections, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) with ordinality as jobs(job, job_position)
      ),
      '[]'::jsonb
    ) as job_sections,
    coalesce(p.billing_method, 'fixed'),
    coalesce(p.square_footage, 0),
    0::numeric as labor_rate,
    coalesce(p.labor_hours, 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', coalesce(item ->> 'id', 'item-' || item_position::text),
            'itemType', coalesce(item ->> 'itemType', item ->> 'item_type', 'material'),
            'description', coalesce(item ->> 'description', ''),
            'qty', coalesce(nullif(item ->> 'qty', '')::numeric, 0),
            'unit', coalesce(item ->> 'unit', 'flat'),
            'unitCost', 0
          )
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(p.line_items, '[]'::jsonb)) = 'array'
            then coalesce(p.line_items, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) with ordinality as project_items(item, item_position)
      ),
      '[]'::jsonb
    ) as line_items,
    null::text as estimate_summary,
    coalesce(p.scope_description, ''),
    coalesce(p.client_notes, ''),
    ''::text as terms,
    0::numeric as tax_rate,
    0::numeric as discount_amount,
    0::numeric as total_estimate,
    coalesce(p.notes, ''),
    p.share_token,
    false as share_enabled,
    null::timestamptz as sent_at,
    null::timestamptz as viewed_at,
    null::timestamptz as responded_at,
    p.accepted_at,
    null::timestamptz as declined_at,
    ''::text as response_name,
    ''::text as response_message,
    ''::text as signature_data,
    p.scheduled_start,
    p.scheduled_end,
    p.follow_up_at,
    coalesce(
      array(
        select pa.user_id
        from public.project_assignments pa
        where pa.project_id = p.id
        order by pa.created_at
      ),
      array[]::uuid[]
    ) as assigned_member_ids,
    p.created_at,
    p.updated_at
  from public.projects p
  where p.workspace_id = requested_workspace_id
    and public.workspace_role(requested_workspace_id) = 'employee'
    and p.estimate_status = 'accepted'
    and (
      (
        p.status = 'active'
        and (
          not exists (
            select 1
            from public.project_assignments open_assignment
            where open_assignment.project_id = p.id
          )
          or exists (
            select 1
            from public.project_assignments assigned
            where assigned.project_id = p.id
              and assigned.user_id = auth.uid()
          )
        )
      )
      or (
        p.status in ('completed', 'archived')
        and exists (
          select 1
          from public.project_assignments completed_assignment
          where completed_assignment.project_id = p.id
            and completed_assignment.user_id = auth.uid()
        )
      )
    )
  order by
    case when p.status = 'active' then 0 else 1 end,
    coalesce(p.scheduled_start, p.updated_at) desc;
$$;

revoke all on function public.get_employee_projects(uuid) from public;
grant execute on function public.get_employee_projects(uuid) to authenticated;

create or replace function public.employee_can_view_job_property(
  requested_workspace_id uuid,
  requested_property_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and public.workspace_role(requested_workspace_id) = 'employee'
    and exists (
      select 1
      from public.projects p
      where p.workspace_id = requested_workspace_id
        and p.property_id = requested_property_id
        and p.estimate_status = 'accepted'
        and (
          (
            p.status = 'active'
            and (
              not exists (
                select 1
                from public.project_assignments open_assignment
                where open_assignment.project_id = p.id
              )
              or exists (
                select 1
                from public.project_assignments assigned
                where assigned.project_id = p.id
                  and assigned.user_id = auth.uid()
              )
            )
          )
          or (
            p.status in ('completed', 'archived')
            and exists (
              select 1
              from public.project_assignments completed_assignment
              where completed_assignment.project_id = p.id
                and completed_assignment.user_id = auth.uid()
            )
          )
        )
    ),
    false
  );
$$;

revoke all on function public.employee_can_view_job_property(uuid, text) from public;
grant execute on function public.employee_can_view_job_property(uuid, text) to authenticated;

drop policy if exists "Employees can view assigned job photos"
  on public.property_photos;

create policy "Employees can view assigned job photos"
on public.property_photos for select to authenticated
using (
  public.employee_can_view_job_property(workspace_id, property_id)
);

create or replace function public.employee_can_view_job_photo_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select coalesce(
    exists (
      select 1
      from public.property_photos photo
      where photo.storage_path = object_name
        and public.employee_can_view_job_property(
          photo.workspace_id,
          photo.property_id
        )
    ),
    false
  );
$$;

revoke all on function public.employee_can_view_job_photo_object(text) from public;
grant execute on function public.employee_can_view_job_photo_object(text) to authenticated;

drop policy if exists "Employees can read assigned job photo objects"
  on storage.objects;

create policy "Employees can read assigned job photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-photos'
  and public.employee_can_view_job_photo_object(name)
);

-- ---------------------------------------------------------------------------
-- Database-side content guardrail.
--
-- The React app shows friendly field-level messages. These triggers provide a
-- second layer so direct database writes cannot bypass the same basic rule.
-- Existing rows are not scanned or changed; validation runs only on future
-- inserts and updates.
-- ---------------------------------------------------------------------------

create or replace function public.yardpilot_normalize_moderation(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      translate(
        lower(coalesce(input_text, '')),
        '@4831!|0$57+',
        'aabeiiiosstt'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    '(.)\1+',
    '\1',
    'g'
  );
$$;

create or replace function public.yardpilot_text_is_allowed(input_text text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select public.yardpilot_normalize_moderation(input_text) as value
  )
  select not exists (
    select 1
    from normalized,
      unnest(array[
        'fuck',
        'shit',
        'bitch',
        'cunt',
        'faggot',
        'nigger',
        'nigga',
        'kike',
        'spic',
        'chink',
        'retard',
        'whore',
        'slut'
      ]::text[]) as blocked(term)
    where normalized.value like '%' || blocked.term || '%'
  );
$$;

create or replace function public.yardpilot_validate_text_record()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payload jsonb := to_jsonb(new);
  field_names text[] := array[]::text[];
  field_name text;
  field_value text;
begin
  field_names := case tg_table_name
    when 'profiles' then array['full_name', 'company']
    when 'workspaces' then array['name']
    when 'workspace_memberships' then array['position_title']
    when 'contacts' then array['name', 'source', 'notes']
    when 'properties' then array['name', 'description', 'internal_notes', 'client_notes']
    when 'property_photos' then array['caption']
    when 'projects' then array[
      'name', 'client', 'project_type', 'estimate_summary',
      'scope_description', 'client_notes', 'notes', 'job_sections'
    ]
    when 'invoices' then array['invoice_number', 'notes']
    when 'schedule_events' then array['title', 'description']
    when 'follow_ups' then array['title', 'notes']
    when 'job_requests' then array[
      'title', 'client', 'project_type', 'scope_description', 'manager_notes'
    ]
    else array[]::text[]
  end;

  foreach field_name in array field_names loop
    field_value := coalesce(payload ->> field_name, '');
    if not public.yardpilot_text_is_allowed(field_value) then
      raise exception '% contains language that is not allowed.',
        initcap(replace(field_name, '_', ' '))
        using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.yardpilot_normalize_moderation(text) from public;
revoke all on function public.yardpilot_text_is_allowed(text) from public;
revoke all on function public.yardpilot_validate_text_record() from public;

-- Trigger creation is idempotent. No table rows or columns are deleted.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'workspaces',
    'workspace_memberships',
    'contacts',
    'properties',
    'property_photos',
    'projects',
    'invoices',
    'schedule_events',
    'follow_ups',
    'job_requests'
  ] loop
    execute format(
      'drop trigger if exists yardpilot_validate_text_before_write on public.%I',
      table_name
    );
    execute format(
      'create trigger yardpilot_validate_text_before_write before insert or update on public.%I for each row execute function public.yardpilot_validate_text_record()',
      table_name
    );
  end loop;
end
$$;

-- Shared estimates include customer-safe job sections. Internal job notes are
-- deliberately removed from the public payload.
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
      'job_sections', coalesce(
        (
          select jsonb_agg(
            job
            - 'internalNotes'
            - 'internal_notes'
          )
          from jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(p.job_sections, '[]'::jsonb)) = 'array'
                then coalesce(p.job_sections, '[]'::jsonb)
              else '[]'::jsonb
            end
          ) job
        ),
        '[]'::jsonb
      ),
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


-- Public invoice snapshots expose customer-safe job sections so an invoice
-- created from a multi-job estimate keeps the same itemization.
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
        'job_sections', coalesce(
          (
            select jsonb_agg(
              job
              - 'internalNotes'
              - 'internal_notes'
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(
                  coalesce(
                    i.estimate_snapshot -> 'job_sections',
                    i.estimate_snapshot -> 'jobSections',
                    '[]'::jsonb
                  )
                ) = 'array'
                then coalesce(
                  i.estimate_snapshot -> 'job_sections',
                  i.estimate_snapshot -> 'jobSections',
                  '[]'::jsonb
                )
                else '[]'::jsonb
              end
            ) job
          ),
          '[]'::jsonb
        ),
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

commit;

-- Verification. Existing estimates should now report at least one job section.
select
  count(*) filter (where jsonb_array_length(job_sections) = 0) as estimates_without_jobs,
  count(*) as total_estimates
from public.projects;
