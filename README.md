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

Historical SQL is preserved under `supabase/sql/history/` and must not be rerun
against production. Keep future executable database changes as reviewed,
timestamped migrations under `supabase/migrations/`. Read
`docs/database/cleanup-plan.md` before changing the live schema.

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

- `docs/archive/launch-hardening-v1.md`
- `docs/DEPLOYMENT.md`
- `docs/LAUNCH-CHECKLIST.md`
- `docs/ROLE-TEST-MATRIX.md`
- `docs/DEFERRED-ROADMAP.md`
- `docs/CODEBASE-STRUCTURE.md`
