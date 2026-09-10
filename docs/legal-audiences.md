# Contract audiences

The existing legal document entity/RPC, PDF store, review permissions and consent
history are reused. New uploads require BASIC, PREMIUM_EQUIPMENT or PREMIUM_BROKER.
TERMS, PRIVACY, PRICE_SHEET and CONDITIONS are available for each audience.
One active version per document type + audience (plus isolated sandbox scope).
Audience is immutable; a misclassified upload needs a new document version.

Existing documents remain LEGACY and existing acceptances remain immutable. No
production document is silently reclassified or reaccepted. Admin must upload and
approve/activate the correct versions. Legacy production documents are not a
fallback for new onboardings. Existing isolated sandbox PDFs retain their scope.

Account library uses runtime partner plan/trade, not the ACL role or request
parameters. Only current ACTIVE audience documents are listed and privately
signed. Previously accepted documents remain separately in the evidence archive.
During upgrade, the central legal step uses the requested plan + verified partner
type; existing referral-only partners cannot read Premium commercial documents.
Active matching price/conditions PDFs join mandatory TERMS/PRIVACY in that step.
No prices, commercial terms, legal copy or new PDF content are fabricated.
