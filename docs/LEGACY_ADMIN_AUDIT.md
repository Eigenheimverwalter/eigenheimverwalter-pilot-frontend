# Bestandsanalyse: eigenheimverwalter-Pilot Admin

Stand: 20. August 2026. Grundlage ist der bereitgestellte Laravel-9-Quellcode. Kundendokumente, Zertifikate und `.env`-Inhalte aus dem Archiv wurden bewusst nicht in dieses Repository übernommen.

## Wiederverwendbare Grundlagen

- Rollen und einzelne Berechtigungen (`Roles`, `RolePermissions`)
- Zuordnung mehrerer Lizenz-Postleitzahlen zu Benutzern
- vorhandene Kunden-, Objekt-, Partner- und Stammdatenmodelle
- bestehende Fachmodule und API-Anknüpfungspunkte

## Vor produktiver Übernahme zu beheben

- Granulare Rechte werden überwiegend in Controllern oder Ansichten geprüft; verbindliche Policies/Middleware fehlen.
- Rollen 1 und 2 erhalten im Helper pauschal Vollzugriff; der gespeicherte Aktivstatus eines Rechts wird nicht zuverlässig ausgewertet.
- Mehrere löschende oder statusändernde Aktionen sind als GET-Routen umgesetzt.
- Uploads liegen teilweise direkt im öffentlichen Web-Verzeichnis; sichere Ablage, Typprüfung und Virenscan fehlen.
- Breite Massenzuweisungen über Request-Gesamtdaten erhöhen das Risiko unerlaubter Feldänderungen.
- Direkter Mailversand, hart codierte Empfänger und uneinheitliche Fehlerbehandlung müssen durch Queue, Konfiguration und Monitoring ersetzt werden.
- Das Archiv enthält produktionsnahe Geheimnisse und Kundendokumente. Diese dürfen niemals in Git übernommen werden; betroffene Schlüssel sollten rotiert werden.

## Zielarchitektur

Laravel bleibt fachliche Basis. Zugriff wird in vier Schichten erzwungen: authentifizierte Route, Permission-Middleware, objektbezogene Policy und Datenbank-Constraint. Explizite Objektfreigaben haben einen dokumentierten Zeitraum und können eine regionale Lizenzregel nur durch eine auditierte Admin-Ausnahme übersteuern. Phase 4 bleibt die Quelle für Berechnungen; das Portal speichert nur Referenzen und freigegebene Snapshots.
