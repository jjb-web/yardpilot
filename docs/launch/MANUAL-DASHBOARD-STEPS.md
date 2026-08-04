# Manual dashboard steps

## Supabase Auth

- Site URL: `https://yardpilotusa.com`
- Allow redirect URLs for production confirmation/reset routes and localhost
- Configure custom SMTP
- Customize and test confirmation and password-reset templates
- Verify Google OAuth callback and consent screen

## Resend or another transactional email provider

- Verify `yardpilotusa.com`
- Configure SPF, DKIM and DMARC
- Create `no-reply@yardpilotusa.com` and monitor `support@yardpilotusa.com`
- Set the Resend Edge Function secrets

## Google

- Create a GA4 web data stream and add the `G-...` value to Vercel Production
- Confirm consent, page views and conversion events in Realtime
- Verify the domain in Search Console
- Submit `https://yardpilotusa.com/sitemap.xml`
- Do not start Google Ads until signup conversion tracking and the mobile signup
  flow work reliably

## Stripe

- Confirm live versus test keys in Supabase secrets
- Confirm each webhook uses its own correct `whsec_...` secret
- Confirm Connect events are sent from connected accounts to the Connect webhook
- Test one sandbox subscription, one sandbox connected invoice payment, refunds,
  failed payments and webhook retries

## Vercel

- Verify Production environment variables
- Confirm the production domain points to the expected project
- Redeploy after environment changes
- Check build logs and test in an incognito browser
