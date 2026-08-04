# All 36 queries

| # | Saved title | Category | Recommendation |
|---:|---|---|---|
| 1 | 21 | ONE_TIME_ADMIN | Archive outside migrations — Same admin action as #7; contains a specific email. |
| 2 | 20 | CANONICAL_MIGRATION | Keep one copy in repo — Exact duplicate of #5. Keep #2, delete #5. |
| 3 | 19 | READ_ONLY_DIAGNOSTIC | Keep as diagnostic — Current corrected diagnostics query. |
| 4 | def delete from here | CANONICAL_MIGRATION | Keep in repo — Latest launch-hardening file; exact copy of the corrected project file. |
| 5 | 18 | EXACT_DUPLICATE | Delete saved snippet after archive — Byte-for-byte equivalent to #2 after whitespace normalization. |
| 6 | 17 | SUPERSEDED_PATCH | Archive only — #2 redefines all three helpers and policies from this recursion patch and adds the later search fixes. |
| 7 | 16 | ONE_TIME_ADMIN_DUPLICATE | Delete or archive outside migrations — Same action as #1, with explanatory comments. |
| 8 | 15 | CANONICAL_MIGRATION | Keep in repo — Marketplace/client accounts, bidding, hiring, feedback and gift-code schema. |
| 9 | 14 | SUPERSEDED_PATCH | Archive only — One-line billing function volatility patch; superseded by #10 and #4. |
| 10 | yardpilot-fix-access-code-function-volatility-v2.sql | VALID_HOTFIX | Preserve in migration history — Corrected volatility patch using existence checks. |
| 11 | yardpilot-fix-access-code-function-volatility.sql | BROKEN_SQL | Delete saved snippet after archive — Contains invalid PostgreSQL syntax: ALTER FUNCTION IF EXISTS. |
| 12 | create-business-card-access-codes.sql | OPTIONAL_SEED | Keep under seeds/examples, not migrations — Creates YARDPILOT30 and FOUNDER365 promotional codes. |
| 13 | yardpilot-subscriptions-paywall-v1.sql | CANONICAL_MIGRATION | Keep in repo — Subscriptions, plan features, limits, paywall and access-code schema. |
| 14 | 13 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Defines get_employee_project_operational_details, which the current frontend calls, but the current repo did not contain its SQL source. |
| 15 | 12 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Fixes moderation trigger permissions; required for authenticated estimate writes. |
| 16 | 11 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Adds multi-job estimates, moderation helpers and later public estimate/invoice RPC definitions. |
| 17 | 10 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Current simplified pricing migration. |
| 18 | 9 | INCOMPLETE_SQL | Delete saved snippet after archive — Only says UPDATE public.invoices and cannot execute. |
| 19 | 8 | READ_ONLY_DIAGNOSTIC | Optional diagnostic archive — Lists Stripe onboarding status for connected workspaces. |
| 20 | 7 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Adds detailed Stripe requirements/status fields used by the newer integration. |
| 21 | 6 | READ_ONLY_DIAGNOSTIC | Delete or keep as incident note — Hard-coded invoice troubleshooting query. |
| 22 | 5 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Stripe Connect schema/RPC configuration not fully represented by the current canonical repo files. |
| 23 | 4 | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Profile and service-role grants/RLS patch used to fix post-login/profile access. |
| 24 | 3 | ONE_TIME_DATA_REPAIR | Archive outside baseline migrations — Promotes each recorded workspace creator's existing membership to owner. |
| 25 | payments | CANONICAL_MIGRATION | Keep in repo — Payments, membership controls and invoice workflow; exact current repo file. |
| 26 | YardPilot lifecycle, workgroup, property workflow, and invoice archive update. | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Defines workgroups, workspace rate, project deletion and invoice/archive workflow RPCs still called by the app. |
| 27 | YardPilot jobs, invoices, contacts, profile, invite, and photo-policy update | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Defines profile update, invoice view and photo policies still used by the app. |
| 28 | yardpilot-polish-workflow.sql | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Defines invite acceptance and workflow polish needed by current app. |
| 29 | yardpilot-workspace-lifecycle | ACTIVE_REQUIRED_SOURCE | Add to repo migration history — Defines company workspace, member management, response/view RPCs still called by the app. |
| 30 | yardpilot-operations-team | FOUNDATIONAL_MIGRATION | Add to repo migration history — Creates workspaces, memberships, invites, assignments, invoices, schedules, follow-ups and job requests. |
| 31 | yardpilot-estimates-properties-darkmode | FOUNDATIONAL_MIGRATION | Add to repo migration history — Creates properties/property photos and secure public estimate foundations. |
| 32 | contacts | FOUNDATIONAL_MIGRATION | Add to repo migration history — Creates and upgrades contacts, which the current frontend directly uses. |
| 33 | null one | SUPERSEDED_PATCH | Archive only — Single NOT NULL patch already incorporated by later estimates/properties migration. |
| 34 | long main | FOUNDATIONAL_MIGRATION | Add to repo migration history — More complete original projects/estimates baseline. |
| 35 | 2 | SUPERSEDED_BASELINE | Archive only — Earlier projects baseline superseded by #34 and later migrations. |
| 36 | 1 | FOUNDATIONAL_MIGRATION | Add to repo migration history — Original profile/company trigger foundation. |
