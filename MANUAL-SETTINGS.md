# Manual settings

## Branded Google sign-in URL

The random-letter domain shown during Google sign-in is the default Supabase
project domain. Frontend code alone cannot replace it. Configure a Supabase
custom domain such as:

```text
https://auth.yardpilotusa.com
```

Then:

1. Add and verify the custom domain in Supabase using the DNS records Supabase
   gives you.
2. In Google Cloud / Google Auth Platform, add this authorized redirect URI in
   addition to the existing Supabase callback:

   ```text
   https://auth.yardpilotusa.com/auth/v1/callback
   ```

3. In Supabase Authentication URL Configuration, use your production site URL
   and allow both production hostnames used by the app:

   ```text
   Site URL: https://yardpilotusa.com
   Redirect URLs:
   https://yardpilotusa.com/**
   https://www.yardpilotusa.com/**
   ```

4. After the custom domain is activated, you may change the Vercel environment
   variable `VITE_SUPABASE_URL` to `https://auth.yardpilotusa.com` and redeploy.
   Keep the existing publishable key.

## Mobile favicon

Chrome and iOS cache icons aggressively. After the Vercel deployment is Ready:

1. Close all YardPilot tabs.
2. Reopen `https://yardpilotusa.com`.
3. Remove and recreate any old home-screen shortcut/PWA installation.
4. Clear site data only when the old icon still persists.

The package preserves your existing `public/yardpilot-logo.png` and adds new
favicon/manifest icon files separately.

## Stripe disconnect behavior

The new YardPilot button disconnects the current workspace locally and stops
new online invoice links from using that connection. The external Stripe
account stays open.

To fully remove a full-dashboard connected account from the YardPilot platform,
open the connected account in the Stripe Dashboard, use the overflow menu, and
choose **Remove account**. That is intentionally not performed automatically by
this package.
