-- YardPilot account-deletion dependency audit v1
-- READ ONLY. Lists every foreign key that points at auth.users and the action
-- PostgreSQL will take when the auth user is deleted.
select
  ns.nspname as schema_name,
  tbl.relname as table_name,
  con.conname as constraint_name,
  array_agg(att.attname order by key_position.ordinality) as referencing_columns,
  case con.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else con.confdeltype::text
  end as on_delete_action,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
join pg_class referenced on referenced.oid = con.confrelid
join pg_namespace referenced_ns on referenced_ns.oid = referenced.relnamespace
cross join lateral unnest(con.conkey) with ordinality as key_position(attnum, ordinality)
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key_position.attnum
where con.contype = 'f'
  and referenced_ns.nspname = 'auth'
  and referenced.relname = 'users'
group by ns.nspname, tbl.relname, con.conname, con.confdeltype, con.oid
order by
  case con.confdeltype when 'a' then 1 when 'r' then 2 else 3 end,
  ns.nspname,
  tbl.relname,
  con.conname;
