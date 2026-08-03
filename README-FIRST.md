# YardPilot Launch Hardening v1

This is a root-overlay update built on the latest YardPilot subscription,
marketplace, client-account, mobile/dark-mode, and logo versions available in the
project history.

It is intentionally a **hardening release**, not another large feature expansion.
Read `docs/DEPLOYMENT.md` before copying files or running SQL.

## Install order

1. Commit/back up the current project and create a Supabase backup.
2. Extract this ZIP into `~/yardpilot`.
3. Confirm `yardpilot-marketplace-visibility-rls-v2.sql` was already applied.
4. Run `supabase/sql/yardpilot-launch-hardening-v1.sql` once.
5. Set the `RATE_LIMIT_SALT` Supabase secret.
6. Deploy the changed Edge Functions listed in `docs/DEPLOYMENT.md`.
7. Configure custom SMTP and production redirect URLs.
8. Run `npm ci` and `npm run build`.
9. Push to the private GitHub repository and test every role in staging.
10. Keep the site in controlled beta until `docs/LAUNCH-CHECKLIST.md` passes.

## Major additions

- Internal manager/owner estimate approval separate from client acceptance.
- Employees restricted to assigned accepted jobs and their allowed drafts.
- One user can switch between client and landscaper modes.
- Safer marketplace bid integrity and one accepted bid per request.
- Registration, bidding, and hiring emergency feature flags.
- Registration-verification fields and a precise “Registration verified” badge.
- In-app notifications and notification preferences.
- Privacy-limited analytics consent and client error reporting.
- Public contact/waitlist endpoints with rate limiting and honeypots.
- Safer account deletion with ownership-transfer checks.
- Stripe Billing webhook idempotency and billing-problem states.
- Legal-page scaffolds, acceptance version records, repository/security files,
  mobile icon corrections, and launch documentation.

## Deliberately not implemented

Real payroll, tax forms, EIN collection, QuickBooks, public review moderation,
browser push, AI estimating, maps/fuel tracking, integrated messaging, full
profit accounting, and cross-workspace transfers are deferred. See
`docs/DEFERRED-ROADMAP.md`.

## Validation completed

- Parsed all TypeScript/TSX source files: no syntax errors.
- Checked all relative imports: no missing local imports.

A complete Vite build could not be executed in the artifact environment because
the dependency registry was unavailable. `npm ci && npm run build` in the actual
YardPilot project is required before deployment.
