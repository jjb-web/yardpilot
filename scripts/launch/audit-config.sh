#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/yardpilot}"

required_frontend=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_APP_VERSION
)
optional_frontend=(VITE_GA_MEASUREMENT_ID)
required_function_secrets=(
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_BILLING_WEBHOOK_SECRET
  STRIPE_PRO_MONTHLY_PRICE_ID
  STRIPE_PRO_ANNUAL_PRICE_ID
  RATE_LIMIT_SALT
  YARDPILOT_ALLOWED_ORIGINS
  YARDPILOT_EMAIL_FROM
  YARDPILOT_SUPPORT_EMAIL
  RESEND_API_KEY
)

printf 'YardPilot configuration audit\n\n'
printf 'Local browser environment names:\n'
for key in "${required_frontend[@]}"; do
  if grep -RqsE "^[[:space:]]*${key}=" .env .env.local .env.production 2>/dev/null; then
    printf '  OK       %s\n' "$key"
  else
    printf '  MISSING  %s (local only; also verify Vercel Production)\n' "$key"
  fi
done
for key in "${optional_frontend[@]}"; do
  if grep -RqsE "^[[:space:]]*${key}=" .env .env.local .env.production 2>/dev/null; then
    printf '  PRESENT  %s\n' "$key"
  else
    printf '  OPTIONAL %s\n' "$key"
  fi
done

printf '\nSupabase Edge Function secret names (values are never displayed):\n'
secret_output="$(npx supabase@latest secrets list 2>/dev/null || true)"
for key in "${required_function_secrets[@]}"; do
  if grep -q "$key" <<<"$secret_output"; then
    printf '  OK       %s\n' "$key"
  else
    printf '  MISSING  %s\n' "$key"
  fi
done

printf '\nEdge Function folders:\n'
for function in \
  create-billing-portal create-invoice-checkout create-subscription-checkout \
  delete-account generate-gift-code redeem-access-code report-client-error \
  stripe-billing-webhook stripe-connect-account stripe-webhook \
  submit-public-contact subscribe-interest; do
  if [[ -f "supabase/functions/$function/index.ts" ]]; then
    printf '  OK       %s\n' "$function"
  else
    printf '  MISSING  %s/index.ts\n' "$function"
  fi
done

printf '\nSuspicious secret-like files tracked by Git:\n'
git ls-files 2>/dev/null | grep -Ei '(^|/)(\.env($|\.)|.*\.(pem|p12|pfx|key)$|.*secret.*\.json$|.*credential.*\.json$)' || printf '  None found.\n'

printf '\nNext manual checks:\n'
printf '  - Vercel Settings > Environment Variables (Production)\n'
printf '  - Supabase Auth > URL Configuration and SMTP\n'
printf '  - Stripe Developers > Webhooks and Connect webhooks\n'
printf '  - Google Analytics Realtime and Search Console sitemap\n'
