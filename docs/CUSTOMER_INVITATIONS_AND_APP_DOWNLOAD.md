# Customer invitations and app download

Invitations from partners, admin and the public QR entry share the email
guard. Trimmed, case-insensitive addresses are checked against runtime users,
customers, partners, invitations, referrals, production-mirror customers/users,
Supabase Auth, imported identities, relational partners and imported records.
An expired invitation still counts as previously recorded. No attribution is
changed and no existing records are deleted. Mail is sent only after the
revision-guarded database transaction commits. The private RPC rechecks while
holding the existing runtime row lock; duplicate and stale writes fail closed.
No anonymous directory lookup endpoint is provided.

Registration through an existing invitation skips only that invitation itself.
It still checks for another account/customer before creating Auth. Explicit
registration confirmation is checked on the server as well as in the form.

## Mobile application boundary

Portal Auth is not yet proven to be the native application's identity backend.
Download buttons must not promise that the Portal password works in the mobile
app. Recommendation acceptance is not a completed native-app registration.

Verified listings (2026-09-09):
- https://apps.apple.com/de/app/eigenheimverwalter/id6449584443
- https://play.google.com/store/apps/details?id=com.semi.eigenheimverwalter

The registration and separate app-download pages include Apple's Smart App
Banner (`app-id=6449584443`, deliberately no token-bearing `app-argument`). In
supported Safari it can offer Open for an installed app. No silent install
detection, forced redirects, made-up URI scheme or unverified Android intent is
used. Android automatic opening still needs verified App Links and native-app
configuration; the domain association files were not present at inspection.
Store badges work independently on both platforms. Links send no customer data.

Official unmodified German badge artwork, downloaded 2026-09-09:
- https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/de-de?size=250x83
- https://play.google.com/intl/en_us/badges/static/images/badges/de_badge_web_generic.png

Badge images are served locally, without third-party image requests on the
customer confirmation page. Smart App Banner display and installed-app launch
require a physical-device check; HTTP and unit checks do not establish that.
