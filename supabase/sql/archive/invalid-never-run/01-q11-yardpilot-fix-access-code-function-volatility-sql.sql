-- YardPilot access-code volatility fix
-- Safe forward-only patch. Deletes no data.

begin;

-- Trigger functions that run during writes must be VOLATILE.
alter function if exists public.enforce_workspace_paywall() volatile;

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
    execute format(
      'alter function %s volatile',
      target.function_signature
    );
  end loop;
end
$$;

commit;

-- Diagnostic output: all trigger functions on the three billing/code tables
-- should now show volatility = volatile.
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
