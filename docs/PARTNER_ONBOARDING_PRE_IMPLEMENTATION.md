# PRE-IMPLEMENTATION REPORT – A–P

09.09.2026. Vor den Änderungen zur Ergänzung AH–AQ im Gespräch ausgegeben.
Referenz: Pilot main `09bda8b`, SalesOS-Quellrepository
`Eigenheimverwalter/eigenheimverwalter-Sales`. Keine Arbeit am alten Renderbetrieb.

| Bereich | Befund / Vorgehen |
|---|---|
| A SalesOS WON | `win_lead_and_assign_licenses`, vorhandener Pflichtdialog und Basic-Outbox bestehen. Direkte Partner-/Lizenzanlage durch zentralen Onboarding-Aufruf ersetzen, Aufgaben-/Versionsprüfungen behalten. |
| B Partner Creation | `portal-public/partner-basic/register`, `portal-api` E-Mail-Aktivierung, Adminanlage und `lib/sales-os-partner-sync.mjs` bestehen. Alle Aktivierungsstellen beim gemeinsamen Cutover sperren. |
| C Invitations | Bestehende Partner-/Basic-Brücke mit Hash, Ablauf, Einmalannahme und Mailkanälen weiterverwenden. Alte Einladung aktiviert derzeit bei Passwortvergabe. |
| D Lizenz | `lib/partner-license.mjs`, Edge-Pendant und `/api/partners/{id}/license`; zwei PLZ und Historie vorhanden. Noch kein Stripe- oder Checkout-Reservierungsmodell. |
| E Region | Katalog, Gewerk und aktive Lizenzbelegung verwenden. Eigene Kunden bleiben regionsunabhängig; Schutz nur für EHV-generierte Chancen. |
| F Files | Private Dokument-API, Marketing-Kit-Validierung, PDF-Vorschau und kurze Signaturen vorhanden; Rechtsdokumentverwaltung nach PR 25 vorhanden. |
| G Functions | Pilot: portal-api, portal-public, document-api, portal-mail, portal-sales-onboarding. Sales: sales-integrations und codex-sales. Brücke hat eigenen Deployweg; bei Cutover berücksichtigen. |
| H Tabellen | portal_users, identity_imports, organizations/members, customers, properties, assignments, documents, audit_events, trades, partners, partner_postal_licenses, equipment, service_cases/records, opportunities/trigger sowie portal_runtime_state. Neue legal_documents, legal_document_versions, legal_acceptances und partner_onboardings bestehen bereits. Runtime bleibt aktuelle fachliche Source of Truth. |
| I RLS | Vorhandene Benutzer-/Objektgrenzen erhalten. Legal-/Onboardingtabellen für anon/authenticated vollständig gesperrt, nur kontrollierte Edge-Aufrufe. Support darf keine Zustimmung stellvertretend geben. |
| J Neue Tabellen | Noch erforderlich: kurzlebige PLZ-Reservierungen, eindeutige Checkout-/Subscription-/Webhook-Zuordnungen. Vorhandene Outbox, Partner und Lizenzdaten nicht duplizieren. |
| K APIs | Zentraler Onboardingdienst mit Entry-Adaptern, eigener Legal-Step, Checkout und verifizierter Stripe-Webhook. Preise und erlaubte Anforderungen ausschließlich serverseitig. |
| L Migration | Additive Migrationen, Text-Partner-IDs behalten, keine Neuvergabe beim Upgrade, keine fingierten Bestandszustimmungen, keine automatische Rückstufung alter Partner. |
| M Security | Alt-Aktivierungswege, IDOR, neue Vertragsversion während Zustimmung/Checkout, doppelte Webhooks und PLZ-Rennen. Malware-Prüfung vorbereiten; realer Scanner fehlt. IP-Vertrauensgrenze nicht ungeprüft aus Forwarded-Header ableiten. |
| N Regression | Login/Recovery, WON/Tasks, Invitations, Referral, Equipment, Serviceakte, Makler, Regionen, Opportunities, 360°, Support, Audit, Marketing, Produktivspiegel prüfen. Phase-4-Daten nicht ersetzen. |
| O Rollback | Neue Entry-/Checkoutwege abschaltbar, Nachweise/Partner-/Zahlungsdaten erhalten, Schema vorwärts korrigieren. Kein Rollback auf ungesicherte Alt-Aktivierung nach Cutover. UI nur mit kompatiblem Backend zurückrollen. |
| P Offen | Freigegebene PDFs/Bestätigungstexte, Premiumpreise/Price-IDs, Laufzeit/Steuern/Kündigung, Stripe-Test-/Live-Secrets, Bestandsschutz, Wiederzustimmung und Zahlungsausfall-/Regionsfreigaberegeln, Aufbewahrung und Malware-Anbieter. Nicht erfinden. |

## Abnahmegrenzen

Aktuell kann Phase 2 unabhängig getestet werden. Reale Vertragsannahmen oder
Zahlungen werden nicht als Testdaten in Produktion erzeugt. Die Phasen 3–8 sind
nicht durch die isolierten Fachregeltests als umgesetzt oder live zu behandeln.

Die Themen in P blockieren die endgültige Freischaltung, nicht die sichere
Implementierung der folgenden Bausteine. Keine erneute pauschale Go-Abfrage nötig.
