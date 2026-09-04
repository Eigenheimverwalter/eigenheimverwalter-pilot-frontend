# Equipment- und Partnerrollenmodell V2

## Zielmodell

Das Partner OS verwendet ein zentrales Register mit exakt 16 Equipmenttypen sowie den beiden eigenständigen Partnerkategorien `BROKER` und `WHITE_LABEL`. Ein Partnerzugang ist immer genau einem Typ zugeordnet. Ein Unternehmen mit mehreren Fachbereichen erhält getrennte Zugänge.

## Migration aus dem bisherigen Modell

- Wärmepumpe wird der Equipmentrolle Heizung zugeordnet.
- Enthärtungsanlage wird der Equipmentrolle Sanitär zugeordnet.
- Lüftung und Klimaanlage werden in der Equipmentrolle Lüftung/Klimaanlage zusammengeführt.
- Solarspeicher wird als Batteriespeicher geführt.
- Die bisherige Sonderrolle Energieberatung ist im V2-Modell nicht operativ vorgesehen und wird archiviert. Historische Datensätze bleiben erhalten.
- Bestehende Objektzuweisungen, Equipmentdatensätze, Anlässe und Kampagnen werden auf kanonische IDs umgeschrieben.

## Berechtigungsprinzip

Die serverseitige Prüfung kombiniert Kontostatus, Rollenrecht, Objektzuweisung, Equipmenttyp und optionalen Resource Grant. Eine regionale Ausnahme ersetzt niemals die Gewerkprüfung. Objektweite Ressourcen benötigen eine zusätzliche explizite Freigabe.

Beim Pausieren, Sperren, Vertragsende oder Archivieren eines Partnerkontos werden aktive Sitzungen widerrufen. Bei einem Wechsel des Equipmenttyps werden nicht mehr passende Objektzuweisungen widerrufen und protokolliert.

## Spätere Produktivumschaltung

Der aktuelle JSON-Datenspeicher bleibt Testadapter. Die fachlichen IDs und Zugriffsdienste sind unabhängig davon definiert. Sobald Datenbankstruktur und Zugang des Produktivsystems bereitstehen, wird ein MySQL-/API-Adapter ergänzt und die Alias-Migration einmalig gegen einen anonymisierten Datenbankabzug geprüft. Phase-4-Berechnungen bleiben Source of Truth und werden nicht im Partner OS dupliziert.

## Vor Go-live zwingend offen

- Produktives Schema und Feldmapping gegen einen aktuellen, anonymisierten Datenbankexport verifizieren.
- Datei- und Dokumentreferenzen einschließlich Berechtigungen prüfen.
- E-Mail-, Push- und Queue-Provider konfigurieren.
- Datenschutzfolgeabschätzung, Löschfristen und Auftragsverarbeitungen freigeben.
- Migration zunächst als Dry Run mit Mengen-, Fremdschlüssel- und Stichprobenbericht ausführen.
