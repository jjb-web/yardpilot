-- Run in Supabase -> SQL Editor.
-- This safely upgrades existing Contacts data and also works if the table
-- has not been created yet.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  contact_type text not null default 'lead',
  activity_status text not null default 'active',
  source text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing installations used one combined `status` column. Add the two
-- replacement columns as nullable first so old rows can be converted.
alter table public.contacts
  add column if not exists contact_type text;

alter table public.contacts
  add column if not exists activity_status text;

-- Convert old values only for rows that have not already been migrated.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name = 'status'
  ) then
    update public.contacts
    set
      contact_type = coalesce(
        contact_type,
        case
          when status = 'customer' then 'customer'
          else 'lead'
        end
      ),
      activity_status = coalesce(
        activity_status,
        case
          when status = 'inactive' then 'inactive'
          else 'active'
        end
      )
    where contact_type is null
       or activity_status is null;
  end if;
end
$$;

update public.contacts
set contact_type = 'lead'
where contact_type is null;

update public.contacts
set activity_status = 'active'
where activity_status is null;

alter table public.contacts
  alter column contact_type set default 'lead',
  alter column contact_type set not null,
  alter column activity_status set default 'active',
  alter column activity_status set not null;

alter table public.contacts
  drop constraint if exists contacts_contact_type_check;

alter table public.contacts
  add constraint contacts_contact_type_check
  check (contact_type in ('lead', 'customer'));

alter table public.contacts
  drop constraint if exists contacts_activity_status_check;

alter table public.contacts
  add constraint contacts_activity_status_check
  check (activity_status in ('active', 'inactive'));

create index if not exists contacts_user_id_idx
  on public.contacts(user_id);

create index if not exists contacts_user_activity_idx
  on public.contacts(user_id, activity_status, updated_at desc);

create index if not exists contacts_user_type_idx
  on public.contacts(user_id, contact_type, updated_at desc);

alter table public.contacts
  enable row level security;

grant select, insert, update, delete
  on public.contacts
  to authenticated;

drop policy if exists
  "Users can view their own contacts"
  on public.contacts;

create policy
  "Users can view their own contacts"
on public.contacts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists
  "Users can create their own contacts"
  on public.contacts;

create policy
  "Users can create their own contacts"
on public.contacts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists
  "Users can update their own contacts"
  on public.contacts;

create policy
  "Users can update their own contacts"
on public.contacts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists
  "Users can delete their own contacts"
  on public.contacts;

create policy
  "Users can delete their own contacts"
on public.contacts
for delete
to authenticated
using ((select auth.uid()) = user_id);
