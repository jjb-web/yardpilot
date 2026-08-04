-- YardPilot major upgrade: client-ready estimates, linked properties,
-- property photos, secure public sharing, and safe upgrades from the
-- project's earlier SQL queries.
-- Run once in Supabase -> SQL Editor before deploying the new React files.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Repair/upgrade the existing projects table.
-- ---------------------------------------------------------------------------

alter table public.projects
  alter column estimate_summary drop not null;

alter table public.projects
  add column if not exists contact_id text,
  add column if not exists property_id text,
  add column if not exists estimate_status text,
  add column if not exists estimate_number text,
  add column if not exists issue_date date,
  add column if not exists valid_until date,
  add column if not exists scope_description text,
  add column if not exists client_notes text,
  add column if not exists terms text,
  add column if not exists tax_rate numeric,
  add column if not exists discount_amount numeric,
  add column if not exists share_token uuid,
  add column if not exists share_enabled boolean;

update public.projects
set
  estimate_status = coalesce(estimate_status, 'draft'),
  estimate_number = coalesce(
    nullif(estimate_number, ''),
    'EST-' || upper(substr(replace(id, '-', ''), 1, 10))
  ),
  issue_date = coalesce(issue_date, created_at::date, current_date),
  valid_until = coalesce(valid_until, (coalesce(issue_date, created_at::date, current_date) + 30)),
  scope_description = coalesce(scope_description, ''),
  client_notes = coalesce(client_notes, ''),
  terms = coalesce(terms, ''),
  tax_rate = coalesce(tax_rate, 0),
  discount_amount = coalesce(discount_amount, 0),
  share_token = coalesce(share_token, gen_random_uuid()),
  share_enabled = coalesce(share_enabled, false);

alter table public.projects
  alter column estimate_status set default 'draft',
  alter column estimate_status set not null,
  alter column estimate_number set not null,
  alter column issue_date set default current_date,
  alter column issue_date set not null,
  alter column scope_description set default '',
  alter column scope_description set not null,
  alter column client_notes set default '',
  alter column client_notes set not null,
  alter column terms set default '',
  alter column terms set not null,
  alter column tax_rate set default 0,
  alter column tax_rate set not null,
  alter column discount_amount set default 0,
  alter column discount_amount set not null,
  alter column share_token set default gen_random_uuid(),
  alter column share_token set not null,
  alter column share_enabled set default false,
  alter column share_enabled set not null;

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('active', 'completed', 'archived'));

alter table public.projects
  drop constraint if exists projects_estimate_status_check;

alter table public.projects
  add constraint projects_estimate_status_check
  check (estimate_status in ('draft', 'sent', 'accepted', 'declined'));

alter table public.projects
  drop constraint if exists projects_tax_rate_check;

alter table public.projects
  add constraint projects_tax_rate_check
  check (tax_rate >= 0 and tax_rate <= 100);

alter table public.projects
  drop constraint if exists projects_discount_amount_check;

alter table public.projects
  add constraint projects_discount_amount_check
  check (discount_amount >= 0);

create unique index if not exists projects_user_estimate_number_idx
  on public.projects(user_id, estimate_number);

create unique index if not exists projects_share_token_idx
  on public.projects(share_token);

create index if not exists projects_contact_id_idx
  on public.projects(contact_id);

create index if not exists projects_property_id_idx
  on public.projects(property_id);

-- ---------------------------------------------------------------------------
-- 2. Properties linked to contacts.
-- ---------------------------------------------------------------------------

create table if not exists public.properties (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id text not null references public.contacts(id) on delete cascade,
  name text not null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  description text not null default '',
  internal_notes text not null default '',
  client_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists properties_user_id_idx
  on public.properties(user_id);

create index if not exists properties_contact_id_idx
  on public.properties(contact_id, updated_at desc);

alter table public.properties enable row level security;

grant select, insert, update, delete on public.properties to authenticated;

drop policy if exists "Users can view their own properties" on public.properties;
create policy "Users can view their own properties"
on public.properties for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own properties" on public.properties;
create policy "Users can create their own properties"
on public.properties for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their own properties" on public.properties;
create policy "Users can update their own properties"
on public.properties for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their own properties" on public.properties;
create policy "Users can delete their own properties"
on public.properties for delete to authenticated
using ((select auth.uid()) = user_id);

-- Add project foreign keys only after properties exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_contact_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_contact_id_fkey
      foreign key (contact_id)
      references public.contacts(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_property_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_property_id_fkey
      foreign key (property_id)
      references public.properties(id)
      on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Property photo records and private Supabase Storage bucket.
-- ---------------------------------------------------------------------------

create table if not exists public.property_photos (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists property_photos_user_id_idx
  on public.property_photos(user_id);

create index if not exists property_photos_property_id_idx
  on public.property_photos(property_id, created_at);

alter table public.property_photos enable row level security;

grant select, insert, update, delete on public.property_photos to authenticated;

drop policy if exists "Users can view their own property photos" on public.property_photos;
create policy "Users can view their own property photos"
on public.property_photos for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own property photos" on public.property_photos;
create policy "Users can create their own property photos"
on public.property_photos for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.properties p
    where p.id = property_id and p.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their own property photos" on public.property_photos;
create policy "Users can update their own property photos"
on public.property_photos for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own property photos" on public.property_photos;
create policy "Users can delete their own property photos"
on public.property_photos for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-photos',
  'property-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The object path begins with the owning user UUID:
-- user-id/property-id/photo-id.jpg

drop policy if exists "Users can read their own property photo objects" on storage.objects;
create policy "Users can read their own property photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload their own property photo objects" on storage.objects;
create policy "Users can upload their own property photo objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their own property photo objects" on storage.objects;
create policy "Users can update their own property photo objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own property photo objects" on storage.objects;
create policy "Users can delete their own property photo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- 4. Public estimate sharing through an unguessable UUID token.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_shared_property_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_photos ph
    join public.projects p on p.property_id = ph.property_id
    where ph.storage_path = object_name
      and p.share_enabled = true
      and p.share_token is not null
  );
$$;

revoke all on function public.can_view_shared_property_photo(text) from public;
grant execute on function public.can_view_shared_property_photo(text) to anon, authenticated;

drop policy if exists "Public can read photos used by shared estimates" on storage.objects;
create policy "Public can read photos used by shared estimates"
on storage.objects for select to anon
using (
  bucket_id = 'property-photos'
  and public.can_view_shared_property_photo(name)
);

create or replace function public.get_public_estimate(requested_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'client', p.client,
      'address', p.address,
      'contact_id', p.contact_id,
      'property_id', p.property_id,
      'status', p.status,
      'estimate_status', p.estimate_status,
      'estimate_number', p.estimate_number,
      'issue_date', p.issue_date,
      'valid_until', p.valid_until,
      'project_type', p.project_type,
      'square_footage', p.square_footage,
      'labor_rate', p.labor_rate,
      'labor_hours', p.labor_hours,
      'line_items', p.line_items,
      'estimate_summary', p.estimate_summary,
      'scope_description', p.scope_description,
      'client_notes', p.client_notes,
      'terms', p.terms,
      'tax_rate', p.tax_rate,
      'discount_amount', p.discount_amount,
      'total_estimate', p.total_estimate,
      'share_token', p.share_token,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    ),
    'company', jsonb_build_object(
      'full_name', prof.full_name,
      'email', prof.email,
      'phone', prof.phone,
      'company', prof.company
    ),
    'contact', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email,
        'phone', c.phone,
        'address', c.address,
        'city', c.city,
        'state', c.state,
        'zip', c.zip
      )
    end,
    'property', case
      when prop.id is null then null
      else jsonb_build_object(
        'id', prop.id,
        'contact_id', prop.contact_id,
        'name', prop.name,
        'address', prop.address,
        'city', prop.city,
        'state', prop.state,
        'zip', prop.zip,
        'description', prop.description,
        'client_notes', prop.client_notes
      )
    end,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ph.id,
            'property_id', ph.property_id,
            'storage_path', ph.storage_path,
            'caption', ph.caption,
            'created_at', ph.created_at
          )
          order by ph.created_at
        )
        from public.property_photos ph
        where ph.property_id = p.property_id
      ),
      '[]'::jsonb
    )
  )
  from public.projects p
  left join public.profiles prof on prof.id = p.user_id
  left join public.contacts c on c.id = p.contact_id
  left join public.properties prop on prop.id = p.property_id
  where p.share_token = requested_token
    and p.share_enabled = true
  limit 1;
$$;

revoke all on function public.get_public_estimate(uuid) from public;
grant execute on function public.get_public_estimate(uuid) to anon, authenticated;
