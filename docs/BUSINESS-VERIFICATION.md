# Business Registration Verification

The marketplace profile now stores:

```text
entity_type
legal_business_name
formation_state
registry_number
verification_status
verified_at
verification_source
```

Use the wording **Registration verified**, not **Verified LLC**, because valid
businesses may be corporations, sole proprietorships, partnerships, assumed
business names, or LLCs.

Platform admins can call `set_marketplace_business_verification(...)` after a
manual Secretary of State registry review. Record the registry URL/source and
current status. Never represent this badge as verification of quality, licensing,
insurance, safety, background, tax compliance, or suitability.

Do not collect an EIN merely for a marketplace badge. EIN and tax-document
collection should wait for a defined legal/tax workflow and professional review.
