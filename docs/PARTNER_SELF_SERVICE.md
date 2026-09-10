# Phase 5b – gated self-service entry

Status: implemented behind `PILOT_PARTNER_ONBOARDING_ENABLED`, which remains closed.
This is NOT release of paid onboarding or legacy activation cutover.

## Journey

`/partner-onboarding/` is the new public start. It requests a Supabase mailbox
verification link through the existing `partner` mail channel. Only the recipient
receives the link; the HTTP response never contains it. Existing imported,
active or disabled accounts do not receive a new registration link. The public
response does not disclose account existence. They use their existing login.

The confirmed Supabase identity obtains an `invited / partner_basic` profile
limited to onboarding. The placeholder role is not a Basic or Premium licence.
A new identity must choose a password, then Basic/Premium and the partner type,
with the existing equipment catalog for crafts. The existing central CREATE,
START, SAVE_DATA and legal steps are reused. No alternate onboarding table,
runtime partner, licence, payment, consent or ACTIVE state is created.

Email is always taken from verified Auth, never from posted prefilled data.
Existing open, owned onboarding resumes; an unclaimed invitation requires its
original proof. Creation keys and the existing open-email uniqueness guard
prevent duplicate onboarding. Imported partner upgrades retain their existing
central service path and are not converted into new identities here.

## Auth subtlety

Supabase's generateLink implementation generates a random initial password for
new magic-link identities. A nonempty encrypted password is therefore not proof
that the person chose one. See the official implementation:
https://github.com/supabase/auth/blob/master/internal/api/mail.go

The new pending profile has `onboarding_password_required=true`. Only a real
encrypted-password change on a verified Auth identity clears this flag through
a restricted database trigger. The central CREATE guard checks it server-side.
No Auth hashes are copied, returned or logged. Existing profiles default false
and their roles, passwords and activation remain unchanged.

## Abuse and isolation

The public adapter shares the existing origin allowlist, 8 KiB streaming body
limit, safe error projection, rollout gate and Support denial with invitation
entry. The redirect is derived server-side from the allowed portal origin,
including the Pages repository base path; a body redirect is ignored.

Atomic service-only mail limits allow at most three requests per mailbox per
hour, with a one-minute interval, and 100 globally per hour. The short-lived
ledger stores hashes only, not email/IP/token/password; rows older than 24h are
removed opportunistically. This is a throttle, not another outbox. Mail failures
do not delete Auth identities or report successful delivery. A retry after the
interval uses a new provider proof. The hard global cap fails closed. Before
wide public release, monitor abuse and decide whether CAPTCHA is required.

## Validation and release boundary

Unit coverage includes origin/gate/body checks, sender selection, token privacy,
trusted Auth ownership, source restrictions and UI choices. Actual additive SQL
runs in isolated PostgreSQL with password-change trigger, missing/unverified/
disabled identities, Basic/Premium creation, resume, duplicate ownership, mail
throttles and RPC/table permissions. Browser tests use a loopback-only fixture;
they are not evidence of real confirmation-mail delivery or Stripe payment.

The deployment smoke is read-only and asserts the new private RPC and closed
public gate. Published frontend does not enable the gate. Remaining release
dependencies: Basic three-property funnel, region reservation, Stripe Checkout
and verified webhook, activation, cancellation/renewal, approved ACTIVE legal
documents, coordinated Sales/admin/legacy entry cutover and end-to-end tests.
