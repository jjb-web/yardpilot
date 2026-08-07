# YardPilotUSA secrets map

Never put a Stripe secret, webhook signing secret, Supabase service-role key,
SMTP password, Resend key or access token in a `VITE_` variable or Git.

## Vercel Production — browser-safe only

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_VERSION`
- `VITE_GA_MEASUREMENT_ID` (optional, format `G-...`)

## Supabase Edge Function secrets

Automatically supplied by hosted Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Set manually:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` — connected-account/invoice endpoint
- `STRIPE_BILLING_WEBHOOK_SECRET` — YardPilotUSA subscription endpoint
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `RATE_LIMIT_SALT`
- `YARDPILOT_ALLOWED_ORIGINS=https://yardpilotusa.com`
- `YARDPILOT_APP_URL=https://yardpilotusa.com`
- `RESEND_API_KEY`
- `YARDPILOT_EMAIL_FROM=YardPilotUSA <no-reply@yardpilotusa.com>`
- `YARDPILOT_SUPPORT_EMAIL=support@yardpilotusa.com`

Example commands:

```bash
npx supabase@latest secrets set \
  YARDPILOT_ALLOWED_ORIGINS="https://yardpilotusa.com" \
  YARDPILOT_APP_URL="https://yardpilotusa.com" \
  YARDPILOT_EMAIL_FROM="YardPilotUSA <no-reply@yardpilotusa.com>" \
  YARDPILOT_SUPPORT_EMAIL="support@yardpilotusa.com"
```

Set secret values directly in the terminal; do not paste them into chat, docs,
source files or screenshots.
