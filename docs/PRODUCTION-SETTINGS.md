# Manual Production Settings

These cannot be completed by copying source files.

## Supabase Auth

- Configure custom SMTP.
- Set production Site URL and approved redirect URLs.
- Review Google OAuth redirect configuration.
- Customize confirmation and password-reset templates.
- For a real emergency signup shutdown, disable new signups in Supabase Auth in
  addition to the `public_registration` database flag.

## Supabase secrets

Keep current Stripe secrets and add:

```bash
npx supabase@latest secrets set RATE_LIMIT_SALT="LONG_RANDOM_SECRET"
```

## Stripe

The billing webhook should continue receiving:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.finalization_failed
```

Keep the separate connected-account invoice webhook. Rotate any live Stripe
secret previously exposed in a screenshot, chat, commit, or log.

## Vercel

Set only browser-safe values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_VERSION
VITE_GA_MEASUREMENT_ID (optional)
```

## Domain/email

Configure SPF, DKIM, and DMARC for production email. Verify the uploaded
YardPilot favicon by removing and re-adding any cached iOS Home Screen shortcut.

## Legal/business

The included policies are beta scaffolds. Attorney review, LLC/EIN formation,
founder/IP agreements, business bank setup, and company ownership of provider
accounts remain manual launch requirements.
