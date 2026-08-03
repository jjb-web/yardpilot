# YardPilot

Private-beta software for landscaping estimates, jobs, teams, scheduling,
marketplace bidding, hiring, invoices, connected-business payments, and YardPilot
Pro subscriptions.

This repository is proprietary. See `LICENSE`, `NOTICE`, and `SECURITY.md`.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase Auth, Postgres, RLS, Storage, and Edge Functions
- Stripe Billing for YardPilot Pro
- Stripe Connect for landscaping-company invoice payments
- Vercel deployment

## Local setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Set only browser-safe public values in `.env`. Secret keys belong in Supabase
Edge Function secrets or the appropriate provider dashboard.

## Production build

```bash
npm run build
npm run preview
```

## Database changes

Apply SQL migrations manually and in order. For this release, first confirm the
latest marketplace visibility/RLS migration was applied, then run:

```text
supabase/sql/yardpilot-launch-hardening-v1.sql
```

Do not rerun older migrations afterward because they may restore obsolete
functions or policies.

## Edge Functions changed by launch hardening

- `delete-account`
- `stripe-billing-webhook`
- `submit-public-contact`
- `subscribe-interest`
- `report-client-error`

The package also preserves the current gift-code, subscription, invoice, and
Stripe Connect functions.

## Release process

Read:

- `README-FIRST.md`
- `docs/DEPLOYMENT.md`
- `docs/LAUNCH-CHECKLIST.md`
- `docs/ROLE-TEST-MATRIX.md`
- `docs/DEFERRED-ROADMAP.md`
