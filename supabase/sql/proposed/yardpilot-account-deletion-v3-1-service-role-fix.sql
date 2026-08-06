-- YardPilot account deletion v3.1
-- Fixes false "service_role is required" failures with current Supabase API keys.
-- Authorization is enforced through EXECUTE privileges: only service_role may call these RPCs.
-- Run once in the Supabase SQL Editor before deploying delete-account v3.
-- Idempotent: safe to run again.

begin;

create or replace function public.yardpilot_prepare_account_deletion(
  requested_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocked_workspaces jsonb;
  deleted_workspace_count integer := 0;
  item record;
  nullable_column boolean;
begin
  if not exists (
    select 1
    from auth.users
    where id = requested_user_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_deleted', true,
      'deleted_workspace_count', 0
    );
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', workspace_rows.id,
      'name', workspace_rows.name,
      'members', workspace_rows.other_members
    )
  )
  into blocked_workspaces
  from (
    select
      w.id,
      w.name,
      count(wm.id)::integer as other_members
    from public.workspaces as w
    join public.workspace_memberships as wm
      on wm.workspace_id = w.id
     and wm.user_id <> requested_user_id
    where w.created_by = requested_user_id
      and coalesce(w.is_personal, false) = false
    group by w.id, w.name
    having count(wm.id) > 0
  ) as workspace_rows;

  if blocked_workspaces is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'OWNERSHIP_TRANSFER_REQUIRED',
      'error', 'Transfer ownership or remove the other members from each owned company/workgroup before deleting this account.',
      'workspaces', blocked_workspaces
    );
  end if;

  -- Preserve shared-workspace business records by moving creator attribution
  -- to the workspace owner before the deleting user is removed.
  for item in
    select *
    from (
      values
        ('projects', 'created_by'),
        ('projects', 'user_id'),
        ('contacts', 'user_id'),
        ('properties', 'user_id'),
        ('property_photos', 'user_id'),
        ('invoices', 'created_by'),
        ('schedule_events', 'created_by'),
        ('follow_ups', 'created_by'),
        ('project_assignments', 'assigned_by'),
        ('job_requests', 'requested_by'),
        ('workspace_invites', 'invited_by'),
        ('marketplace_business_profiles', 'created_by'),
        ('marketplace_job_openings', 'created_by'),
        ('client_job_bids', 'submitted_by'),
        ('employee_payment_records', 'created_by'),
        ('employee_payment_records', 'paid_by'),
        ('access_code_redemptions', 'redeemed_by')
    ) as transfer_list(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = 'workspace_id'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.column_name
    ) then
      execute format(
        'update public.%I as target
           set %I = workspace.created_by
          from public.workspaces as workspace
         where target.workspace_id = workspace.id
           and target.%I = $1
           and workspace.created_by <> $1',
        item.table_name,
        item.column_name,
        item.column_name
      ) using requested_user_id;
    end if;
  end loop;

  -- Delete account-owned support and diagnostic text rather than retaining it
  -- with a null user identifier.
  for item in
    select *
    from (
      values
        ('feedback_submissions', 'user_id'),
        ('support_messages', 'user_id'),
        ('client_error_reports', 'user_id')
    ) as delete_list(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.column_name
    ) then
      execute format(
        'delete from public.%I where %I = $1',
        item.table_name,
        item.column_name
      ) using requested_user_id;
    end if;
  end loop;

  -- Remove personal and sole-owned workspaces first. Their workspace-scoped
  -- contacts, properties, estimates, jobs, invoices, billing records, and
  -- marketplace records are removed by their existing workspace cascades.
  delete from public.workspaces
  where created_by = requested_user_id;

  get diagnostics deleted_workspace_count = row_count;

  -- Remove membership in workspaces owned by somebody else.
  delete from public.workspace_memberships
  where user_id = requested_user_id;

  -- Normalize nullable attribution columns that are deliberately historical.
  for item in
    select *
    from (
      values
        ('access_codes', 'created_by'),
        ('audit_log', 'actor_user_id'),
        ('projects', 'submitted_for_approval_by'),
        ('projects', 'approved_by'),
        ('marketplace_work_orders', 'cancellation_requested_by'),
        ('marketplace_work_orders', 'cancellation_responded_by'),
        ('marketplace_reviews', 'moderated_by')
    ) as null_list(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.column_name
        and is_nullable = 'YES'
    ) then
      execute format(
        'update public.%I set %I = null where %I = $1',
        item.table_name,
        item.column_name,
        item.column_name
      ) using requested_user_id;
    end if;
  end loop;

  -- Clear every remaining PUBLIC-schema NO ACTION/RESTRICT foreign-key
  -- reference to auth.users. Nullable attribution is anonymized; non-null
  -- account-owned rows are removed. Shared business attribution was already
  -- transferred above.
  for item in
    select
      source_namespace.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name,
      not source_column.attnotnull as is_nullable
    from pg_constraint as constraint_row
    join pg_class as source_table
      on source_table.oid = constraint_row.conrelid
    join pg_namespace as source_namespace
      on source_namespace.oid = source_table.relnamespace
    join pg_class as target_table
      on target_table.oid = constraint_row.confrelid
    join pg_namespace as target_namespace
      on target_namespace.oid = target_table.relnamespace
    join lateral unnest(constraint_row.conkey) with ordinality
      as source_keys(attribute_number, ordinal_position)
      on true
    join pg_attribute as source_column
      on source_column.attrelid = source_table.oid
     and source_column.attnum = source_keys.attribute_number
    where constraint_row.contype = 'f'
      and target_namespace.nspname = 'auth'
      and target_table.relname = 'users'
      and source_namespace.nspname = 'public'
      and constraint_row.confdeltype in ('a', 'r')
      and cardinality(constraint_row.conkey) = 1
  loop
    if item.is_nullable then
      execute format(
        'update %I.%I set %I = null where %I = $1',
        item.schema_name,
        item.table_name,
        item.column_name,
        item.column_name
      ) using requested_user_id;
    else
      execute format(
        'delete from %I.%I where %I = $1',
        item.schema_name,
        item.table_name,
        item.column_name
      ) using requested_user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'deleted_workspace_count', deleted_workspace_count
  );
end;
$$;

revoke all
on function public.yardpilot_prepare_account_deletion(uuid)
from public, anon, authenticated;

grant execute
on function public.yardpilot_prepare_account_deletion(uuid)
to service_role;

create or replace function public.yardpilot_list_account_storage_objects(
  requested_user_id uuid
)
returns table (
  bucket_id text,
  object_name text,
  preserve boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    object_row.bucket_id,
    object_row.name as object_name,
    case
      when object_row.bucket_id = 'property-photos'
       and exists (
         select 1
         from public.property_photos as photo
         join public.workspaces as workspace
           on workspace.id = photo.workspace_id
         where photo.storage_path = object_row.name
           and workspace.created_by <> requested_user_id
       )
      then true
      else false
    end as preserve
  from storage.objects as object_row
  where object_row.owner_id::text = requested_user_id::text
  order by object_row.bucket_id, object_row.name;
$$;

revoke all
on function public.yardpilot_list_account_storage_objects(uuid)
from public, anon, authenticated;

grant execute
on function public.yardpilot_list_account_storage_objects(uuid)
to service_role;

commit;

select
  to_regprocedure(
    'public.yardpilot_prepare_account_deletion(uuid)'
  ) as prepare_function,
  to_regprocedure(
    'public.yardpilot_list_account_storage_objects(uuid)'
  ) as storage_function;

-- Verification: both RPCs must exist, and only service_role should have EXECUTE.
select
  routine.routine_name,
  has_function_privilege(
    'anon',
    format('public.%I(uuid)', routine.routine_name),
    'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    format('public.%I(uuid)', routine.routine_name),
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    format('public.%I(uuid)', routine.routine_name),
    'EXECUTE'
  ) as service_role_can_execute
from information_schema.routines as routine
where routine.routine_schema = 'public'
  and routine.routine_name in (
    'yardpilot_prepare_account_deletion',
    'yardpilot_list_account_storage_objects'
  )
order by routine.routine_name;
