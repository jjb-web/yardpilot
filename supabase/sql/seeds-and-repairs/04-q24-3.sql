-- YardPilot: repair workspace creator ownership
-- Run this entire file in Supabase SQL Editor.
--
-- What it does:
-- 1. Shows workspace creators and their actual permission roles.
-- 2. Changes an existing creator membership to role = 'owner'.
-- 3. Leaves all non-creators and unrelated memberships unchanged.
-- 4. Shows the result after repair.
--
-- Important:
-- "position_title" (for example, "Owner") is only a labor/job title.
-- Stripe authorization uses workspace_memberships.role.

begin;

-- BEFORE: inspect actual access roles.
select
  w.id as workspace_id,
  w.name as workspace_name,
  w.kind,
  w.is_personal,
  w.created_by as workspace_creator_user_id,
  wm.user_id as membership_user_id,
  wm.role as actual_permission_role,
  wm.position_title,
  case
    when wm.user_id = w.created_by then 'creator membership'
    else 'other membership'
  end as membership_type
from public.workspaces w
left join public.workspace_memberships wm
  on wm.workspace_id = w.id
order by w.created_at, wm.created_at;

-- SAFE REPAIR:
-- The user recorded as the workspace creator must hold the actual owner role.
update public.workspace_memberships wm
set
  role = 'owner',
  position_title = coalesce(nullif(trim(wm.position_title), ''), 'Owner')
from public.workspaces w
where wm.workspace_id = w.id
  and wm.user_id = w.created_by
  and wm.role is distinct from 'owner';

commit;

-- AFTER: confirm creator memberships are now owners.
select
  w.id as workspace_id,
  w.name as workspace_name,
  w.kind,
  w.is_personal,
  w.created_by as workspace_creator_user_id,
  wm.user_id as membership_user_id,
  wm.role as actual_permission_role,
  wm.position_title,
  case
    when wm.user_id = w.created_by and wm.role = 'owner'
      then 'OK - creator is owner'
    when wm.user_id = w.created_by
      then 'ERROR - creator is not owner'
    else 'other membership'
  end as status
from public.workspaces w
left join public.workspace_memberships wm
  on wm.workspace_id = w.id
order by w.created_at, wm.created_at;
