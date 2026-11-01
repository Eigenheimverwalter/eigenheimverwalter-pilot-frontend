# ALL-INKL cutover release gate

This document is the binding release gate for the Property XRM / Partner OS.

Public preflight command: `node scripts/preflight-allinkl-production.mjs`. A production release remains blocked until every line is `PASS`.

## Non-negotiable production rules

- `api.eigenheimverwalter.de` and the ALL-INKL databases are the only production data sources.
- Supabase must not be queried, mirrored, synchronized, or used as a fallback.
- A production release is an immutable, annotated set of files. Individual file uploads are forbidden.
- Local tests are necessary but never constitute production approval.
- The public release may only be switched after all production checks below pass.

## Approved UI baseline

- UI baseline: Git commit `4656afc` (2026-10-16 before the 19:22 merge).
- Required additions: complete ALL-INKL data paths and the valuation embedded directly in the customer sales file.
- The 19:22 mixed merge and later individual FTP uploads are not an approved release baseline.

## Required production data-path checks

- [ ] Admin login and logout use ALL-INKL only.
- [ ] Dashboard uses ALL-INKL only and renders the approved navigation/version.
- [ ] Customer counts distinguish raw accounts, active customers, and incomplete registrations.
- [ ] Customer sorting confirms the newest ALL-INKL registration.
- [ ] 360-degree customer view loads personal data and every assigned property.
- [ ] Property master data loads from ALL-INKL.
- [ ] Equipment/trades load from ALL-INKL.
- [ ] Service records load from ALL-INKL.
- [ ] Documents and authorization-controlled downloads load from ALL-INKL.
- [ ] Contracts and consumption data load from ALL-INKL.
- [ ] Sales file and inline valuation load from ALL-INKL.
- [ ] Partner accounts, roles, licences, trades, regions and postal scopes use ALL-INKL.
- [ ] Service requests, orders, routing and statuses use ALL-INKL.
- [ ] Audit log and authorization checks use ALL-INKL.
- [ ] No production HTML/JS/PHP response contains a Supabase URL or key.
- [ ] Browser network inspection contains no request to a Supabase domain.
- [ ] Cache-busted public files match the annotated release hashes.

## Release evidence

The release is not approved until this section contains:

- annotated Git tag/commit;
- SHA-256 hashes of every deployed release file;
- production test timestamp;
- tested administrator account;
- tested customer/account IDs;
- response status and source confirmation for every data path above;
- rollback archive and rollback procedure.

