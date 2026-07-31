# Changes in current workflow polish v3

## Estimates

- Added an optional **Generate description** button.
- The description is created locally from phrase banks and conditions involving
  job type, number of jobs, price range, square footage, materials, billing
  method, location, and estimated combined labor.
- Generated wording is editable, optional, and never labeled AI.
- Saved descriptions continue using the existing estimate-summary database
  field for backward compatibility.
- Contact selection now fills saved contact information and automatically
  selects the property when the contact has exactly one property.
- Property selection works before or after contact selection and fills the
  linked contact, address, city, property description, internal notes,
  client-visible notes, and saved property photos into the first job.
- Property options display the property address.
- Removed repetitive `Optional` labels. Only required fields are marked.
- Replaced customer-facing `Labor` labels with `Combined labor`.

## Public estimates and documents

- Fixed public-document sizing and horizontal overflow to prevent large blank
  scroll areas after the estimate content.
- The signature canvas now restores its drawing when the mobile keyboard or
  viewport changes size, so typing the signer name does not erase the signature.
- Public documents retain the generated estimate overview and multi-job layout.

## Jobs and Past Jobs

- Added explicit **View Job** buttons in addition to clickable job cards.
- Job cards now show saved customer name, address, phone, email, property name,
  saved notes, separate job titles, crew, schedule, and estimated combined
  hours.
- Job details show linked property description, internal notes, client notes,
  contact notes, full address, phone, email, schedule, materials, crew, and
  relevant saved property/job photos.
- Employees receive these details through a restricted operational-details RPC
  without receiving hidden estimate prices or worker rates.

## Invoices

- Reorganized invoice actions into a responsive button grid.
- Kept separate **Share invoice copy** and **Send online payment link** actions.
- **Paid in person → Other** now opens a required custom-method text field.
- Custom methods are stored in the existing payment-method field and displayed
  without the internal `other:` prefix.
- Replaced document `Labor` labels with `Combined labor`.

## Stripe

- Personal, company, and workgroup workspaces may connect Stripe; the workspace
  owner/co-owner permission requirement remains.
- Added **Disconnect Stripe** inside YardPilot Account settings.
- Disconnecting clears the YardPilot workspace connection and payment-readiness
  fields but does not close or delete the external Stripe account.
- Existing 30-second Stripe status refresh behavior is preserved.

## Navigation, contacts, and branding

- Removed the redundant **New Estimate** sidebar tab.
- Sidebar order is now Dashboard, Contacts, Estimates, Jobs, Schedule,
  Follow-ups, Invoices, Past Jobs, Team, Account.
- Kept New Estimate actions in normal page/header locations.
- Contact search is cleared after saving and disables browser autofill behavior
  that could place a new contact email into the search box.
- Added mobile Chrome/PWA favicon assets, Apple touch icon, manifest icons, and
  consistent `YardPilotUSA` browser metadata.
- Added viewport/app-shell CSS to prevent document and app overscroll issues.
