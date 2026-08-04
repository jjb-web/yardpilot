-- YardPilot launch readiness v1
-- Forward-only, data-preserving migration.
-- Adds marketplace cancellation, participant messaging, verified-project reviews,
-- moderation/admin RPCs, support-email delivery status, and safer text coverage.
-- Run only after yardpilot-launch-hardening-v1.sql has completed successfully.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Support delivery observability
-- ---------------------------------------------------------------------------

alter table public.support_messages
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivery_error text not null default '',
  add column if not exists delivered_at timestamptz;

alter table public.support_messages
  drop constraint if exists support_messages_delivery_status_check;
alter table public.support_messages
  add constraint support_messages_delivery_status_check
  check (delivery_status in ('pending', 'delivered', 'failed', 'not_configured'));

-- ---------------------------------------------------------------------------
-- 2. Marketplace lifecycle and cancellation state
-- ---------------------------------------------------------------------------

alter table public.client_job_bids
  drop constraint if exists client_job_bids_status_check;
alter table public.client_job_bids
  add constraint client_job_bids_status_check
  check (status in (
    'submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn',
    'cancelled_by_client', 'cancelled_by_business'
  ));

alter table public.marketplace_work_orders
  add column if not exists status_before_cancellation text,
  add column if not exists cancellation_status text not null default 'none',
  add column if not exists cancellation_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_reason text not null default '',
  add column if not exists cancellation_responded_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_responded_at timestamptz,
  add column if not exists cancellation_response_notes text not null default '';

alter table public.marketplace_work_orders
  drop constraint if exists marketplace_work_orders_status_check;
alter table public.marketplace_work_orders
  add constraint marketplace_work_orders_status_check
  check (status in (
    'accepted', 'awaiting_estimate', 'estimate_created', 'estimate_sent',
    'estimate_accepted', 'scheduled', 'in_progress', 'invoiced', 'paid',
    'completed', 'cancelled', 'disputed'
  ));

alter table public.marketplace_work_orders
  drop constraint if exists marketplace_work_orders_cancellation_status_check;
alter table public.marketplace_work_orders
  add constraint marketplace_work_orders_cancellation_status_check
  check (cancellation_status in ('none', 'requested', 'approved', 'rejected'));

create index if not exists marketplace_work_orders_cancellation_idx
on public.marketplace_work_orders(cancellation_status, updated_at desc);

-- ---------------------------------------------------------------------------
-- 3. Participant-only marketplace messages
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.marketplace_work_orders(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (char_length(body) between 1 and 3000)
);

create index if not exists marketplace_messages_work_order_idx
on public.marketplace_messages(work_order_id, created_at);

alter table public.marketplace_messages enable row level security;
revoke all on public.marketplace_messages from anon, authenticated;
grant select on public.marketplace_messages to authenticated;
grant all on public.marketplace_messages to service_role;

drop policy if exists marketplace_messages_select_participants on public.marketplace_messages;
create policy marketplace_messages_select_participants
on public.marketplace_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.marketplace_work_orders wo
    where wo.id = marketplace_messages.work_order_id
      and (
        wo.client_user_id = auth.uid()
        or public.marketplace_can_manage_workspace(wo.workspace_id)
      )
  )
);

create or replace function public.send_marketplace_message(
  requested_work_order_id uuid,
  requested_body text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  work_order_row public.marketplace_work_orders%rowtype;
  message_id uuid;
  cleaned text := trim(coalesce(requested_body, ''));
  recipient_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if char_length(cleaned) < 1 or char_length(cleaned) > 3000 then
    raise exception 'Messages must be between 1 and 3,000 characters.';
  end if;
  if not public.yardpilot_text_is_allowed(cleaned) then
    raise exception 'Message contains language that is not allowed.';
  end if;

  select * into work_order_row
  from public.marketplace_work_orders
  where id = requested_work_order_id;

  if work_order_row.id is null then raise exception 'Marketplace project not found.'; end if;
  if work_order_row.client_user_id <> auth.uid()
     and not public.marketplace_can_manage_workspace(work_order_row.workspace_id) then
    raise exception 'You do not have access to this marketplace conversation.';
  end if;

  insert into public.marketplace_messages(work_order_id, sender_user_id, body)
  values (requested_work_order_id, auth.uid(), cleaned)
  returning id into message_id;

  if work_order_row.client_user_id = auth.uid() then
    perform public.yardpilot_notify_workspace_managers(
      work_order_row.workspace_id,
      'marketplace_message',
      'New client message',
      left(cleaned, 240),
      '/app/marketplace/' || work_order_row.id::text || '/messages',
      jsonb_build_object('workOrderId', work_order_row.id, 'messageId', message_id)
    );
  else
    recipient_id := work_order_row.client_user_id;
    perform public.yardpilot_notify_user(
      recipient_id,
      work_order_row.workspace_id,
      'marketplace_message',
      'New company message',
      left(cleaned, 240),
      '/client/projects/' || work_order_row.id::text || '/messages',
      jsonb_build_object('workOrderId', work_order_row.id, 'messageId', message_id)
    );
  end if;

  return message_id;
end;
$$;

revoke all on function public.send_marketplace_message(uuid,text) from public;
grant execute on function public.send_marketplace_message(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cancellation request/response workflow
-- ---------------------------------------------------------------------------

create or replace function public.request_marketplace_cancellation(
  requested_work_order_id uuid,
  requested_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  wo public.marketplace_work_orders%rowtype;
  project_status text;
  requester_kind text;
  auto_cancel boolean := false;
  cleaned_reason text := left(trim(coalesce(requested_reason, '')), 2000);
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if char_length(cleaned_reason) < 5 then raise exception 'Enter a cancellation reason.'; end if;
  if not public.yardpilot_text_is_allowed(cleaned_reason) then
    raise exception 'Cancellation reason contains language that is not allowed.';
  end if;

  select * into wo from public.marketplace_work_orders
  where id = requested_work_order_id for update;
  if wo.id is null then raise exception 'Marketplace project not found.'; end if;
  if wo.status in ('cancelled', 'completed') then raise exception 'This project can no longer be cancelled here.'; end if;
  if wo.cancellation_status = 'requested' then raise exception 'A cancellation request is already pending.'; end if;

  if wo.client_user_id = auth.uid() then
    requester_kind := 'client';
  elsif public.marketplace_can_manage_workspace(wo.workspace_id) then
    requester_kind := 'business';
  else
    raise exception 'You do not have access to cancel this marketplace project.';
  end if;

  if wo.project_id is not null then
    select p.estimate_status::text into project_status
    from public.projects p where p.id::text = wo.project_id;
  end if;

  auto_cancel := coalesce(project_status, 'draft') <> 'accepted'
    and wo.status not in ('invoiced', 'paid', 'completed', 'in_progress');

  update public.marketplace_work_orders
  set status_before_cancellation = status,
      cancellation_status = case when auto_cancel then 'approved' else 'requested' end,
      cancellation_requested_by = auth.uid(),
      cancellation_requested_at = now(),
      cancellation_reason = cleaned_reason,
      cancellation_responded_by = case when auto_cancel then auth.uid() else null end,
      cancellation_responded_at = case when auto_cancel then now() else null end,
      cancellation_response_notes = case when auto_cancel then 'Automatically cancelled before customer acceptance.' else '' end,
      status = case when auto_cancel then 'cancelled' else 'disputed' end,
      updated_at = now()
  where id = wo.id;

  if auto_cancel then
    update public.client_job_requests
    set status = 'cancelled', updated_at = now()
    where id = wo.request_id;

    update public.client_job_bids
    set status = case when requester_kind = 'client' then 'cancelled_by_client' else 'cancelled_by_business' end,
        updated_at = now()
    where id = wo.bid_id;
  end if;

  if requester_kind = 'client' then
    perform public.yardpilot_notify_workspace_managers(
      wo.workspace_id,
      'marketplace_cancellation',
      case when auto_cancel then 'Marketplace project cancelled' else 'Cancellation requested' end,
      cleaned_reason,
      '/app/marketplace/' || wo.id::text || '/messages',
      jsonb_build_object('workOrderId', wo.id, 'autoCancelled', auto_cancel)
    );
  else
    perform public.yardpilot_notify_user(
      wo.client_user_id,
      wo.workspace_id,
      'marketplace_cancellation',
      case when auto_cancel then 'Marketplace project cancelled' else 'Cancellation requested' end,
      cleaned_reason,
      '/client/projects/' || wo.id::text || '/messages',
      jsonb_build_object('workOrderId', wo.id, 'autoCancelled', auto_cancel)
    );
  end if;

  return jsonb_build_object(
    'workOrderId', wo.id,
    'cancelled', auto_cancel,
    'cancellationStatus', case when auto_cancel then 'approved' else 'requested' end
  );
end;
$$;

create or replace function public.respond_marketplace_cancellation(
  requested_work_order_id uuid,
  requested_approve boolean,
  requested_notes text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  wo public.marketplace_work_orders%rowtype;
  requester_is_client boolean;
  responder_is_client boolean;
  cleaned_notes text := left(trim(coalesce(requested_notes, '')), 2000);
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.yardpilot_text_is_allowed(cleaned_notes) then
    raise exception 'Response notes contain language that is not allowed.';
  end if;

  select * into wo from public.marketplace_work_orders
  where id = requested_work_order_id for update;
  if wo.id is null then raise exception 'Marketplace project not found.'; end if;
  if wo.cancellation_status <> 'requested' then raise exception 'There is no pending cancellation request.'; end if;

  requester_is_client := wo.cancellation_requested_by = wo.client_user_id;
  responder_is_client := wo.client_user_id = auth.uid();

  if responder_is_client = requester_is_client then
    raise exception 'The other party must respond to this cancellation request.';
  end if;
  if not responder_is_client and not public.marketplace_can_manage_workspace(wo.workspace_id) then
    raise exception 'You do not have access to respond to this request.';
  end if;

  update public.marketplace_work_orders
  set cancellation_status = case when requested_approve then 'approved' else 'rejected' end,
      cancellation_responded_by = auth.uid(),
      cancellation_responded_at = now(),
      cancellation_response_notes = cleaned_notes,
      status = case
        when requested_approve then 'cancelled'
        else coalesce(status_before_cancellation, 'accepted')
      end,
      updated_at = now()
  where id = wo.id;

  if requested_approve then
    update public.client_job_requests set status = 'cancelled', updated_at = now() where id = wo.request_id;
    update public.client_job_bids
    set status = case when requester_is_client then 'cancelled_by_client' else 'cancelled_by_business' end,
        updated_at = now()
    where id = wo.bid_id;
  end if;

  if responder_is_client then
    perform public.yardpilot_notify_workspace_managers(
      wo.workspace_id,
      'marketplace_cancellation',
      case when requested_approve then 'Cancellation approved' else 'Cancellation declined' end,
      cleaned_notes,
      '/app/marketplace/' || wo.id::text || '/messages',
      jsonb_build_object('workOrderId', wo.id, 'approved', requested_approve)
    );
  else
    perform public.yardpilot_notify_user(
      wo.client_user_id,
      wo.workspace_id,
      'marketplace_cancellation',
      case when requested_approve then 'Cancellation approved' else 'Cancellation declined' end,
      cleaned_notes,
      '/client/projects/' || wo.id::text || '/messages',
      jsonb_build_object('workOrderId', wo.id, 'approved', requested_approve)
    );
  end if;

  return jsonb_build_object('workOrderId', wo.id, 'approved', requested_approve);
end;
$$;

revoke all on function public.request_marketplace_cancellation(uuid,text) from public;
revoke all on function public.respond_marketplace_cancellation(uuid,boolean,text) from public;
grant execute on function public.request_marketplace_cancellation(uuid,text) to authenticated;
grant execute on function public.respond_marketplace_cancellation(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verified-project public reviews
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null unique references public.marketplace_work_orders(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text not null default '',
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  business_response text not null default '',
  business_responded_at timestamptz,
  moderation_notes text not null default '',
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(title) <= 160),
  check (char_length(body) between 10 and 3000),
  check (char_length(business_response) <= 2000)
);

create index if not exists marketplace_reviews_public_idx
on public.marketplace_reviews(workspace_id, status, created_at desc);

alter table public.marketplace_reviews enable row level security;
revoke all on public.marketplace_reviews from anon, authenticated;
grant all on public.marketplace_reviews to service_role;

drop policy if exists marketplace_reviews_public_read on public.marketplace_reviews;
create policy marketplace_reviews_public_read
on public.marketplace_reviews
for select
to anon, authenticated
using (
  status = 'published'
  or reviewer_user_id = auth.uid()
  or public.marketplace_can_manage_workspace(workspace_id)
  or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
);

drop trigger if exists marketplace_reviews_touch_updated_at on public.marketplace_reviews;
create trigger marketplace_reviews_touch_updated_at
before update on public.marketplace_reviews
for each row execute function public.marketplace_touch_updated_at();

create or replace function public.submit_marketplace_review(
  requested_work_order_id uuid,
  requested_rating integer,
  requested_title text,
  requested_body text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  wo public.marketplace_work_orders%rowtype;
  review_id uuid;
  cleaned_title text := left(trim(coalesce(requested_title, '')), 160);
  cleaned_body text := trim(coalesce(requested_body, ''));
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if requested_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
  if char_length(cleaned_body) < 10 or char_length(cleaned_body) > 3000 then
    raise exception 'Review must be between 10 and 3,000 characters.';
  end if;
  if not public.yardpilot_text_is_allowed(concat_ws(' ', cleaned_title, cleaned_body)) then
    raise exception 'Review contains language that is not allowed.';
  end if;

  select * into wo from public.marketplace_work_orders where id = requested_work_order_id;
  if wo.id is null then raise exception 'Marketplace project not found.'; end if;
  if wo.client_user_id <> auth.uid() then raise exception 'Only the client may review this project.'; end if;
  if wo.status not in ('paid', 'completed') then
    raise exception 'A review can be submitted after the project is paid or completed.';
  end if;

  insert into public.marketplace_reviews(
    work_order_id, workspace_id, reviewer_user_id, rating, title, body, status
  ) values (
    wo.id, wo.workspace_id, auth.uid(), requested_rating, cleaned_title, cleaned_body, 'pending'
  )
  on conflict (work_order_id) do update set
    rating = excluded.rating,
    title = excluded.title,
    body = excluded.body,
    status = 'pending',
    moderation_notes = '',
    moderated_by = null,
    moderated_at = null,
    updated_at = now()
  returning id into review_id;

  perform public.yardpilot_notify_workspace_managers(
    wo.workspace_id,
    'marketplace_review',
    'New verified-project review',
    'A client submitted a review. It will appear publicly after moderation.',
    '/app/marketplace?tab=company',
    jsonb_build_object('workOrderId', wo.id, 'reviewId', review_id)
  );

  return review_id;
end;
$$;

create or replace function public.respond_to_marketplace_review(
  requested_review_id uuid,
  requested_response text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  review_row public.marketplace_reviews%rowtype;
  cleaned text := left(trim(coalesce(requested_response, '')), 2000);
begin
  select * into review_row from public.marketplace_reviews where id = requested_review_id for update;
  if review_row.id is null then raise exception 'Review not found.'; end if;
  if not public.marketplace_can_manage_workspace(review_row.workspace_id) then
    raise exception 'Only a workspace owner or manager may respond.';
  end if;
  if review_row.status <> 'published' then raise exception 'Only published reviews may receive a public response.'; end if;
  if char_length(cleaned) < 2 then raise exception 'Enter a response.'; end if;
  if not public.yardpilot_text_is_allowed(cleaned) then raise exception 'Response contains language that is not allowed.'; end if;

  update public.marketplace_reviews
  set business_response = cleaned, business_responded_at = now(), updated_at = now()
  where id = review_row.id;
end;
$$;

create or replace function public.get_public_marketplace_reviews(requested_workspace_id uuid)
returns table (
  id uuid,
  rating integer,
  title text,
  body text,
  business_response text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.rating, r.title, r.body, r.business_response, r.created_at
  from public.marketplace_reviews r
  where r.workspace_id = requested_workspace_id and r.status = 'published'
  order by r.created_at desc
  limit 100;
$$;

revoke all on function public.submit_marketplace_review(uuid,integer,text,text) from public;
revoke all on function public.respond_to_marketplace_review(uuid,text) from public;
revoke all on function public.get_public_marketplace_reviews(uuid) from public;
grant execute on function public.submit_marketplace_review(uuid,integer,text,text) to authenticated;
grant execute on function public.respond_to_marketplace_review(uuid,text) to authenticated;
grant execute on function public.get_public_marketplace_reviews(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Participant detail RPC used by client/company pages and messaging
-- ---------------------------------------------------------------------------

create or replace function public.get_marketplace_work_order_detail(requested_work_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;

  select jsonb_build_object(
    'workOrderId', wo.id,
    'requestId', wo.request_id,
    'requestTitle', r.title,
    'requestDescription', r.description,
    'workStatus', wo.status,
    'workspaceId', wo.workspace_id,
    'clientUserId', wo.client_user_id,
    'clientName', r.client_name,
    'businessName', coalesce(bp.display_name, w.name),
    'businessHeadline', coalesce(bp.headline, ''),
    'publicEmail', coalesce(bp.public_email, ''),
    'publicPhone', coalesce(bp.public_phone, ''),
    'websiteUrl', coalesce(bp.website_url, ''),
    'verificationStatus', coalesce(bp.verification_status, 'unverified'),
    'verifiedAt', bp.verified_at,
    'cancellationStatus', wo.cancellation_status,
    'cancellationRequestedBy', wo.cancellation_requested_by,
    'cancellationReason', wo.cancellation_reason,
    'cancellationRequestedAt', wo.cancellation_requested_at,
    'cancellationResponseNotes', wo.cancellation_response_notes,
    'projectId', wo.project_id,
    'invoiceId', wo.invoice_id
  ) into result
  from public.marketplace_work_orders wo
  join public.client_job_requests r on r.id = wo.request_id
  join public.workspaces w on w.id = wo.workspace_id
  left join public.marketplace_business_profiles bp on bp.workspace_id = wo.workspace_id
  where wo.id = requested_work_order_id
    and (
      wo.client_user_id = auth.uid()
      or public.marketplace_can_manage_workspace(wo.workspace_id)
    );

  if result is null then raise exception 'Marketplace project not found.'; end if;
  return result;
end;
$$;

revoke all on function public.get_marketplace_work_order_detail(uuid) from public;
grant execute on function public.get_marketplace_work_order_detail(uuid) to authenticated;

-- Replace the client work-order RPC with company profile, cancellation, and review data.
drop function if exists public.get_my_marketplace_work_orders();
create function public.get_my_marketplace_work_orders()
returns table (
  work_order_id uuid,
  request_id uuid,
  request_title text,
  workspace_id uuid,
  business_name text,
  business_headline text,
  public_email text,
  public_phone text,
  website_url text,
  verification_status text,
  verified_at timestamptz,
  average_rating numeric,
  review_count bigint,
  bid_amount numeric,
  work_status text,
  cancellation_status text,
  cancellation_requested_by uuid,
  cancellation_reason text,
  project_id text,
  invoice_id text,
  invoice_number text,
  invoice_amount numeric,
  invoice_payment_status text,
  invoice_share_token text,
  invoice_share_enabled boolean,
  invoice_paid_at timestamptz,
  my_review_id uuid,
  my_review_status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wo.id,
    wo.request_id,
    r.title,
    wo.workspace_id,
    coalesce(bp.display_name, w.name),
    coalesce(bp.headline, ''),
    coalesce(bp.public_email, ''),
    coalesce(bp.public_phone, ''),
    coalesce(bp.website_url, ''),
    coalesce(bp.verification_status, 'unverified'),
    bp.verified_at,
    coalesce((select round(avg(rv.rating)::numeric, 2) from public.marketplace_reviews rv where rv.workspace_id = wo.workspace_id and rv.status = 'published'), 0),
    (select count(*) from public.marketplace_reviews rv where rv.workspace_id = wo.workspace_id and rv.status = 'published'),
    b.amount,
    wo.status,
    wo.cancellation_status,
    wo.cancellation_requested_by,
    wo.cancellation_reason,
    wo.project_id,
    wo.invoice_id,
    i.invoice_number,
    i.amount,
    i.payment_status::text,
    i.share_token,
    coalesce(i.share_enabled, false),
    i.paid_at,
    my_review.id,
    my_review.status,
    wo.updated_at
  from public.marketplace_work_orders wo
  join public.client_job_requests r on r.id = wo.request_id
  join public.client_job_bids b on b.id = wo.bid_id
  join public.workspaces w on w.id = wo.workspace_id
  left join public.marketplace_business_profiles bp on bp.workspace_id = wo.workspace_id
  left join public.invoices i on i.id::text = wo.invoice_id
  left join public.marketplace_reviews my_review on my_review.work_order_id = wo.id and my_review.reviewer_user_id = auth.uid()
  where wo.client_user_id = auth.uid()
  order by wo.updated_at desc;
$$;

revoke all on function public.get_my_marketplace_work_orders() from public;
grant execute on function public.get_my_marketplace_work_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Platform-admin moderation APIs
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function public.admin_list_marketplace_reviews(requested_status text default 'pending')
returns table (
  id uuid,
  workspace_id uuid,
  business_name text,
  rating integer,
  title text,
  body text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  return query
  select r.id, r.workspace_id, coalesce(bp.display_name, w.name), r.rating, r.title, r.body, r.status, r.created_at
  from public.marketplace_reviews r
  join public.workspaces w on w.id = r.workspace_id
  left join public.marketplace_business_profiles bp on bp.workspace_id = r.workspace_id
  where requested_status = 'all' or r.status = requested_status
  order by r.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_moderate_marketplace_review(
  requested_review_id uuid,
  requested_status text,
  requested_notes text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  if requested_status not in ('published', 'rejected') then raise exception 'Status must be published or rejected.'; end if;
  update public.marketplace_reviews
  set status = requested_status,
      moderation_notes = left(trim(coalesce(requested_notes, '')), 2000),
      moderated_by = auth.uid(),
      moderated_at = now(),
      updated_at = now()
  where id = requested_review_id;
  if not found then raise exception 'Review not found.'; end if;
end;
$$;

create or replace function public.admin_list_feedback_submissions()
returns table (
  id uuid,
  category text,
  rating integer,
  title text,
  message text,
  allow_public boolean,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  return query
  select f.id, f.category, f.rating, f.title, f.message, f.allow_public, f.status, f.created_at
  from public.feedback_submissions f
  order by f.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_list_support_messages()
returns table (
  id uuid,
  email text,
  subject text,
  message text,
  source text,
  status text,
  delivery_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required.'; end if;
  return query
  select s.id, s.email, s.subject, s.message, s.source, s.status, s.delivery_status, s.created_at
  from public.support_messages s
  order by s.created_at desc
  limit 200;
end;
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.admin_list_marketplace_reviews(text) from public;
revoke all on function public.admin_moderate_marketplace_review(uuid,text,text) from public;
revoke all on function public.admin_list_support_messages() from public;
revoke all on function public.admin_list_feedback_submissions() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_list_marketplace_reviews(text) to authenticated;
grant execute on function public.admin_moderate_marketplace_review(uuid,text,text) to authenticated;
grant execute on function public.admin_list_support_messages() to authenticated;
grant execute on function public.admin_list_feedback_submissions() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Extend database-side text moderation to all new/public communication
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_validate_record_text()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  payload text := '';
begin
  if tg_table_name = 'feedback_submissions' then
    payload := concat_ws(' ', new.title, new.message);
  elsif tg_table_name = 'marketplace_business_profiles' then
    payload := concat_ws(' ', new.display_name, new.headline, new.description, array_to_string(new.services, ' '), new.availability_note, new.legal_business_name);
  elsif tg_table_name = 'marketplace_worker_profiles' then
    payload := concat_ws(' ', new.headline, new.bio, array_to_string(new.skills, ' '));
  elsif tg_table_name = 'marketplace_job_openings' then
    payload := concat_ws(' ', new.title, new.description);
  elsif tg_table_name = 'marketplace_job_applications' then
    payload := concat_ws(' ', new.cover_note, new.profile_snapshot::text);
  elsif tg_table_name = 'client_job_requests' then
    payload := concat_ws(' ', new.title, new.description, new.service_type, new.client_name);
  elsif tg_table_name = 'client_job_bids' then
    payload := concat_ws(' ', new.message);
  elsif tg_table_name = 'marketplace_messages' then
    payload := concat_ws(' ', new.body);
  elsif tg_table_name = 'marketplace_reviews' then
    payload := concat_ws(' ', new.title, new.body, new.business_response);
  elsif tg_table_name = 'support_messages' then
    payload := concat_ws(' ', new.subject, new.message);
  end if;

  perform public.marketplace_assert_safe_text(payload, 'Submitted content');
  return new;
end;
$$;

revoke all on function public.marketplace_validate_record_text() from public;

-- Recreate only the new/missing trigger coverage; existing marketplace triggers remain valid.
drop trigger if exists marketplace_messages_validate_text on public.marketplace_messages;
create trigger marketplace_messages_validate_text
before insert or update on public.marketplace_messages
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists marketplace_reviews_validate_text on public.marketplace_reviews;
create trigger marketplace_reviews_validate_text
before insert or update on public.marketplace_reviews
for each row execute function public.marketplace_validate_record_text();

drop trigger if exists support_messages_validate_text on public.support_messages;
create trigger support_messages_validate_text
before insert or update on public.support_messages
for each row execute function public.marketplace_validate_record_text();

-- Explicitly keep unreviewed features disabled at launch.
insert into public.feature_flags(key, enabled, description) values
  ('browser_push', false, 'Disabled until service-worker, VAPID, permission, and unsubscribe flows are reviewed'),
  ('ai_assistant', false, 'Disabled until privacy, moderation, cost, and quality controls are reviewed'),
  ('real_payroll', false, 'Disabled until a compliant payroll provider is integrated')
on conflict (key) do update set
  enabled = excluded.enabled,
  description = excluded.description,
  updated_at = now();

commit;

select 'yardpilot launch readiness v1 complete' as result;
