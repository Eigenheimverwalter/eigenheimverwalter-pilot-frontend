# Umsetzungsregister – Kooperationspartner Handwerker V2

Stand: 28. August 2026. Referenz ist das bereitgestellte Lasten-/Pflichtenheft. Bestehende Funktionen wie Anlass-/Opportunity Engine, Grundbuch-OCR, Makler- und Basic-Partner-Prozesse bleiben erhalten; sie werden nicht durch dieses Arbeitspaket ersetzt.

## Architekturentscheidungen

- Phase 4 und die EHV-App bleiben Source of Truth für Immobilien-, Equipment- und Health-Score-Daten. Im Partner OS wird keine parallele Berechnungslogik angelegt.
- Operative Handwerkerkonten besitzen genau einen der 16 kanonischen Equipmenttypen aus `lib/equipment-registry.mjs`.
- Objektzugriff erfordert serverseitig eine aktive, gewerkespezifische Zuweisung. Eine passende PLZ allein gewährt keinen Zugriff.
- Eigenkunden werden objekt- und gewerkespezifisch zugeordnet. Ihre Herkunft bleibt über Zuweisungsquelle und künftig zusätzlich über das Herkunftsregister nachvollziehbar; daraus entsteht kein Gebietsschutz.
- Automatisches Routing prüft zentral Partnerstatus, Lifecycle, Pflichtdaten, Equipmenttyp, Vertragsende und exakte Lizenz-PLZ.
- Serviceprozesse folgen einer serverseitigen Statusmaschine. Ablehnung benötigt einen Grund; Abschluss benötigt Dokumentation oder eine protokollierte Ausnahme.

## Lieferstatus nach Arbeitspaket

| Paket | Stand | Umsetzung / Restpunkt vor Go-live |
|---|---|---|
| HW-01 Partner-Datenmodell | Teilweise umgesetzt | Lifecycle und Routing-Prüfung vorhanden. Persistente SQL-Migration folgt beim Abgleich mit der produktiven Laravel-Datenbank. |
| HW-02 Registrierung | Teilweise umgesetzt | Ein-Gewerk-Prinzip, Einladungen und Basic-Bestätigung vorhanden. Produktiver Mailversand und Laravel-Verifikation müssen mit echten Zugangsdaten abgenommen werden. |
| HW-03 Onboarding | Teilweise umgesetzt | Rollen, PLZ, Lizenzdaten und Kontoaktivierung vorhanden. Geführter V2-Onboarding-Assistent bleibt Frontend-Arbeit. |
| HW-04 Routing | Backend-Kern umgesetzt | Zentrale Eignungsprüfung und Diagnose-Endpunkt vorhanden. Opportunity Engine muss im Laravel-Zielsystem auf denselben Service umgestellt werden. |
| HW-05 Eigenkunden | Teilweise umgesetzt | Bestätigungslink, Dublettenprüfung, Objekt-/Gewerkzuweisung und persistente Zuweisungsquelle vorhanden. Separate produktive Herkunftstabelle ist für Laravel vorgesehen. |
| HW-06 Dashboard | Teilweise umgesetzt | Kunden, Service, KPI und Opportunities bestehen. Die neue Prozessgruppierung und SLA-Kacheln müssen noch vollständig in alle Partneransichten übernommen werden. |
| HW-07 Kunden-/Objektliste | Umgesetzt im Testportal | Suche und explizit zugewiesene Akten bestehen; ACL bleibt serverseitig. |
| HW-08 Kundenakte | Teilweise umgesetzt | Immobilien-, Equipment-, Service- und Dokumentdaten bestehen. Informationsarchitektur wird weiter vereinheitlicht. |
| HW-09 Equipmentpflege | Umgesetzt im Testportal | 16 typspezifische Formulare aus dem bereitgestellten App-/Phase-4-Schema; keine generische Heizungsschablone für andere Gewerke. |
| HW-10 Fachliche Verifizierung | Teilweise umgesetzt | Partnerverifizierung und Audit bestehen. Mindestnachweis je Equipmenttyp wird mit den finalen Phase-4-Pflichtfeldern abgeglichen. |
| HW-11 Serviceprozess | Backend-Kern umgesetzt | 13 Statuswerte, erlaubte Übergänge, Ablehnungsgrund, Abschlussnachweis und SLA-Auswertung sind zentral implementiert. |
| HW-12 Dokumente | Teilweise umgesetzt | Mehrfachupload, sichere Dateitypen, Größenlimit, ACL und Einsicht bestehen. Vollständige Versionierung/Soft-Delete-Oberfläche ist noch offen. |
| HW-13 Angebote | Umgesetzt im Kooperationspartner-Modell | Upload, Kundenannahme, Partnerbenachrichtigung, Audit und idempotente Annahme bestehen; Partner Basic bleibt ausgeschlossen. |
| HW-14 Opportunities | Umgesetzt im Testportal | Aggregierte Sicht vor konkreter Freigabe, Score, Cooldown und Folgevorgang bestehen. Routing-Härtung wird in die produktive Job-Pipeline integriert. |
| HW-15 Adminverwaltung | Teilweise umgesetzt | Rollen, Lizenzen, Partnerstatus, PLZ, Zuweisungen, Scoring und Audit bestehen. Vollständiger Mail-/2FA-Support hängt von der produktiven Auth-Infrastruktur ab. |
| HW-16 Sicherheit/Tests | Laufend, Kern umgesetzt | Serverseitige ACL-, IDOR-, Equipment-, Routing-, Status-, Cooldown- und Idempotenztests bestehen. Produktiver Penetrationstest, Backup/Restore-Test und Datenschutz-Freigabe bleiben Go-live-Gates. |

## Go-live-Abhängigkeiten

1. Produktives Laravel-Schema und reale Migrationen gegen einen anonymisierten Datenbank-Snapshot abgleichen.
2. Authentifizierung, E-Mail-Verifikation, Passwort-Reset und optional 2FA mit produktivem Mailserver testen.
3. Private Dokumentablage, Virenscan, signierte Downloads, Aufbewahrung und Löschkonzept auf dem Zielhosting konfigurieren.
4. Vollständigen deutschen PLZ-Katalog, Lizenzverträge und Konfliktregeln importieren.
5. Phase-4-Feldmapping und Rückschreib-API mit den App-Entwicklern vertraglich und technisch fixieren.
6. Datenschutz-Folgenabschätzung, Rollen-/Berechtigungsabnahme, Penetrationstest sowie Backup-/Restore-Probe abschließen.

Ein Go-live darf erst erfolgen, wenn diese externen Abhängigkeiten erfolgreich abgenommen wurden. Die Testplattform kennzeichnet fehlende Quelldaten weiterhin offen und erzeugt keine erfundenen Ersatzwerte.
