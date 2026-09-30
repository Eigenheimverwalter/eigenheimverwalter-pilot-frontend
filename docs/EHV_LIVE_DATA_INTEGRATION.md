# EHV-Live-Datenintegration

## Zielbild

Die Flutter-App und das Laravel-Backend unter `api.eigenheimverwalter.de` bleiben die fachliche Source of Truth. Das Property XRM erhält einen serverseitig erzeugten, vertraulichen Produktionsspiegel. Browser und mobile App erhalten niemals den Export- oder Supabase-Service-Schlüssel.

## Datenfluss

1. Laravel stellt `GET /api/migration/production-export` bereit.
2. Der Endpunkt akzeptiert ausschließlich einen eigenen Bearer-Token aus `PILOT_MIGRATION_EXPORT_TOKEN`, ist rate-limitiert und liefert `Cache-Control: no-store`.
3. Passwort-Hashes, Sitzungs-, Push-, API- und sonstige Geheimnisse werden vor dem Export entfernt.
4. Der vorhandene GitHub-Workflow ruft den Export über die Secrets `PILOT_MIGRATION_EXPORT_URL` und `PILOT_MIGRATION_EXPORT_TOKEN` ab.
5. `scripts/import-production-mirror.mjs` fügt den Spiegel revisionsgesichert in `portal_runtime_state` ein. Die bestehenden Supabase-RLS- und Portal-ACL-Regeln begrenzen anschließend die Sichtbarkeit.

## Produktivkonfiguration

- Laravel: ein zufälliger, eigenständiger Maschinen-Token mit mindestens 32 Byte Entropie.
- GitHub-Environment `staging`: Export-URL und derselbe Token als Secrets.
- Supabase-Service-Role bleibt ausschließlich im GitHub-Environment und in vertrauenswürdigen Serverprozessen.
- Weder Export-Token noch Service-Role dürfen in Flutter, Browserassets, Repository oder Logs erscheinen.

## Inbetriebnahme

1. Laravel-Dateien deployen und Konfigurationscache erneuern.
2. Ohne Token und mit falschem Token jeweils HTTP 401 prüfen.
3. Mit Token Exportstruktur und Tabellenzähler prüfen, ohne Nutzdaten zu protokollieren.
4. Workflow zunächst manuell ausführen und Kunden-/Objektanzahlen gegen das Laravel-System abgleichen.
5. Erst danach einen zeitgesteuerten Abruf aktivieren. Fehler dürfen den letzten gültigen Spiegel nicht überschreiben.

Der Export ist zunächst lesend. Änderungen aus dem Property XRM werden nicht still in Laravel zurückgeschrieben; dafür sind gesonderte, fachlich autorisierte Write-APIs erforderlich.
