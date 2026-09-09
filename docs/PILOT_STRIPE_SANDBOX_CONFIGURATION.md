# Pilot Stripe sandbox configuration

Verified through the authenticated Stripe dashboard on 2026-09-09.
These identifiers are configuration references, not API secrets.

## Scope and status

- Sandbox account: `acct_1Qx4rTFtfWWlBemh` (eigenheimverwalter).
- All changes below were made under `/test/`; no live prices, subscriptions,
  payments, existing webhook destinations or API credentials were changed.
- This is catalogue preparation only. No Pilot checkout/webhook integration,
  partner activation or end-to-end payment test is claimed by this record.
- No test partners or property assignments were created by these actions.

## User-approved annual prices

All prices are EUR, recurring yearly, tax-exclusive. Premium includes two postal
code territories; the additional-territory item is per extra territory, not per
included territory. Entitlements must still be enforced in the Pilot backend.

| Position | Annual net | 19% VAT for one unit | Annual gross for one unit | Stripe product | Stripe price |
| --- | ---: | ---: | ---: | --- | --- |
| Premium Handwerkerpartner | 499.00 | 94.81 | 593.81 | `prod_VEI0OauAjSvkzf` | `price_1UDpQHFtfWWlBemhgdbf5sBw` |
| Premium Maklerpartner | 979.00 | 186.01 | 1165.01 | `prod_VEI1nTISmpoUbU` | `price_1UDpRQFtfWWlBemhkrS5jXvi` |
| Additional PLZ territory | 129.99 | 24.70 | 154.69 | `prod_VEI2Q0jLzPHeVp` | `price_1UDpS6FtfWWlBemh8fF6H94H` |

Each saved price detail was reopened and verified: EUR, yearly, exact amount,
exclusive tax behavior. Each displayed zero active subscriptions.

## Tax reference

- Tax rate: `txr_1UDpT1FtfWWlBemhqncKvQLk`
- Germany, 19%, exclusive, active; created in this sandbox.
- Description: EHV Pilot – Deutschland Umsatzsteuer 19 %, zusätzlich zum Nettopreis (Sandbox).
- This tax rate has NOT yet been attached to a Pilot checkout/subscription.
  Tax-exclusive prices and descriptions alone do not attach a tax rate.
- The sandbox already displays Stripe Tax as enabled; this account-wide setting
  was left unchanged. Implementation must choose the applicable tax mechanism
  explicitly and avoid applying automatic tax and a fixed tax twice. The quoted
  totals above are the user-requested German 19% case, not a global tax rule.

## Preserved existing configuration

- Existing Maklerlizenz (1 Jahr), product `prod_RqqjzQX2rTZbKz`, price
  `price_1Qx92CFtfWWlBemhtu8luUGs`: 979 EUR/year, **inclusive** tax.
  Not reused because its tax behavior conflicts with the confirmed NET amount.
  Existing product and price left unchanged.
- Existing app Premium one-time product `prod_VDkGNwQ2mBSAzO` and all other app
  prices left unchanged.
- Existing webhook `exquisite-legacy` pointing to
  `https://codeplayjam.com/property-management-phase4/api/v1/billing/stripe/webhook`
  left unchanged. No Pilot webhook destination was registered by this task.

## Remaining work before testing the complete upsell

Continue the existing implementation sequence in
`PARTNER_ONBOARDING_IMPLEMENTATION.md`: central onboarding service, SalesOS and
self-service adapters, Basic property limit, then territory reservation / Stripe
checkout / verified webhook activation, followed by end-to-end regression.

Use these sandbox prices through server-side plan configuration. Keep sandbox
and live credentials and IDs separate. A successful checkout redirect must not
activate a partner. Legal, identity, data, payment, territory and licence gates
remain mandatory. No production legal acceptances or successful payments may
be fabricated to prepare test accounts.
