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

Die GitHub Action `Supabase deploy` benötigt im GitHub-Environment `staging` die Secrets
`SUPABASE_ACCESS_TOKEN` und `SUPABASE_DB_PASSWORD` sowie die Variable
`SUPABASE_PROJECT_REF=yfgieygxlpatmhdskmaa`. Sie überträgt keine SMTP- oder Benutzerpasswörter
in den Quellcode.

## Noch nicht abschalten

Solange nicht sämtliche im Frontend verwendeten `/api/*`-Routen portiert und die Daten
abgeglichen sind, bleibt Render technisch erforderlich. Das ist eine kontrollierte Migration,
keine dauerhafte Doppelarchitektur.
