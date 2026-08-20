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

## Laravel-Produktionsintegration

Diese Testplattform dient als verifizierbarer fachlicher Referenzstand. Für die Übernahme werden die UI-Flows in Blade/Inertia/Livewire oder die vorhandene Frontend-Schicht übertragen und die API-Routen auf Laravel Controller, Form Requests und Policies gemappt. Vorhandene Models und APIs sind erst nach Sichtung ihrer tatsächlichen Version wiederzuverwenden.

Eine produktive Migration darf erst erfolgen, wenn Datenbankschema, API-Verträge, Auth-Konfiguration, Queue/Jobs, Storage, Phase-4-Schnittstelle und bestehende Rollen-IDs aus dem Originalrepository bekannt sind.
