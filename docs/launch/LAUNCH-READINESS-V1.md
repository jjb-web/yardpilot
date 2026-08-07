# YardPilotUSA launch readiness v1

This update completes the parts that can safely live in source control. It does
not configure third-party dashboards and does not enable browser push, AI, real
payroll, or automatic tax filing.

## Completed in code

- One shared Supabase Realtime notification subscription
- Working Tailwind class-based dark mode
- GA4 page views plus privacy-limited conversion events
- Search metadata, canonical URL, robots.txt and sitemap.xml
- Support messages stored in Supabase and optionally emailed through Resend
- Account deletion now stops when shared-record transfers fail
- Marketplace participant messaging
- Accepted-company profile/contact details
- Marketplace cancellation request and response history
- Verified-project reviews with platform-admin moderation
- Database-side text moderation for support, messages and reviews
- Feature flags keep browser push, AI assistant and real payroll disabled
- Configuration audit script that displays secret names, never values

## Deployment order

1. Commit or archive the current working tree.
2. Run `supabase/sql/proposed/yardpilot-launch-readiness-v1.sql` in the Supabase
   SQL Editor. The final result must say `yardpilot launch readiness v1 complete`.
3. Set the required Edge Function secrets listed in `SECRETS-MAP.md`.
4. Deploy `submit-public-contact` and `delete-account`.
5. Deploy or redeploy all Stripe functions only after confirming the live/test
   secrets and webhook signing secrets are correct.
6. Run `npm run build`.
7. Commit, push, and let Vercel deploy.
8. Test with separate owner, manager, employee and client accounts.
9. Keep marketplace public registration invite-only until the cancellation,
   messaging, review and payment tests pass.

## Features intentionally postponed

- Browser push notifications
- General or estimate-generating AI
- Google Earth / automatic mileage calculations
- Real payroll
- Tax forms and tax filing
- EIN collection
- QuickBooks sync (use CSV export first)
- Receipt OCR
- Cross-workspace destructive record transfers

## Required legal review

The cancellation and marketplace terms are product defaults, not jurisdiction-
specific legal advice. Have an attorney review the Terms, Privacy Policy,
Marketplace Terms, cancellation language, electronic signatures, payment terms,
and record-retention rules before broad commercial release.
