# YardPilotUSA current workflow polish v3

This update is built on the latest **YardPilot major workflow** files already
supplied and installed. It is a forward-only patch: it adds and edits files
without deleting business records or requiring database cleanup.

## Install in this order

### 1. Back up the current project

```bash
cd ~/yardpilot
git status
git add .
git commit -m "Backup before current workflow polish v3"
```

Do not commit `.env` files or secret keys. Skip the backup commit only when the
working tree is already clean and the current version is safely on GitHub.

### 2. Run the one new SQL migration

In **Supabase → SQL Editor**, run this file once:

```text
supabase/sql/yardpilot-operational-details-and-stripe-polish-v3.sql
```

It creates one security-definer RPC that provides employees with saved contact
and property operational details only for jobs they are already allowed to
view. It does not delete or rewrite customers, estimates, jobs, invoices,
memberships, photos, Stripe data, or old compatibility columns.

Do **not** rerun the older major-workflow SQL, old Query 4/5 files, lifecycle
migrations, profit/payment migrations, or previous public-estimate SQL after
this migration. Older definitions can overwrite newer functions.

### 3. Extract the ZIP into the project root

The destination is the folder containing `package.json`:

```bash
cd ~/yardpilot
unzip -o ~/Downloads/yardpilot-current-workflow-polish-v3.zip -d ~/yardpilot
```

This package intentionally does not include `public/yardpilot-logo.png`, so your
existing YardPilot logo is preserved. The new favicon/PWA icon files are
separate.

### 4. Redeploy the changed Stripe Connect function

```bash
cd ~/yardpilot
npx supabase@latest functions deploy stripe-connect-account
```

No webhook function redeployment and no Stripe secret change are required.

### 5. Build before pushing

```bash
cd ~/yardpilot
npm run build
```

Do not push when the build fails. Save the complete terminal error instead.

### 6. Commit and deploy

```bash
cd ~/yardpilot
xargs -d '\n' git add < FILES-TO-REPLACE.txt
git add README-FIRST.md CHANGELOG.md MANUAL-SETTINGS.md TEST-CHECKLIST.md
git commit -m "Polish estimates jobs invoices auth and Stripe controls"
git push
```

Vercel should deploy after the push.

## No deletion required

No table, column, record, old query file, Stripe account, or Vercel setting must
be deleted for this update. Database cleanup can wait until a later dedicated
migration.
