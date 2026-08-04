# Production email setup

## Supabase Auth email

Configure a dedicated SMTP provider in Supabase Auth before public registration.
Suggested senders:

```text
no-reply@yardpilotusa.com
support@yardpilotusa.com
billing@yardpilotusa.com
```

Complete SPF, DKIM and DMARC setup. Keep SMTP passwords in the provider and
Supabase dashboard, never in frontend code or Git.

Customize and test:

- Confirm signup
- Reset password
- Change email
- Team invitation guidance
- Existing-email and Google-login conflict paths
- Expired links and mobile browsers

## Support form email

`submit-public-contact` always stores an accepted message in `support_messages`.
When these Supabase Edge Function secrets are configured, it also emails the
support mailbox through Resend:

```text
RESEND_API_KEY
YARDPILOT_EMAIL_FROM
YARDPILOT_SUPPORT_EMAIL
YARDPILOT_ALLOWED_ORIGINS
RATE_LIMIT_SALT
```

A provider failure does not discard the database copy. Delivery state and error
text are stored for platform administrators.

## Operational notification email

In-app notifications and user email preferences exist. Automated email for
bids, estimate approvals, invoices, payments and hiring still needs a reviewed
outbox/worker. Do not claim those emails are active yet. Browser push remains
disabled. Gift codes remain manual and are not auto-emailed.
