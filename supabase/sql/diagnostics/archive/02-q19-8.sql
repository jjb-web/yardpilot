select
  name,
  stripe_account_id,
  stripe_onboarding_complete,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_requirements_currently_due,
  stripe_requirements_past_due,
  stripe_requirements_pending_verification,
  stripe_disabled_reason,
  stripe_status_updated_at
from public.workspaces
where stripe_account_id is not null
order by updated_at desc;
