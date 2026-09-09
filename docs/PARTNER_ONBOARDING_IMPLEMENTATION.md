# Zentraler Partnerprozess – Bestandsprüfung und Einführung

Stand der Prüfung: 09.09.2026. Dies ist eine Erweiterung, kein Ersatzsystem.

## Verifizierter Ausgangsstand

- Pilot: `Eigenheimverwalter/eigenheimverwalter-pilot-admin`, main `8349793`;
  Supabase `rpniwtshbwjuesoeztyt`. API, Public API und Mail-Health liefern HTTP 200.
- Oberfläche: `eigenheimverwalter-pilot-frontend`; Marketing-Kit in `e70de56` ausgeliefert.
- SalesOS-Quellcode: `Eigenheimverwalter/eigenheimverwalter-Sales`, nicht das
  Veröffentlichungsrepository `eigenheimverwalter-Webseite`.
- Jüngster erfolgreicher Live-Integritätstest: Workflow 34340297477. Enthält Auth,
  Recovery, ACL, 360°-Lesesicht, Referral, private Dokumente und Marketing-Kit.
  Dies ist kein neuer vollständiger Datenbankexport.
- Fachlicher Pilot-Bestand liegt weiterhin im versionierten `portal_runtime_state`.
  Die relationalen `partners`/`partner_postal_licenses` sind nicht als alternative
  vollständige Source of Truth zu behandeln. Bestehende Partner-IDs sind teils Text,
  nicht UUIDs. Keine stillschweigende Umnummerierung oder Doppelanlage.

| Bestand | Wiederverwendung / nötige Änderung |
|---|---|
| Supabase Auth + identity_imports | Identität und Passwortprozess erhalten; verifizierte E-Mail allein darf künftig nicht aktivieren |
| portal-public/partner-basic/register | Vorhandener Self-Service; derzeit Aktivierung beim ersten authentifizierten Request |
| partner-invitations | Token-Hash, Ablauf, Einmalannahme und Mailversand erhalten; derzeit direkte Aktivierung bei Passwortvergabe |
| portal-sales-onboarding | Bestehende serverseitige, idempotente Basic-Brücke erhalten; auf zentralen Dienst erweitern |
| Sales win_lead_and_assign_licenses | Aufgaben-/Versionsprüfungen erhalten; derzeit Lizenzvergabe direkt beim Gewinn |
| Sales basic_partner_onboarding | Vorhandene Versand-Outbox/Statusabgleich weiterverwenden, nicht daneben eine zweite Sales-Outbox bauen |
| lib/sales-os-partner-sync.mjs | Import kann derzeit aktiv setzen; bei Umschaltung zentralen Dienst verwenden |
| /api/partners/{id}/license | Zwei enthaltene PLZ und Lizenzhistorie erhalten; Reservierungen und Onboarding-Gate ergänzen |
| Referral / assignments | Bestätigung und IDs erhalten; drei eigene Immobilien werden aktuell noch nicht begrenzt |
| Partner Basic / Makler / Equipment | Vorhandene Dashboards, Schemafelder, Serviceakte, Dokumente und Kundenumfang behalten |
| roleProfiles / ACL / Support View | Detailrechte ergänzen; kein Schreiben aus Support-Sicht, keine privilegierten Partnerrollen |
| PLZ-Katalog / Opportunities | Vorhandenen Katalog und aktive Lizenzbelegungen verwenden; keine PLZ-Verfügbarkeit aus fehlenden Datensätzen erfinden |
| Dokument-API / Marketing-Kit | Private Storage- und Vorschaukonventionen wiederverwenden; Rechtsdokumente wegen Beweiserhalt getrennt versionieren |
| Audit | Vorhandene audit_events und transaktionale Runtime-Revision verwenden |

## Noch nicht als vorhanden verifiziert

Kein zentraler Onboardingdienst, keine Rechtsannahmen, kein 3-Immobilien-Limit und
kein Stripe-Lebenszyklus im geprüften Pilot-Code. GitHub-Staging enthält Supabase-
Konfiguration, aber keine dort sichtbaren Stripe-Secretnamen. Das beweist nicht,
dass in einem anderen Secretspeicher keine Stripe-Zugänge existieren.

## Einführung ohne harten Schnitt

1. Rechtsdokumentenverwaltung und prüfbare gemeinsame Fachregeln ergänzen.
2. Gemeinsamen transaktionalen Onboardingdienst mit den bestehenden Entry-Routen
   verbinden. Die alten Aktivierungsstellen müssen zusammen umgestellt werden.
3. SalesOS-WON-Dialog, RPC, bestehende Outbox und Rücksynchronisierung gemeinsam
   erweitern. Kein Pilot-Cutover bei noch direkter Sales-Lizenzvergabe.
4. Checkout, verifizierten Webhook, transaktionale PLZ-Reservierung, Ablauf und
   Wiederholung mit Stripe-Testmodus prüfen. Ein Success-Redirect aktiviert nie.
5. Basic-Limit und Upgrade über bestehende Assignments; überzählige bestätigte
   Empfehlungen behalten und nach erfolgreichem Upgrade zulassen.
6. Ende-zu-Ende-Abnahme für alle Quellen, Premium direkt/Upgrade, Double-Clicks,
   zeitgleiche PLZ-Buchung, neue Rechtsversion während Checkout, abgelaufene Links,
   verzögerte/mehrfache Webhooks, fehlgeschlagene Zahlung, Mailfehler und ACL.

## Freischaltungsvoraussetzungen

- Fachlich/rechtlich freigegebene PDF-Dokumente mit Versions- und Gültigkeitsdatum;
  keine generierten Vertragsbedingungen als Ersatz für Freigabe.
- Bestätigte planabhängige Preise/Stripe-Price-IDs, Währung, Zahlungsintervall,
  Laufzeit/Kündigungsregeln; diese werden nicht aus alten UI-Preisen abgeleitet.
- Stripe-Testzugriff und projektspezifisches Webhook-Secret sicher konfiguriert.
- Bestehende aktive Partner werden nicht pauschal gesperrt oder rückwirkend mit
  fingierten Zustimmungen versehen. Neue Eintritte/Upgrades verwenden den neuen
  Ablauf erst nach gemeinsamer, getesteter Umschaltung.
- Die Ergänzung AH–AQ wurde am 09.09.2026 vollständig gelesen. Der vor weiteren
  Änderungen ausgegebene A–P-Bericht ist in `PARTNER_ONBOARDING_PRE_IMPLEMENTATION.md`
  festgehalten. Die dort verlangte Phasenfolge ist verbindlich.

## Ergänzung nach Bestandsprüfung / Phase 2

Der in Phase 1 geprüfte Ausgangsstand oben bleibt als historischer Befund erhalten.
Die Rechtsdokumentenverwaltung wurde mit PR 25 (`09bda8b`) ausgerollt;
Backend-Lauf 34344824582 und Frontend-Lauf 34345088760 waren erfolgreich.
Phase 2 ergänzt jetzt den transaktionalen Zustimmungsschritt, Preview-Audit,
versionsgenaue Wiederverwendung beim Upgrade und ein wiederverwendbares
Zustimmungsformular. Keine automatische Aktivierung durch diesen Schritt.

Die Tabellen und Fachregeln sind nicht mit einem fertig integrierten
`PartnerOnboardingService` gleichzusetzen. Die bestehenden Registrierungswege
werden erst zusammen mit dessen Freigabesperren umgestellt. Das neue
Formular ist deshalb noch nicht an alte Einladungslinks angehängt.

Verbindliche weitere Reihenfolge aus AO: 3 zentraler Dienst, 4 SalesOS-Anbindung,
5 Self-Service, 6 Basic-Limit, 7 PLZ/Stripe/Aktivierung, 8 Regression und Go-live.
Ein grüner Phase-2-Test ist keine Abnahme der noch nicht angebundenen Phasen.

## Phase 3: zentraler Dienst (09.09.2026)

`PartnerOnboardingService` und ein gemeinsamer Supabase-Adapter verwenden die
bestehende Tabelle `partner_onboardings` und die vorhandene Rechtsannahme.
Migration `202609090005` ergänzt ausschließlich Orchestrierungsmetadaten und
private, transaktionale Funktionen. Keine Partner-/User-IDs werden verändert.

- Erzeugung für alle fünf Entry Sources mit eindeutigem Anfrage-Schlüssel;
  SalesOS zusätzlich mit Lead-ID. Wiederholungen erzeugen keine zweite Anmeldung.
- Ein neuer 256-Bit-Linktoken wird nur beim ersten Erzeugen zurückgegeben;
  gespeichert wird ausschließlich SHA-256. Wiederholungen verraten/rotieren den
  alten Token nicht. Die Entry-Adapter müssen die Mailzustellung über ihre
  vorhandene Outbox organisieren; ein verlorener Token erfordert einen späteren
  expliziten Erneuerungsweg, keinen automatischen zweiten Versand.
- Start erfordert die bestätigte Supabase-Identität derselben E-Mail und den
  Token bei erstmaliger Bindung; danach nur diese Identität. Support ausgeschlossen.
- Datenpflege verwendet Versionen gegen verlorene Updates. E-Mail, Plan, Rollen,
  Partner-ID und Status sind kein frei beschreibbarer Datenpayload. Nach der
  Rechtsannahme sind Vertragsdaten in diesem Schritt eingefroren.
- Bestätigter Einladungsversand kann serverseitig mit einer Referenz aus der
  bestehenden Mail-Outbox als `INVITED` verbucht werden. Kein neuer Maildienst.
- Admin Light nutzt bestehende `partners.read`/`partners.write`-Permissions.
- Erstellung, Versandbestätigung, Start, Datenpflege, Ablauf und Abbruch werden
  auditiert, ohne E-Mail-Adressen oder Linktokens im allgemeinen Audit-Log.
- Keine Funktion dieses Bausteins schreibt `ACTIVE`, Zahlungserfolg, Lizenzen,
  Regionen oder den fachlichen Runtime-Bestand. Basic nach Rechtsannahme meldet
  ausdrücklich `ACTIVATION_PENDING`, nicht erfolgreich aktiviert.

Die neuen HTTP-Routen sind serverseitig standardmäßig gesperrt
(`PILOT_PARTNER_ONBOARDING_ENABLED` ist NICHT gesetzt). Sie dürfen erst beim
gemeinsamen Cutover der Entry-Adapter aktiviert werden. Der bestehende Legal-Step
bleibt davon unabhängig. Keinen vorhandenen aktiven Partner rückwirkend sperren.

Neue interne Routen: POST `/partner-onboarding`, GET `/partner-onboarding/{id}`,
POST `/{id}/start`, PATCH `/{id}/data`, POST `/{id}/cancel` jeweils unter
`/partner-onboarding`. SalesOS/CRM sind nicht aus dem Browser wählbar.

Abnahme: Dienst-/HTTP-Tests und isolierte PostgreSQL-Tests einschließlich
Wiederholung, Tokenbindung, abweichender Identität, Versionskonflikt, Ablauf,
Vertragsdaten-Sperre, unverändertem Runtime-Bestand und gesperrter RPC-Ausführung
für `authenticated`. Der Deploy prüft zusätzlich Schema, private RPC und den
geschlossenen Rollout-Schalter ohne neue Geschäftsdaten.

Weiter offen: Phasen 4–8 (SalesOS, öffentliche Registrierung/Einladungen,
Basic-Limit, Checkout/Reservierung/Webhook-Aktivierung und vollständige Abnahme).
Die Stripe-Sandbox-Tarife und 19-%-Steuerrate sind separat in
`PILOT_STRIPE_SANDBOX_CONFIGURATION.md` dokumentiert. Noch kein echter Upsell-Test.

Stripe-Referenzen: https://docs.stripe.com/webhooks und
https://docs.stripe.com/checkout/fulfillment (am 09.09.2026 geprüft).
