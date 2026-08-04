-- YardPilot access-code volatility fix v2
-- Safe forward-only patch. Deletes no data.
-- PostgreSQL does not support ALTER FUNCTION IF EXISTS, so existence checks
-- are performed inside DO blocks.

begin;

do $$
begin
  if to_regprocedure('public.enforce_workspace_paywall()') is not null then
    execute 'alter function public.enforce_workspace_paywall() volatile';
  end if;
end
$$;

do $$
declare
  target record;
begin
  for target in
    select distinct p.oid::regprocedure as function_signature
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname in (
        'access_codes',
        'access_code_redemptions',
        'workspace_subscriptions'
      )
  loop
    execute format('alter function %s volatile', target.function_signature);
  end loop;
end
$$;

commit;

select
  c.relname as table_name,
  t.tgname as trigger_name,
  p.oid::regprocedure as function_name,
  case p.provolatile
    when 'v' then 'volatile'
    when 's' then 'stable'
    when 'i' then 'immutable'
  end as volatility
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in (
    'access_codes',
    'access_code_redemptions',
    'workspace_subscriptions'
  )
order by c.relname, t.tgname;
