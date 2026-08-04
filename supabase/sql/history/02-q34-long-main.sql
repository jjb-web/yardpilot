-- YardPilot projects/estimates table.
-- Run this once in Supabase -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  name text not null,
  client text not null default '',
  address text not null default '',
  status text not null default 'active',
  project_type text not null default '',
  square_footage numeric not null default 0,
  labor_rate numeric not null default 0,
  labor_hours numeric not null default 0,
  line_items jsonb not null default '[]'::jsonb,
  estimate_summary text,
  total_estimate numeric not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx
  on public.projects(user_id);

create index if not exists projects_user_updated_idx
  on public.projects(user_id, updated_at desc);

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (
    status in (
      'active',
      'completed',
      'archived'
    )
  );

alter table public.projects
  enable row level security;

grant select, insert, update, delete
  on public.projects
  to authenticated;

drop policy if exists
  "Users can view their own projects"
  on public.projects;

create policy
  "Users can view their own projects"
on public.projects
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can create their own projects"
  on public.projects;

create policy
  "Users can create their own projects"
on public.projects
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can update their own projects"
  on public.projects;

create policy
  "Users can update their own projects"
on public.projects
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can delete their own projects"
  on public.projects;

create policy
  "Users can delete their own projects"
on public.projects
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);
