# Security Policy

Do not report security issues through public GitHub issues or public reviews.
Use the private YardPilotUSA support channel and clearly label the message
`SECURITY REPORT`. Do not include live secret keys, full card data, Social
Security numbers, customer records, or unnecessary personal information.

## Production rules

- Keep the repository private.
- Require two-factor authentication on GitHub, Vercel, Supabase, Stripe, domain,
  Google, and email-provider accounts.
- Never commit `.env`, Stripe secret keys, Supabase service-role keys, webhook
  secrets, or SMTP passwords.
- Rotate any credential exposed in screenshots, chat, logs, commits, or support
  tickets.
- Test RLS with unrelated workspaces before every public release.
- Review failed Stripe webhooks, Supabase Edge Function logs, and client error
  reports.

## Supported release

Only the current production release is supported during private beta.
