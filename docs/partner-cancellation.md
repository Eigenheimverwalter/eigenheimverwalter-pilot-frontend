# Partner cancellation

Existing own-account profile UI, authenticated portal API and identity mapping
are reused. Staff and support impersonation cannot cancel partner contracts.
Basic: one calendar month to month end (Europe/Berlin). Premium: stored notice
and renewal months, default 3 / 12; missing contractual data fails closed.

Two explicit UI stages, two required acknowledgements and typed KÜNDIGEN.
Server recomputes date and persists one immutable receipt per partner under the
runtime row lock. An open checkout must be resolved before cancellation; new
checkout creation is blocked after a cancellation to avoid activation races.

Stripe: existing test-only client; account, application and onboarding ownership
verified. Cancel at actual current period end; never immediately refund/charge.
Late notice waits for the next annual period. The hourly dedicated Vault-token
worker retries pending reconciliation. Non-test or unmapped contracts require
manual billing review; no live Stripe key is introduced by this feature.

An hourly database job disables partner access after the final contract date.
The signed cancellation receipt and audit remain. Owner properties/documents
are NOT cascade-deleted. Ended contracts enter RETENTION_REVIEW_REQUIRED,
visible to Admin Plus/Light under Profile & Security. **Physical erasure is not
automated:** a reviewed record-specific retention schedule is required before
deleting partner identity, business records, backups or shared customer data.
The UI notice describes this distinction, not immediate universal deletion.

Tests: calendar/leap/timezone/deadline, owner ACL, confirmations, Stripe mocks,
isolated PostgreSQL idempotence/end-date/access and owner-data preservation.
Do not cancel the shared heating/broker sandbox accounts merely to test this UI.
