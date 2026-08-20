# Sicherheit und Datenschutz

## Bereits umgesetzt

- Passwörter mit scrypt und individuellem Salt
- zufällige, serverseitig gespeicherte Sitzungen; HttpOnly-, SameSite- und bei HTTPS Secure-Cookie
- CSRF-Token für alle schreibenden Requests
- Login-Rate-Limit
- restriktive Security Header einschließlich CSP, Frame-Schutz, MIME-Sniffing-Schutz und Referrer-Policy
- serverseitige Permission Gates und objektbezogene Zugriffspolicies
- Eingabebegrenzung, Feldbereinigung und Payload-Limit
- Auditierung von Loginfehlern, Zugriffsausschlüssen und Änderungen
- kein Geheimnis im Repository; `.env.example` enthält nur Platzhalter

## Vor Produktion zwingend

1. Bestehenden Identity Provider beziehungsweise Laravel Auth verwenden, MFA für interne Rollen und optional Passkeys einführen.
2. Sessions in Redis/DB mit Rotation, Widerruf, Geräteübersicht und Inaktivitätsablauf speichern.
3. PostgreSQL/MySQL mit Transaktionen, Constraints, Soft-Delete-Konzept und verschlüsselten Backups verwenden.
4. Dokumente ausschließlich in privatem Object Storage speichern; Dateityp serverseitig erkennen, Malware scannen, Metadaten entfernen und kurzlebige Download-URLs verwenden.
5. Audit-Log manipulationserschwerend gestalten, in ein SIEM ausleiten und Aufbewahrungsfristen definieren.
6. AV-Vertrag, TOMs, Löschkonzept, Verzeichnis von Verarbeitungstätigkeiten, Zweck-/Einwilligungsmodell und Betroffenenprozesse juristisch abnehmen lassen.
7. Secrets über einen Secret Manager verwalten. TLS/HSTS, WAF, zentrale Rate Limits, Monitoring und Alarmierung aktivieren.
8. SAST, Dependency-/Secret-Scan, DAST, Penetrationstest und Datenschutz-Folgenabschätzung vor Produktivbetrieb durchführen.

## Datenschutzprinzipien

Datensparsamkeit und Need-to-know sind Teil der Zugriffspolicy: Ein Partner sieht nicht alle Kunden in einer PLZ, sondern ausschließlich explizit zugewiesene Objekte. Zeitliche Freigaben enden automatisch. Exporte müssen in der Produktivfassung ebenfalls protokolliert, mit Zweck versehen und gegebenenfalls wassergezeichnet werden.

## Responsible Disclosure

Sicherheitsfunde nicht in öffentliche Issues schreiben. Vor Veröffentlichung muss eine interne Kontaktadresse für vertrauliche Meldungen ergänzt werden.
