# Integration der App-Version vom 20. August 2026

Referenz: `20aug2026_version_app.zip` (Flutter). Der entpackte Arbeitsstand bleibt lokal und ist von Git ausgeschlossen.

## Verbindliche Quelle

Das Partner OS bildet Phase-4-Daten nicht durch eigene Berechnungen oder parallele Tabellen nach. Für Katalog, Auswahl, Details, Scores, Dokumente und Serviceeinträge bleiben die App-Endpunkte die fachliche Quelle.

| Partner-OS-Bereich | App-Quelle |
|---|---|
| Persönliche Stammdaten | `/get-personalInfo`, `/personalInfo-add` |
| Immobilien | `/property-listing`, `/property-save` |
| Räume | `/roomdata-listing/{property_id}`, `/roomdata-save` |
| Gewerkekatalog | `/equipment/catalog` |
| Gewerke einer Immobilie | `/properties/{propertyId}/equipment` |
| Auswahl aktiver Gewerke | `/properties/{propertyId}/equipment-selection` |
| Gewerkekonfiguration/Felder | `/equipment/{equipmentId}/config` |
| Gewerkedetails | `/property-equipment/{propertyEquipmentId}` |
| Zustands- und Dokumentationsscore | `/properties/{propertyId}/equipment-score-summary` |
| Gewerkedokumente | `/property-equipment/{propertyEquipmentId}/documents` |
| Serviceakte je Gewerk | `/property-equipment/{propertyEquipmentId}/service-records` |
| Verkaufs-/Immobilienwert | `/property/valuation` und Phase-4-Bewertungsendpunkte |

## UI-Abbildung

Die Kundenakte folgt derselben fachlichen Hierarchie wie die App: Immobilie → Gewerk → Zustand, Details, Dokumente und Serviceakte. App-Felddefinitionen werden konfigurationsgetrieben angezeigt. Unbekannte oder neue Felder dürfen dadurch ohne UI-Neuprogrammierung sichtbar werden.

## Sicherheitsgrenzen

- Super Admin darf vollständige Kunden- und Objektdaten lesen.
- Partnerzugriff benötigt zusätzlich Rolle, Gewerk, explizite Objektfreigabe und Gültigkeitszeitraum.
- Das Partner OS verwendet einen serverseitigen Service-Account beziehungsweise einen tokengebundenen Benutzerkontext; App-Tokens werden niemals an den Browser durchgereicht.
- Mutationen werden mit Idempotency-Key und Audit-Eintrag ausgeführt.
- Alte löschende GET-Endpunkte werden nicht direkt aus der Browseroberfläche aufgerufen; ein serverseitiger Adapter kapselt sie bis zur Backend-Bereinigung.
- Offline-Cache und Sync-Queue der App bleiben App-Verantwortung und werden im Partner OS nicht dupliziert.
