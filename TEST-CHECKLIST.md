# Test checklist

Run these tests after the SQL migration, Edge Function deployment, and Vercel
deployment.

## Estimates

- Create an estimate with lawn mowing under $250 and generate a description.
- Regenerate it and confirm the wording changes.
- Create a multi-job estimate over $1,000 with mulch or irrigation work and
  confirm the description reflects the different scope/price range.
- Edit the generated text and save; confirm the public estimate shows it.
- Select a saved contact with one property and confirm the property auto-selects.
- Select a saved property directly and confirm contact, address, notes,
  description, photos, and customer notes fill correctly.
- Confirm only required fields say Required and no repetitive Optional labels
  remain.
- Confirm estimate totals/documents say Combined labor.

## Public estimate

- Open a sent estimate on desktop and mobile and confirm no large blank scroll
  area exists after the content.
- Draw a signature first, tap the name field, type the name, and confirm the
  signature remains.
- Accept the estimate and confirm the response saves.

## Jobs

- Open Current Jobs and Past Jobs; confirm every card has View Job.
- Confirm cards display the saved customer/property details.
- Open a job as an employee and confirm address, phone/email, property notes,
  internal instructions, schedule, crew, materials, and photos are visible.
- Confirm employee job pages do not expose estimate totals or worker rates.

## Invoices

- Open an invoice and confirm the action buttons wrap cleanly on mobile.
- Choose Paid in person → Other and confirm the custom text field is required.
- Save a custom method such as Zelle and confirm it displays as Zelle.
- Confirm Share invoice copy and Send online payment link remain separate.

## Stripe

- In a personal workspace owned by the signed-in user, click Connect Stripe and
  confirm onboarding opens.
- Refresh status and confirm the existing 30-second status polling still works.
- Disconnect Stripe in YardPilot and confirm the Account page returns to Not
  connected while the external Stripe account remains available in Stripe.

## Contacts and branding

- Add a contact and confirm its email does not appear in the contacts search box.
- Confirm the sidebar has no New Estimate tab and uses the requested order.
- Confirm the browser tab says YardPilotUSA.
- Confirm the favicon appears after clearing any old mobile shortcut/cache.
