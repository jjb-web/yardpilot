# Production Email Setup

Configure a dedicated SMTP provider in Supabase Auth before public registration.
Suggested senders:

```text
no-reply@yardpilotusa.com
support@yardpilotusa.com
billing@yardpilotusa.com
```

Complete domain SPF, DKIM, and DMARC setup with the email provider. Keep SMTP
passwords in the provider/Supabase dashboard, never in the frontend or Git.

Customize and test these Supabase Auth templates:

- Confirm signup
- Reset password
- Magic link, when enabled
- Change email
- Team invitation guidance

Test links with Google and email/password accounts, existing users, new users,
expired links, wrong-email invitations, mobile browsers, and the production
domain.

Operational email for bids, approvals, invoices, and notifications is not sent
by this release. The notification database and preferences are ready, but an
email-delivery worker/provider must be added and reviewed before enabling those
messages. Gift codes remain manual and are not auto-emailed.
