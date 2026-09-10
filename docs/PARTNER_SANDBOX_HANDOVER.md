# Partner sandbox and explicit production handover

User authorization: prepare fictional partner testing. Production activation is
NOT authorized until the user explicitly requests go-live. No automatic switch.

## Implemented locally

`scripts/partner-sandbox-fixtures.mjs` generates isolated runtime fixtures for
Basic craft (two properties), Basic craft (three), and Basic broker (three).
Each has one additional pending recommendation. Uses the existing confirmation
domain logic; no second referral implementation. No fake Premium payment or legal
acceptance. Every seeded record has a run ID, marker and explicit manifest entry.

The cleanup planner is dry-run only. It requires an exact ID and marker match and
blocks on references from outside the inventory. It never deletes audit or legal
evidence, Auth users, storage objects, Stripe objects, or runtime rows. New test
activity requires inventory reconciliation before deletion.

## Still required before user login testing

- Provision identities safely in a sandbox and deliver passwords without logs.
- Persist marked fixture data via the existing revision-checked runtime API.
- Keep all new test-created rows associated with the run; preserve real records.
- Finish sandbox checkout, webhook verification, reservation and activation.
- Verify test-only Stripe credentials and account; never fall back to live keys.
- Use clearly marked test legal documents in sandbox only, not real acceptances.

## Go-live checklist, only on explicit user instruction

1. Freeze new test activity; reconcile pending checkout sessions/subscriptions.
2. Review exact test record inventory and external references; export a backup.
3. Remove only approved fixtures and Auth/storage targets; preserve required audit
   and contractual evidence. Stripe test data is not production billing data.
4. Configure distinct live Stripe products/prices, credentials and webhook.
5. Verify approved legal documents, tax configuration, all entry-source gates,
   production smoke tests and rollback controls.
6. Activate production deliberately. Deleting test accounts alone does not make
   the incomplete onboarding flow ready for live use.

Status: no login accounts provisioned, no Stripe charges, no remote data deleted.
