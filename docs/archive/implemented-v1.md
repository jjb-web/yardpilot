# Implemented in Launch Hardening v1

## Access, roles, and identity

- One login can enable client and landscaper modes and switch between them.
- Team membership enables landscaper mode without creating a second account.
- Client activity enables client mode.
- Employees are restricted to assigned accepted jobs and their permitted drafts.
- Owner/manager estimate approval is separate from customer acceptance.

## Marketplace

- One accepted company bid per client request is enforced.
- Accepted marketplace work reuses or opens the existing estimate rather than
  recreating it.
- Find Landscaping Work is limited to employees or personal workspaces.
- Publish Openings remains a distinct marketplace tab.
- Business-registration verification fields and precise badge wording are added.
- Marketplace bidding and hiring can be paused with feature flags.
- Company listing save/publish gives a visible success message.

## Billing and promotions

- Unique one-use 30-day gift codes remain supported.
- Stripe Billing webhook processing is idempotent.
- Payment-action-required and invoice-finalization failures are stored and shown.
- Paywall billing-status functions are permanently marked VOLATILE.

## Reliability and privacy

- Versioned Terms/Privacy acceptance records.
- In-app notifications and preferences.
- Privacy-limited analytics consent.
- Client error reports, public contact, and waitlist endpoints with rate limits.
- Account deletion blocks unsafe owner deletion and removes private resume files.
- Uploaded YardPilotUSA logo, favicon, and mobile icons are preserved.
- Dark/mobile styles from the latest marketplace UX update are retained.

## Repository and deployment

- Proprietary license and notice.
- Security policy, private-repository guidance, `.gitignore`, `.env.example`.
- Vercel security headers.
- GitHub build workflow.
- Deployment, role-test, email, legal/business, feature-flag, and launch checklists.
