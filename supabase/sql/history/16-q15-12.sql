-- YardPilot moderation trigger permission fix
-- Forward-only and non-destructive.
--
-- Problem:
-- The moderation migration revoked EXECUTE on the helper functions from PUBLIC,
-- but the trigger function was left as SECURITY INVOKER. Authenticated estimate
-- inserts therefore reached the trigger and failed with:
--   permission denied for function yardpilot_text_is_allowed
--
-- Fix:
-- Run the trigger under its database owner's privileges while keeping the
-- helper functions unavailable for direct client execution.

begin;

alter function public.yardpilot_validate_text_record()
  security definer;

alter function public.yardpilot_validate_text_record()
  set search_path = pg_catalog, public;

-- Keep the helper functions private. The SECURITY DEFINER trigger can still
-- execute them as their database owner.
revoke all on function public.yardpilot_normalize_moderation(text)
  from public, anon, authenticated;

revoke all on function public.yardpilot_text_is_allowed(text)
  from public, anon, authenticated;

revoke all on function public.yardpilot_validate_text_record()
  from public, anon, authenticated;

commit;

-- Verification output:
-- yardpilot_validate_text_record should show security_definer = true.
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner_name,
  p.proacl as access_control
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'yardpilot_normalize_moderation',
    'yardpilot_text_is_allowed',
    'yardpilot_validate_text_record'
  )
order by p.proname;
