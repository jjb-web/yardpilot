-- YardPilotUSA visible-default branding update v1
-- Optional, narrowly scoped data update.
-- This does not rename internal database functions, tables, columns, policies,
-- storage paths, localStorage keys, or user-created companies.

begin;

do $$
begin
  if to_regclass('public.workspaces') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'workspaces'
         and column_name = 'name'
     )
  then
    update public.workspaces
    set name = 'YardPilotUSA Workspace'
    where name = 'YardPilot Workspace';
  end if;
end
$$;

commit;

select
  case
    when to_regclass('public.workspaces') is null then 0
    else (
      select count(*)
      from public.workspaces
      where name = 'YardPilotUSA Workspace'
    )
  end as yardpilotusa_default_workspaces;
