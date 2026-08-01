-- EXAMPLES ONLY. Change the codes/campaigns before running.
-- Codes are stored as SHA-256 hashes; the plain code is not stored.

-- One shared QR campaign code: 30 free days, up to 500 workspaces.
insert into public.access_codes (
  code_hash, code_hint, campaign, plan_key, duration_days,
  max_redemptions, expires_at, active
)
values (
  encode(digest(upper(trim('YARDPILOT30')), 'sha256'), 'hex'),
  'YARD…T30',
  'Business cards — 30 days',
  'pro',
  30,
  500,
  now() + interval '1 year',
  true
)
on conflict (code_hash) do nothing;

-- A limited founder campaign: one free year, 50 redemptions.
insert into public.access_codes (
  code_hash, code_hint, campaign, plan_key, duration_days,
  max_redemptions, expires_at, active
)
values (
  encode(digest(upper(trim('FOUNDER365')), 'sha256'), 'hex'),
  'FOUN…365',
  'Founder cards — one year',
  'pro',
  365,
  50,
  now() + interval '6 months',
  true
)
on conflict (code_hash) do nothing;

-- QR destination examples:
-- https://yardpilotusa.com/redeem/YARDPILOT30
-- https://yardpilotusa.com/redeem/FOUNDER365
