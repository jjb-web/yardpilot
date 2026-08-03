# Role Test Matrix

Use unrelated email accounts and at least two unrelated business workspaces.
Never test isolation using only two users in the same workspace.

## Owner/co-owner

- Create and publish company listing; save confirmation appears.
- Create opening, review applicant, approve/reject.
- View open client requests and submit/update a bid.
- Approve employee estimate and send to customer.
- Assign jobs and confirm employee visibility.
- Connect Stripe, create invoice link, and use subscription billing portal.
- Generate one-use gift code as platform admin.
- Attempt account deletion with team members; deletion must stop and explain why.

## Manager

- Can approve/send estimates and manage allowed marketplace workflows.
- Cannot perform owner-only ownership/destructive actions.
- Can see assigned/authorized records but not unrelated workspaces.

## Employee

- Sees only assigned accepted jobs.
- Can create an allowed draft and submit it for internal approval.
- Cannot approve or send the estimate.
- Find Landscaping Work appears only in employee/personal mode.
- Cannot see private contacts, invoices, or jobs outside assigned scope.

## Client

- Sees client layout, not business dashboard.
- Searches published companies with paginated/location-limited results.
- Posts request, sees bids, accepts exactly one bid.
- Sees estimate/invoice through existing secure share/payment flow.
- Cannot see business-only internal costs, team, schedule, or workspace data.

## Worker applicant

- Builds worker profile, uploads allowed resume type/size, applies once.
- Can see own application status but not other applicants.
- Resume is inaccessible to unrelated users/workspaces.

## Cross-workspace attacks

For each table and RPC, change a workspace/request/project ID in the browser
request and confirm RLS rejects access. Include contacts, properties, projects,
assignments, estimates, invoices, business profiles, requests, bids, openings,
applications, resumes, notifications, subscriptions, and payment ledgers.
