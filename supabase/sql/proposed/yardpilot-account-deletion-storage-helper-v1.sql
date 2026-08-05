-- YardPilot account-deletion Storage helper v1
-- Forward-only and data-safe. This function only LISTS Storage metadata.
-- Actual object deletion continues to use the Supabase Storage API.

begin;

create or replace function public.yardpilot_list_owned_storage_objects(
  requested_user_id uuid
)
returns table (
  bucket_id text,
  object_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    objects.bucket_id,
    objects.name
  from storage.objects as objects
  where objects.owner_id = requested_user_id::text
  order by objects.bucket_id, objects.name;
$$;

revoke all
on function public.yardpilot_list_owned_storage_objects(uuid)
from public, anon, authenticated;

grant execute
on function public.yardpilot_list_owned_storage_objects(uuid)
to service_role;

commit;

select
  to_regprocedure(
    'public.yardpilot_list_owned_storage_objects(uuid)'
  ) as installed_function;
