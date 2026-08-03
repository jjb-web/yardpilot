# Public Launch Checklist

YardPilot should remain a controlled private beta until every launch-blocking
item is checked.

## Security and data isolation

- [ ] No unresolved RLS recursion or permission errors.
- [ ] Unrelated workspaces cannot read or modify each other's records.
- [ ] Employees see only assigned accepted jobs plus their own allowed drafts.
- [ ] Private resumes require authorized access and use signed URLs.
- [ ] Repository is private and all service accounts use 2FA.
- [ ] Previously exposed Stripe live secret has been rotated.
- [ ] Database backup exists and a restore has been tested.
- [ ] Rate limits and honeypots work on public contact/waitlist/error endpoints.

## Authentication and email

- [ ] Custom SMTP is configured.
- [ ] SPF, DKIM, and DMARC pass.
- [ ] Email confirmation, password reset, email change, Google sign-in, team
      invitation links, and invite codes work on mobile and desktop.
- [ ] Production redirect URLs contain only approved domains.
- [ ] Registration can be paused through the feature flag and Supabase Auth
      signup setting.

## Core workflows

- [ ] Employee draft → manager approval → send → customer acceptance works.
- [ ] Manager approval and customer acceptance remain separate.
- [ ] Client request → company bid → accepted bid → exactly one estimate works.
- [ ] Marketplace-created estimate returns to Estimates instead of recreating it.
- [ ] Company listing save/publish confirmation appears.
- [ ] Unique 30-day gift code redeems once and expires correctly.
- [ ] Subscription purchase, renewal, failed payment, required action, portal,
      cancellation, and expiration work.
- [ ] Invoice payment, paid-in-person, refund/dispute handling, and receipt flow
      have been manually tested.
- [ ] Account deletion works for client, employee, solo owner, and owner with team.

## Product quality

- [ ] Mobile Safari and Android Chrome do not random-zoom or double-scroll.
- [ ] Dark mode and contact/property/history tabs are readable.
- [ ] Uploaded YardPilot logo appears as favicon and home-screen icon.
- [ ] Empty, loading, error, offline, and not-found states are understandable.
- [ ] Keyboard and screen-reader basics have been reviewed.
- [ ] Reports are labeled Beta and their definitions match stored data.

## Business and legal

- [ ] LLC, EIN, business bank account, and company-controlled service accounts.
- [ ] Signed founder/IP agreement and contractor/employee agreements where needed.
- [ ] Attorney-reviewed Terms, Privacy, Marketplace Terms, Acceptable Use, Refund,
      subscription/cancellation, review/moderation, and data-retention policies.
- [ ] Support, privacy, billing, and security contacts are monitored.
- [ ] Business verification badge wording has been reviewed and does not imply
      quality, insurance, licensing, tax, or background verification.

## Launch gate

- [ ] Zero known cross-workspace leaks.
- [ ] Zero known payment/subscription blockers.
- [ ] Zero known registration/invitation blockers.
- [ ] Closed-beta testers completed the role matrix without critical failures.
