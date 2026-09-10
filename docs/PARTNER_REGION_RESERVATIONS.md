# Region reservation preparation

Reservations use `portal_runtime_state.partnerRegionReservations`, not a second
partner/licence store. Both the existing admin licence route and future checkout
preparation must validate the same snapshot and persist through revision-checked
`replaceRuntime`. Reload and revalidate after a conflict. Never blindly retry a
write. The shared availability check includes every licensed trade of an active
partner, and live reservations for the same scope.

Internal preparation requires complete verified Premium onboarding and accepted
legal state supplied by the trusted server adapter. Exactly two distinct catalog
postal codes are held for 30 minutes. A retry does not extend that period.
Existing partner/customer identities and licences are unchanged.

This is NOT an exposed reservation or checkout endpoint. Before wiring checkout:

- Load and authorize the current onboarding owner and legal versions server-side.
- Commit reservation through runtime CAS before contacting Stripe.
- Bind an idempotent checkout attempt and persist its checkout ID; uncertain Stripe
  creation must be reconciled before retry, cancellation or expiry.
- Coordinate Stripe expiry with reservation expiry. A paid/late webhook must
  recheck regions and must never activate an occupied territory.
- Never release a payable checkout solely on a browser cancel redirect.
- Reuse the shared check for every region-writing entry source before cutover.

Tests cover gates, scope isolation, existing multi-trade licences, retry expiry,
simulated CAS competition, release and reconciliation requirements. There is no
real Stripe test, persisted reservation, or new partner activation in this phase.
