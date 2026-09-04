# Setup und Deployment

## Lokale Testumgebung

1. `.env.example` als `.env` kopieren und ein mindestens 32 Zeichen langes zufälliges Session-Geheimnis setzen.
2. `node server.mjs` starten.
3. Tests mit `node --test` ausführen.
4. Für einen frischen Datenstand `data/runtime.json` außerhalb eines laufenden Prozesses entfernen.

## Staging

- Prozess als unprivilegierter Benutzer in einem Container oder Systemdienst betreiben.
- TLS an einem Reverse Proxy terminieren und `APP_ORIGIN` auf die exakte HTTPS-Origin setzen.
- Persistentes Volume nur für Daten und private Uploads verwenden.
- Keine Testzugänge öffentlich bereitstellen; vor einem externen Deployment Konten und Passwörter ersetzen.
- Healthcheck, strukturierte Logs, Backup-/Restore-Test und Alarmierung ergänzen.

### Dauerhafte Test-URL über GitHub und Render

Das Repository enthält eine `render.yaml`. GitHub bleibt die Codequelle; Render betreibt den Node-Webdienst unter HTTPS und deployt neue Commits automatisch.

1. In Render **New > Blueprint** öffnen und das private Repository `Eigenheimverwalter/eigenheimverwalter-pilot-admin` verbinden.
2. Den Branch `codex/makler-workflow-and-platform-update` und die vorhandene `render.yaml` auswählen.
3. Für `STAGING_DEMO_PASSWORD` ein eigenständiges starkes Testpasswort hinterlegen. Dieses Geheimnis gehört niemals ins Repository.
4. Blueprint anwenden und den Healthcheck `/api/health` abwarten.
5. Erwartete Test-URL: `https://eigenheimverwalter-pilot-admin-test.onrender.com`.

Die kostenfreie Render-Stufe besitzt ein ephemeres Dateisystem. `data/runtime.json` und Uploads können bei Neustart oder Deployment verloren gehen. Deshalb dürfen dort ausschließlich synthetische Testdaten liegen. Für persistente Testdaten ist ein kostenpflichtiger Datenträger oder eine externe Datenbank erforderlich. Vor ALL-INKL wird `APP_ORIGIN` auf die endgültige Domain gesetzt und `DATA_FILE` bzw. die Laravel-Datenbank auf persistenten Speicher umgestellt.

## Laravel-Produktionsintegration

Diese Testplattform dient als verifizierbarer fachlicher Referenzstand. Für die Übernahme werden die UI-Flows in Blade/Inertia/Livewire oder die vorhandene Frontend-Schicht übertragen und die API-Routen auf Laravel Controller, Form Requests und Policies gemappt. Vorhandene Models und APIs sind erst nach Sichtung ihrer tatsächlichen Version wiederzuverwenden.

Eine produktive Migration darf erst erfolgen, wenn Datenbankschema, API-Verträge, Auth-Konfiguration, Queue/Jobs, Storage, Phase-4-Schnittstelle und bestehende Rollen-IDs aus dem Originalrepository bekannt sind.
