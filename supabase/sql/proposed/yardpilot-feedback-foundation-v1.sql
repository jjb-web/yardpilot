-- YardPilot feedback foundation v1
-- Forward-only and idempotent. Creates the missing feedback table and policies.
-- No existing customer, estimate, invoice, marketplace, or payment rows are deleted.

begin;

create extension if not exists pgcrypto;

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  account_type text not null default 'landscaper',
  category text not null default 'feedback',
  rating integer,
  title text not null default '',
  message text not null,
  allow_public boolean not null default false,
  allow_contact boolean not null default true,
  status text not null default 'new',
  route text not null default '',
  app_version text not null default '',
  browser_summary text not null default '',
  delivery_status text not null default 'pending',
  delivery_error text not null default '',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bring a partially existing table up to the current shape.
alter table public.feedback_submissions
  add column if not exists allow_contact boolean not null default true,
  add column if not exists route text not null default '',
  add column if not exists app_version text not null default '',
  add column if not exists browser_summary text not null default '',
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivery_error text not null default '',
  add column if not exists delivered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.feedback_submissions
  drop constraint if exists feedback_submissions_account_type_check,
  drop constraint if exists feedback_submissions_category_check,
  drop constraint if exists feedback_submissions_rating_check,
  drop constraint if exists feedback_submissions_status_check,
  drop constraint if exists feedback_submissions_delivery_status_check;

alter table public.feedback_submissions
  add constraint feedback_submissions_account_type_check
    check (account_type in ('landscaper', 'client')),
  add constraint feedback_submissions_category_check
    check (category in ('feedback', 'review', 'bug', 'feature')),
  add constraint feedback_submissions_rating_check
    check (rating is null or rating between 1 and 5),
  add constraint feedback_submissions_status_check
    check (status in ('new', 'reviewed', 'planned', 'resolved', 'rejected')),
  add constraint feedback_submissions_delivery_status_check
    check (delivery_status in ('pending', 'delivered', 'failed', 'not_configured'));

create index if not exists feedback_submissions_user_created_idx
  on public.feedback_submissions(user_id, created_at desc);

create index if not exists feedback_submissions_status_created_idx
  on public.feedback_submissions(status, created_at desc);

alter table public.feedback_submissions enable row level security;
revoke all on public.feedback_submissions from anon, authenticated;
grant select, insert on public.feedback_submissions to authenticated;
grant all on public.feedback_submissions to service_role;

drop policy if exists feedback_select_own_or_admin on public.feedback_submissions;
create policy feedback_select_own_or_admin
on public.feedback_submissions
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
);

drop policy if exists feedback_insert_own on public.feedback_submissions;
create policy feedback_insert_own
on public.feedback_submissions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    workspace_id is null
    or exists (
      select 1
      from public.workspace_memberships wm
      where wm.workspace_id = feedback_submissions.workspace_id
        and wm.user_id = auth.uid()
    )
  )
);

create or replace function public.yardpilot_feedback_touch_updated_at()
returns trigger
language plpgsql
volatile
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.yardpilot_validate_feedback_submission()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  allowed boolean := true;
begin
  new.title := left(trim(coalesce(new.title, '')), 160);
  new.message := trim(coalesce(new.message, ''));
  new.route := left(trim(coalesce(new.route, '')), 500);
  new.app_version := left(trim(coalesce(new.app_version, '')), 100);
  new.browser_summary := left(trim(coalesce(new.browser_summary, '')), 700);

  if char_length(new.message) < 3 or char_length(new.message) > 5000 then
    raise exception 'Feedback message must be between 3 and 5,000 characters.';
  end if;

  if new.category = 'review' and new.rating is null then
    raise exception 'A product review requires a rating.';
  end if;

  if new.category <> 'review' then
    new.rating := null;
    new.allow_public := false;
  end if;

  if to_regprocedure('public.yardpilot_text_is_allowed(text)') is not null then
    execute 'select public.yardpilot_text_is_allowed($1)'
      into allowed
      using concat_ws(' ', new.title, new.message);

    if not coalesce(allowed, false) then
      raise exception 'The feedback contains text that is not allowed.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.yardpilot_feedback_touch_updated_at() from public;
revoke all on function public.yardpilot_validate_feedback_submission() from public;

drop trigger if exists feedback_touch_updated_at on public.feedback_submissions;
create trigger feedback_touch_updated_at
before update on public.feedback_submissions
for each row execute function public.yardpilot_feedback_touch_updated_at();

drop trigger if exists feedback_validate_text on public.feedback_submissions;
create trigger feedback_validate_text
before insert or update on public.feedback_submissions
for each row execute function public.yardpilot_validate_feedback_submission();

commit;

select
  to_regclass('public.feedback_submissions') as feedback_table,
  count(*) as current_rows
from public.feedback_submissions;
