-- YardPilot account deletion diagnostic v2
-- READ ONLY.

select
  to_regprocedure(
    'public.yardpilot_list_owned_storage_objects(uuid)'
  ) is not null as storage_helper_installed;

select
  constraint_name,
  source_schema,
  source_table,
  source_column,
  delete_action
from (
  select
    con.conname as constraint_name,
    src_ns.nspname as source_schema,
    src.relname as source_table,
    src_att.attname as source_column,
    case con.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else con.confdeltype::text
    end as delete_action
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace src_ns on src_ns.oid = src.relnamespace
  join pg_class target on target.oid = con.confrelid
  join pg_namespace target_ns on target_ns.oid = target.relnamespace
  join lateral unnest(con.conkey) with ordinality keys(attnum, ord)
    on true
  join pg_attribute src_att
    on src_att.attrelid = src.oid
   and src_att.attnum = keys.attnum
  where con.contype = 'f'
    and target_ns.nspname = 'auth'
    and target.relname = 'users'
) foreign_keys
order by
  case delete_action
    when 'NO ACTION' then 1
    when 'RESTRICT' then 2
    else 3
  end,
  source_schema,
  source_table,
  source_column;
