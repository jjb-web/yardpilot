# YardPilotUSA Launch-Hardening Deployment

## 1. Back up

```bash
cd ~/yardpilot
git status
git add .
git commit -m "Backup before launch hardening"
```

Create a Supabase database backup before running the migration.

## 2. Extract the update

```bash
cd ~/yardpilot
unzip -o /path/to/yardpilot-launch-hardening-v1.zip -d ~/yardpilot
```

## 3. Database

Confirm `yardpilot-marketplace-visibility-rls-v2.sql` was already applied. Then
run `supabase/sql/yardpilot-launch-hardening-v1.sql` once in Supabase SQL Editor.
The expected final row is `launch hardening migration complete`.

The migration intentionally stops if an existing client request has more than
one accepted bid. Run `supabase/sql/yardpilot-launch-diagnostics-v1.sql` to find
those request IDs and resolve them manually before rerunning.

## 4. Supabase secrets

Keep all existing Stripe secrets. Add a random rate-limit salt:

```bash
npx supabase@latest secrets set RATE_LIMIT_SALT="replace-with-a-long-random-value"
```

Do not put this value in Vercel or any `VITE_` variable.

## 5. Deploy functions

```bash
npx supabase@latest link --project-ref zuaikajypdcrbfcksiuf
npx supabase@latest functions deploy create-invoice-checkout
npx supabase@latest functions deploy delete-account
npx supabase@latest functions deploy stripe-billing-webhook
npx supabase@latest functions deploy submit-public-contact
npx supabase@latest functions deploy subscribe-interest
npx supabase@latest functions deploy report-client-error
```

Redeploy `generate-gift-code` and `redeem-access-code` too when their local
folders are newer than production.

## 6. Frontend environment

Set in Vercel:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_VERSION
VITE_GA_MEASUREMENT_ID   optional
```

Analytics remains off until both a measurement ID exists and the visitor grants
consent.

## 7. Build

```bash
npm ci
npm run build
```

Then commit and push.

## 8. Production checks

Run the full role test matrix with unrelated owner, manager, employee, client,
and applicant accounts. Test Stripe in sandbox before repeating one controlled
live subscription and one controlled live invoice payment.
