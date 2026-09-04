# Migration von Render zu GitHub + Supabase

## Ziel

- GitHub: privater Quellcode, CI/CD und statisches Frontend.
- Supabase: Auth, PostgreSQL, private Storage-Buckets und Edge Functions.
- ALL-INKL: spätere Hauptdomain; optional zusätzlicher verschlüsselter Dokumentenspeicher.
- Render: erst nach Datenabgleich und Abnahme deaktivieren.

## Kein Big-Bang-Wechsel

Der aktuelle Node-Server speichert Fachzustand in `DATA_FILE` und Uploads lokal. Auf Render
liegt `DATA_FILE` unter `/tmp`; dieser Zustand ist nicht dauerhaft. Ein sofortiges Abschalten
würde bestehende Testdaten, Uploads und einen Großteil der API-Routen abschneiden.

## Reihenfolge

1. Migration `202609030001_portal_core.sql` in Supabase anwenden.
2. Bestehende Identitäten nach Supabase Auth überführen und Rollen zuordnen.
3. Partner, Kunden, Immobilien und Zuweisungen mit stabilen Quell-IDs importieren.
4. Dokumente mit SHA-256-Prüfsumme in private Buckets übertragen; Metadaten verknüpfen.
5. API-Module als Edge Functions portieren und positive/negative ACL-Tests ausführen.
6. Frontend auf die Edge-Function-Basis-URL umstellen und über GitHub Pages/Actions testen.
7. Zeilenanzahl, Prüfsummen und Stichproben fachlich abnehmen.
8. DNS auf das neue Frontend umstellen; Render zunächst read-only halten und anschließend löschen.

## Reproduzierbarer Datenabgleich

`npm run migration:export` erzeugt keine neue Kundendatenbasis, sondern ein Manifest des
vorhandenen Runtime-Stands mit SHA-256-Prüfsummen. `npm run migration:import` übernimmt diese
Datensätze idempotent in `legacy_portal_records` und Dateien in private Storage-Buckets. Das
Service-Role-Secret darf dabei nur lokal beziehungsweise als geschütztes CI-Secret existieren.

Der Workflow `Pilot-Daten nach Supabase importieren` wird absichtlich nur manuell und mit der
Bestätigung `PILOT-IMPORT` ausgeführt. Nach dem Import vergleicht er die exakte Anzahl der
Legacy-Datensätze und archiviert ausschließlich die Prüfsummen-Manifeste, niemals die Nutzdaten.
Der Altbestand wird über `/api/migration/export` mit einem mindestens 48 Zeichen langen,
einmaligen Bearer-Token abgerufen. Passwort-Hashes, Reset- und Authentifizierungs-Tokens werden
serverseitig aus dem Export entfernt. Nach erfolgreicher Migration wird der Token widerrufen.

Die GitHub Action `Supabase deploy` benötigt im GitHub-Environment `staging` die Secrets
`SUPABASE_ACCESS_TOKEN` und `SUPABASE_DB_PASSWORD`. Die öffentliche Projekt-Referenz
`rpniwtshbwjuesoeztyt` ist versionskontrolliert; die Referenz der Sales OS darf hier
nicht verwendet werden. Die Action überträgt keine SMTP- oder Benutzerpasswörter
in den Quellcode.

## Strikte Projekttrennung

Das Pilotportal erhält ein eigenes Supabase-Projekt. Insbesondere dürfen die Werte für
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Datenbankpasswort,
JWT-Konfiguration, Storage und Edge-Function-Secrets nicht aus der Sales OS übernommen werden.
Nur ausdrücklich definierte fachliche Schnittstellen verbinden beide Projekte; ein gemeinsamer
Service-Role-Key oder direkter Tabellenzugriff ist unzulässig.

## Noch nicht abschalten

Solange nicht sämtliche im Frontend verwendeten `/api/*`-Routen portiert und die Daten
abgeglichen sind, bleibt Render technisch erforderlich. Das ist eine kontrollierte Migration,
keine dauerhafte Doppelarchitektur.
