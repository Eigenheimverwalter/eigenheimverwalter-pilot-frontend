# Central partner invitation entry — phase 5a

This extends the existing portal and shared PartnerOnboardingService. It is not
a second portal, authentication system, mail queue or partner database.

## Implemented

- `/partner-onboarding/{id}#token={proof}` resolves to the dedicated registration
  view on GitHub Pages (including the repository base path) and ALL-INKL.
- Token-protected inspection discloses only invitation display data. UUID alone
  is insufficient. Proof stays in the fragment, not query strings; it is removed
  after identity binding. It is never stored in browser storage or audit logs.
- New invited users set a password through existing Supabase Auth. The mailed
  256-bit invitation proves possession of the fixed recipient's email address.
  The API ignores browser-provided recipient, role and activation fields.
- Existing email identities must sign in. No overwrite/reset of an existing
  password, no duplicate account, no silent role change or disabled-user revival.
- A new profile is `partner_basic / invited`, **not active**. This is an identity
  placeholder, not a paid plan, licence or granted equipment permission.
- Only explicit own-onboarding API requests can authenticate such a pending
  profile. All normal APIs and document routes retain active-profile checks.
- SQL CLAIM atomically prepares the pending profile and reuses the central START
  transition. The verified Auth email must equal the invitation recipient.
- Contact details reuse the existing six editable fields and optimistic version
  check. Email, source, plan and equipment cannot be rewritten by this form.
- Legal UI, private document preview and immutable version acceptances are reused.
  Missing ACTIVE legal documents block acceptance. Acceptance does not activate.
- No runtime user/partner, assignments, licences or payment records are created
  by this entry. Existing IDs and active roles remain unchanged.

## Rollout remains closed

`PILOT_PARTNER_ONBOARDING_ENABLED` must remain unset/false until the coordinated
cutover. The SalesOS database gate remains false too. Nothing in this change
enables either gate, sends a new invitation, accepts a production contract or
charges a customer. A published UI is not an end-to-end release.

Pending: new uninvited self-service identity verification; all legacy entry
cutovers; Basic three-confirmed-property limit; Premium region reservation,
checkout, verified payment webhook, licence activation; renewal/cancellation;
source-status reconciliation and the full end-to-end acceptance test.

## Approved commercial input for the billing phase

User decisions recorded 2026-09-09:

- Initial Premium term: 12 months.
- Automatic renewal: another 12 months.
- Ordinary cancellation notice: three months before the current term ends.
- Cancellation by the partner in the portal or manually by authorised Admin Light
  / Admin Plus. Support viewing alone must never authorise cancellation.
- Record request timestamp, actor, current period end, notice deadline and the
  effective termination date in audit history; no deletion of customer records.
- Apply only to the intended B2B cooperation and approved contract version.
  Final legal wording/review remains pending. Do not apply these rules to consumer
  contracts, retroactively migrate old contracts, or infer acceptance.
- These are implementation inputs, not already configured Stripe cancellation
  logic. The sandbox catalogue and prices remain as documented separately.
- The user will upload revised legal documents through the existing admin UI.
  Upload alone is not approval/activation. Keep legal release requirements intact.

## Verification

Node tests exercise the actual public HTTP adapter, password validation, trusted
identity derivation, safe failures, pending-profile auth isolation, URL base paths
and markup escaping. Isolated PostgreSQL executes the full migration and checks
wrong/expired tokens, wrong/unverified email, repeat claims, stale updates,
existing-account preservation, legal acceptance while still pending, disabled
access and private RPC privileges. No production fixtures are used.

Browser verification uses a loopback-only fixture with no real Supabase calls:
existing-account login, prefilled company form, save-to-legal transition and
disabled acceptance for missing legal documents. Mobile width 390px uses one
column with no horizontal overflow. Do not count that as a live Auth/payment test.
