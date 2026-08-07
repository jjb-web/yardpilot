# YardPilotUSA external-branding checklist

The code overlay updates the website, legal pages, document templates, browser
titles, PWA manifest, frontend messages, and Edge Function text.

The following services are configured outside the Git repository and therefore
must be updated manually. Use the exact brand spelling and capitalization:

`YardPilotUSA`

## Google OAuth

Google Cloud Console → Google Auth Platform → Branding

- App name: `YardPilotUSA`
- Homepage: `https://yardpilotusa.com/`
- Privacy policy: `https://yardpilotusa.com/privacy-policy/`
- Terms: `https://yardpilotusa.com/terms-of-service/`
- Authorized domain: `yardpilotusa.com`
- Support email: preferably `support@yardpilotusa.com`

After the production website displays `YardPilotUSA`, select:

- `I have fixed the issues`
- `Request re-verification for your branding`

Do not submit re-verification until the new Vercel production deployment is
live and visible in an incognito window.

## Supabase Auth email

Supabase Dashboard → Authentication → Email / SMTP

- Sender name: `YardPilotUSA`
- Sender email: `no-reply@yardpilotusa.com`

Review the signup, confirmation, invitation, magic-link, password-reset, and
email-change templates. Replace any visible legacy product-name text with
`YardPilotUSA`.

The internal Supabase project ID and OAuth callback may remain unchanged.

## Supabase Edge Function email sender

Keep the internal secret name unchanged, but update its display value:

```bash
cd ~/yardpilot

npx supabase@latest secrets set \
  YARDPILOT_EMAIL_FROM="YardPilotUSA <no-reply@yardpilotusa.com>"
```

The variable remains named `YARDPILOT_EMAIL_FROM`; only its visible sender value
changes.

## Resend

- Domain: keep `yardpilotusa.com`
- From display name: `YardPilotUSA`
- From address: `no-reply@yardpilotusa.com`
- Support destination: `support@yardpilotusa.com`

Review any Resend templates or subjects stored in the Resend dashboard.

## Stripe

Stripe Dashboard → Product catalog

- Rename the existing Pro subscription product to `YardPilotUSA Pro`
- Review monthly and annual price descriptions
- Review checkout branding and support text
- Review invoice footer and public business name
- Review customer-portal branding

Do not recreate prices merely to rename the product. Rename the existing live
and test products where possible.

Connected landscaping companies remain separate businesses; do not replace
their business names with YardPilotUSA.

## Vercel

Vercel does not require the project slug to match the public brand.

Confirm the production deployment contains:

- Page title: `YardPilotUSA`
- PWA/application name: `YardPilotUSA`
- Landing-page header: `YardPilotUSA`
- Footer copyright: `YardPilotUSA`
- Legal pages: `YardPilotUSA`

The domain remains `yardpilotusa.com`.

## Google Analytics, Search Console, and Ads

These names do not control OAuth branding, but rename visible assets for
consistency:

- GA4 property/stream display name: `YardPilotUSA`
- Search Console property: keep `yardpilotusa.com`
- Google Ads business/campaign naming: `YardPilotUSA`

## GitHub

The repository name may remain `yardpilot`; repository names are internal
technical identifiers. Update the README heading and repository description if
they are publicly visible.

## Images

The existing compass/leaf logo does not contain the written legacy product
name, so it does not need to be regenerated. Replace any separate social image, screenshot,
or marketing graphic that contains the old written brand.

## Final verification

Run:

```bash
npm run check:branding
npm run build
node scripts/check-branding.mjs --dist
```

Then inspect production in an incognito window before requesting Google
re-verification.
