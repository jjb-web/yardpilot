select
  i.invoice_number,
  i.amount,
  i.workspace_id,
  w.name as workspace_name,
  w.stripe_account_id,
  w.stripe_onboarding_complete,
  w.stripe_charges_enabled,
  w.stripe_payouts_enabled,
  public.get_public_invoice(i.share_token) -> 'payments'
    as public_payment_status
from public.invoices i
join public.workspaces w
  on w.id = i.workspace_id
where i.invoice_number = 'INV-2026-179D2C';
