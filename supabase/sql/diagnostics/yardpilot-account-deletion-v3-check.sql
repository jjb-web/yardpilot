-- YardPilot account deletion v3 check
-- READ ONLY.

select
  case
    when to_regprocedure('public.yardpilot_prepare_account_deletion(uuid)') is not null
      then 'PASS'
    else 'FAIL'
  end as prepare_function,
  case
    when to_regprocedure('public.yardpilot_list_account_storage_objects(uuid)') is not null
      then 'PASS'
    else 'FAIL'
  end as storage_function;

select
  source_schema,
  source_table,
  source_column,
  delete_action,
  nullable
from (
  select
    source_namespace.nspname as source_schema,
    source_table.relname as source_table,
    source_column.attname as source_column,
    case constraint_row.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else constraint_row.confdeltype::text
    end as delete_action,
    not source_column.attnotnull as nullable
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
) as references_to_auth
order by source_schema, source_table, source_column;
