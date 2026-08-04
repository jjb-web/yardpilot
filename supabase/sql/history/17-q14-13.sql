-- YardPilot forward-only workflow polish v3
-- Adds a safe operational-details RPC for employee job views.
-- No tables, columns, business records, or old migrations are deleted.

begin;

create or replace function public.get_employee_project_operational_details(
  requested_workspace_id uuid
)
returns table (
  project_id text,
  contact_details jsonb,
  property_details jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as project_id,
    case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'name', coalesce(c.name, ''),
        'email', coalesce(c.email, ''),
        'phone', coalesce(c.phone, ''),
        'address', coalesce(c.address, ''),
        'city', coalesce(c.city, ''),
        'state', coalesce(c.state, ''),
        'zip', coalesce(c.zip, ''),
        'notes', coalesce(c.notes, '')
      )
    end as contact_details,
    case
      when pr.id is null then null
      else jsonb_build_object(
        'id', pr.id,
        'name', coalesce(pr.name, ''),
        'address', coalesce(pr.address, ''),
        'city', coalesce(pr.city, ''),
        'state', coalesce(pr.state, ''),
        'zip', coalesce(pr.zip, ''),
        'description', coalesce(pr.description, ''),
        'internalNotes', coalesce(pr.internal_notes, ''),
        'clientNotes', coalesce(pr.client_notes, '')
      )
    end as property_details
  from public.projects p
  left join public.contacts c
    on c.id = p.contact_id
   and c.workspace_id = p.workspace_id
  left join public.properties pr
    on pr.id = p.property_id
   and pr.workspace_id = p.workspace_id
  where p.workspace_id = requested_workspace_id
    and exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = requested_workspace_id
        and wm.user_id = auth.uid()
    )
    and (
      (
        p.status = 'active'
        and p.estimate_status = 'accepted'
        and (
          not exists (
            select 1
            from public.project_assignments pa
            where pa.project_id = p.id
              and pa.workspace_id = p.workspace_id
          )
          or exists (
            select 1
            from public.project_assignments pa
            where pa.project_id = p.id
              and pa.workspace_id = p.workspace_id
              and pa.user_id = auth.uid()
          )
        )
      )
      or (
        p.status in ('completed', 'archived')
        and exists (
          select 1
          from public.project_assignments pa
          where pa.project_id = p.id
            and pa.workspace_id = p.workspace_id
            and pa.user_id = auth.uid()
        )
      )
      or exists (
        select 1
        from public.workspace_memberships wm
        where wm.workspace_id = requested_workspace_id
          and wm.user_id = auth.uid()
          and wm.role in ('owner', 'co_owner', 'manager')
      )
    );
$$;

revoke all on function public.get_employee_project_operational_details(uuid) from public;
grant execute on function public.get_employee_project_operational_details(uuid) to authenticated;

comment on function public.get_employee_project_operational_details(uuid) is
  'Returns customer and property operational details only for jobs visible to the signed-in workspace member.';

commit;

select
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_employee_project_operational_details';
