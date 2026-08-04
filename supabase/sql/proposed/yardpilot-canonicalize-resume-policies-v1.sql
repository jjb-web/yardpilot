-- YardPilot resume-storage policy canonicalization v1
-- DATA-SAFE: changes policy names/definitions only; it does not delete files or rows.
-- Run only after yardpilot-live-object-audit-v1.sql confirms the marketplace
-- tables and marketplace_can_manage_workspace(uuid) function exist.

begin;

-- Remove both historical naming variants so the final state is unambiguous.
drop policy if exists marketplace_resumes_insert_own on storage.objects;
drop policy if exists marketplace_resumes_select_authorized on storage.objects;
drop policy if exists marketplace_resumes_update_own on storage.objects;
drop policy if exists marketplace_resumes_delete_own on storage.objects;

drop policy if exists marketplace_resume_insert_own on storage.objects;
drop policy if exists marketplace_resume_select_authorized on storage.objects;
drop policy if exists marketplace_resume_update_own on storage.objects;
drop policy if exists marketplace_resume_delete_own on storage.objects;

create policy marketplace_resume_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy marketplace_resume_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.marketplace_job_applications a
      where a.resume_path = storage.objects.name
        and public.marketplace_can_manage_workspace(a.workspace_id)
    )
  )
);

create policy marketplace_resume_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy marketplace_resume_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'marketplace_resume%'
order by policyname;
