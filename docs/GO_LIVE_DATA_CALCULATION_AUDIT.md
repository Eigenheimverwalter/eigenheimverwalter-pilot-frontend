# Go-live-Prüfung der Berechnungsgrundlagen

Stand: 21.08.2026

## Geprüfte Quellen

1. Aktueller Flutter-App-Stand `20aug2026_version_app.zip` vom Netzlaufwerk.
2. Gelieferter Laravel-Admin-Sourcecode unter `legacy-admin/`.
3. Importierter Datenbank-Mirror `data/production-mirror.json`, erzeugt aus `d03ed1fe.sql.gz`.
4. Berechnungen der laufenden Partner-OS-Testplattform in `server.mjs` und `lib/opportunity-engine.mjs`.

Der aktuelle Flutter-Client verwendet für Phase 4 ein separates Backend unter `https://codeplayjam.com/property-management-phase4/api/v1/`. Die geprüften Endpunkte antworten ohne Authentifizierung korrekt mit HTTP 401. Der Client-Sourcecode enthält den API-Vertrag, aber weder den Backend-Sourcecode noch dessen Datenbankmigrationen. Der vorhandene SQL-Mirror enthält keine Phase-4-Tabellen.

## Gesamturteil

Die Plattform ist **noch nicht als Ganzes go-live-fähig**. Einige Bestandszählungen sind direkt aus vorhandenen Produktivdaten ableitbar. Die wichtigeren Scores und Partner-KPIs sind derzeit jedoch entweder:

- eine Testberechnung auf synthetischen Daten,
- eine eigene Übergangsheuristik anstelle des vorhandenen Phase-4-Scores,
- oder von Ereignissen abhängig, die weder die alte App noch der aktuelle Flutter-Client dauerhaft erfasst.

Diese Werte dürfen produktiv erst angezeigt werden, wenn die Admin-Plattform authentifiziert an das Phase-4-Backend angebunden ist und die fehlenden Partner-/Eventtabellen implementiert sind.

## Berechnungsmatrix

| Berechnung / Anzeige | Felder grundsätzlich vorhanden | Im Produktiv-Mirror befüllt | Aktuelle Testplattform nutzt echte Quelle | Urteil |
| --- | --- | --- | --- | --- |
| Kundenanzahl | `users.id`, Status | 35 Benutzer | ja | nutzbar, sofern Rollen/Testaccounts gefiltert werden |
| Immobilienanzahl | `properties.id`, `user_id` | 40 Immobilien | ja | nutzbar |
| Registrierung seit | `users.created_at` | 35/35 | ja | nutzbar |
| Kundenverteilung nach Region | `properties.zip_code`, teilweise `state` | PLZ 40/40, Bundesland nur 6/40 | teilweise; Bundesland wird heuristisch aus PLZ-Präfix geschätzt | nicht go-live-fähig ohne amtliche PLZ-Bundesland-Tabelle |
| Dokumentanzahl | `property_files.property_id` | 123/123 | ja | als reine Anzahl nutzbar; Dokumenttyp/Vollständigkeit nicht allein daraus ableiten |
| Equipment vorhanden | Legacy-Gewerkstabellen bzw. Phase-4-Equipment | Legacy-Tabellen vorhanden; Phase-4 nicht im Mirror | teilweise | künftig ausschließlich Phase-4-Equipment-API verwenden |
| Datenvollständigkeit Kunde | Personen-, Objekt-, Equipment- und Dokumentfelder | teilweise befüllt | eigene Heuristik | nur als ausdrücklich definierter EHV-Datenqualitätsindex verwendbar, nicht als vorhandener Phase-4-Wert |
| App-Nutzung / Sitzungen | Ereignis, Session-ID, Öffnungszeit | nicht vorhanden | nur neue lokale Testevents | nicht produktiv verfügbar; Telemetrie muss implementiert werden |
| Health-/Equipment-Score | Phase 4: `equipmentScore`, `conditionScore`, `ageScore`, `maintenanceScore`, `documentationScore`, `dataQualityScore` | nicht im SQL-Mirror; über geschützte Phase-4-API vorgesehen | nein, Testplattform berechnet eigenen Score | aktuelles eigenes Scoring ersetzen; Phase-4-Score lesen |
| Kritische Anlagen | Phase-4-`priorityKey` / Equipment-Score | nicht im Mirror | Übergangsheuristik | nicht go-live-fähig bis Phase-4-Anbindung |
| Fachlich verifiziert | Phase-4-`statusSourceKey`, z. B. `verified_by_partner` | nicht im Mirror | lokales Testfeld `verification.status` | Statuskategorie grundsätzlich vorgesehen; belastbarer Prüfer, Zeitpunkt und Auditnachweis müssen backendseitig bestätigt/ergänzt werden |
| Letzte Wartung / Sanierung | Legacy-Datumsfelder und Phase-4-Datumsfelder | vielfach vorhanden | teilweise | erst nach Datumsvalidierung nutzbar |
| Servicedichte | Phase-4-`serviceRecordCount` und Service Records | nicht im Mirror | lokale Test-Serviceakten | nach Phase-4-Anbindung nutzbar |
| Wartungsstatus | Phase-4-`maintenanceScore`, Wartungsdatum und Katalogintervall | nicht im Mirror | eigene feste 12-/24-Monatslogik | feste Testlogik nicht produktiv nutzen; Phase-4-Wert/Katalogintervall übernehmen |
| Top-10-Immobilienranking | mehrere Phase-4-Einzelwerte grundsätzlich vorgesehen | nicht gemeinsam im Mirror | vollständig synthetischer Testbestand | nicht produktiv anbieten, bis Property-Aggregat-API und fachlich freigegebene Gewichtung existieren |
| Partnerkarte | Partneradresse/Lizenz-PLZ | im alten App-/SQL-Bestand nicht vorhanden | synthetische Partnerdaten | benötigt produktive Partner-/Lizenzdatenbank |
| Partner-Score | Reaktions-, Annahme-, Abschluss-, Angebots-, Rechnungs- und Mandatsereignisse | nicht vorhanden | synthetische `partnerCases` | nicht produktiv berechenbar |
| Reaktionszeit | Anfragezeit und erstes tatsächliches Öffnen durch Partner | kein Öffnungsereignis vorhanden | synthetisch | Eventtracking erforderlich |
| Angebotsannahme | Angebot erstellt/gesendet/geöffnet/angenommen | nicht als durchgängiger Workflow vorhanden | synthetisch | Angebotsworkflow und Statushistorie erforderlich |
| Zeit bis Rechnung/Serviceabschluss | Annahme-, Abschluss- und Rechnungszeit | nicht durchgängig vorhanden | synthetisch | Workflow-Events erforderlich |
| Maklermandatquote | Verkaufsbereit → Mandat erteilt | nicht vorhanden | synthetisch | Makler-Workflowtabellen erforderlich |
| Verbrauchsanomalien | `consumption_quantity`, `supplier_type` | 33/37 Mengen | nein | nicht belastbar: Zeitraum, Einheit und normalisierte Verbrauchsart fehlen; historische Messreihe fehlt |
| Verkaufsbereitschaft | Phase-4-Dokumentations-/Vertragswerte teilweise vorhanden | kein persistenter Verkaufsbereitstatus im Mirror | synthetische Verkaufsakten | eigener freigegebener Phase-4-/Maklerstatus erforderlich |
| Opportunity-Relevance | PLZ, Equipment, Phase-4-Scores plus Event | interne Objektdaten teilweise; Triggerdaten fehlen | Testdaten und eigener Health Score | Engine-Struktur nutzbar, Datenadapter noch nicht go-live-fähig |
| Opportunity-Conversion | Push sent/opened/responded, Lead, Assignment, Abschluss | nicht vorhanden | neue Testobjekte | neue produktive Tabellen und App-Endpunkte erforderlich |

## Gemessene Datenqualität im SQL-Mirror

- Benutzer: 35; Name nur 14/35, Telefon 14/35, Adresse/PLZ/Ort jeweils 13/35.
- Immobilien: 40; Adresse und PLZ 40/40, Ort 29/40, Bundesland 6/40, Baujahr 35/40, Wohnfläche und Grundstücksfläche jeweils 36/40.
- Dokumente: 123, jeweils einer Immobilie zugeordnet.
- Legacy-Equipment: Dach 12, Heizung 16, Fenster 6, Fassade 5, Elektro 5, Sanitär 6, Photovoltaik 6.
- Gültige Baujahre: Dach 10/12, Heizung 16/16, Fenster 6/6, Fassade 5/5, Elektro 5/5, Sanitär 5/6, Photovoltaik 6/6.
- Gültige Wartungs-/Sanierungswerte: Dach 12/12, Heizung 10/16, Fenster 6/6, Fassade 5/5, Elektro 5/5, Sanitär 6/6, Photovoltaik 5/6.
- Fehlerhafte Beispiele in aktiven Feldern: Heizung `maintance_date = "211"` oder `"dsds"`, Photovoltaik `maintenance_date = "test"`.
- Verbräuche: 37 Einträge, davon 33 mit Menge. Die Typen sind uneinheitlich deutsch/englisch (`Strom`/`Electricity`, `Wasser`/`Water`) und es fehlt eine belastbare Perioden-/Einheitenhistorie für Anomalien.

## Im aktuellen Phase-4-Client tatsächlich vorgesehene Daten

Der aktuelle App-Client modelliert bereits:

- Equipmentkatalog mit Nutzungsdauer und Wartungsintervall,
- Equipmentinstanzen je Immobilie,
- Baujahr, letztes Wartungs-/Sanierungsjahr und konkrete Datumsfelder,
- dokumentierte Wartung/Sanierung,
- Dokumentationsstatus und Dokumentanzahl,
- Serviceakten und Serviceanzahl,
- Statusquelle,
- Equipment-, Zustands-, Alters-, Wartungs-, Dokumentations- und Datenqualitätsscore,
- Prioritätskennzeichen und Berechnungszeitpunkt,
- serverseitigen Endpunkt zur Score-Neuberechnung.

Damit sind Health Score, Wartungsstatus, Dokumentationsgrad und Servicedichte **konzeptionell aus dem neuen Phase-4-Backend abrufbar**. Die Admin-Testplattform greift darauf aktuell aber noch nicht zu.

## Zwingende Entwicklerarbeiten vor Go-live

### Phase-4-Anbindung

1. Maschinen- oder Admin-Authentifizierung für das Phase-4-Backend bereitstellen.
2. Stabile Admin-Endpunkte für Immobilienliste, Equipment-Score-Summary, Equipmentdetails, Dokumente und Serviceakten bereitstellen.
3. Tenant-/Rollenprüfung serverseitig durchsetzen.
4. Scorewerte ausschließlich lesen; Neuberechnung nur über den vorhandenen Phase-4-Endpunkt auslösen.
5. API-Version und `calculatedAt` speichern/anzeigen, damit veraltete Scores erkennbar sind.

### Datenvalidierung und Migration

1. Legacy-Datumsfelder in echte nullable DATE-Felder migrieren und ungültige Werte in eine Fehlerliste überführen.
2. Schreibfehler wie `maintance_date` über eine kanonische API abfangen.
3. PLZ über eine gepflegte deutsche PLZ-/Gemeinde-/Bundeslandreferenz auflösen.
4. Verbrauchsart, Einheit, Messperiode, Zähler und Messzeitpunkt normalisieren.
5. Bestandsnutzer ohne Namen/Adresse nicht als vollständige aktive Kunden zählen.

### Partner- und Workflowdaten

1. Partner, Gewerkekonto, Lizenz-PLZ, Status, Priorität und Assignment produktiv persistieren.
2. Unveränderliche Workflow-Events für Anfrage, Zustellung, erstes Öffnen, Reaktion, Angebot, Annahme, Abschluss, Rechnung und Mandat implementieren.
3. Serverzeit verwenden; Clientzeiten nur als Zusatzinformation akzeptieren.
4. Push-Zustellung und Push-Öffnung technisch unterscheiden.
5. Fachliche Verifizierung um `verified_by`, `verified_at`, Rolle, Quelle und widerrufbare Historie ergänzen, falls diese Felder im Phase-4-Backend noch fehlen.

### Go-live-Sperren

Bis zur Anbindung dürfen folgende Anzeigen nur als „Testdaten / nicht produktiv“ sichtbar sein: Top-10-Ranking, Partner-Score, Reaktionszeit, Angebotsannahme, Abschlussquote, fachlich verifiziert, Opportunity-Conversion und lokal berechneter Health Score.

## Freigabekriterien

Eine Berechnung wird erst als produktiv freigegeben, wenn:

1. jedes Eingabefeld einer realen API-/Datenbankspalte zugeordnet ist,
2. Datentyp und Nullverhalten validiert sind,
3. Befüllungsquote und Aktualität gemessen werden,
4. Formel, Version und fachlicher Owner dokumentiert sind,
5. Test- und Produktivdaten technisch getrennt sind,
6. fehlende Daten nicht als Null oder positiver Zustand fehlinterpretiert werden,
7. ACL-, Negativ- und Regressionstests bestehen,
8. Ergebniswerte eine eindeutige Datenquelle und einen Berechnungszeitpunkt anzeigen.
