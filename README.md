# eigenheimverwalter Pilot – Partner OS

Lauffähige Testplattform für die künftige Admin- und Partnerwelt von Eigenheimverwalter. Sie demonstriert die fachlichen Abläufe und die Zugriffskontrolle unabhängig vom nicht mitgelieferten Produktionssystem.

## Schnellstart

Voraussetzung: Node.js 20 oder neuer. Es sind keine externen Pakete erforderlich.

```text
node server.mjs
```

Danach `http://localhost:8080` öffnen.

Testzugänge:

| Rolle | E-Mail | Passwort |
|---|---|---|
| Super Admin | admin@ehv.test | ChangeMe123! |
| Dachpartner | dachpartner@ehv.test | ChangeMe123! |
| Admin Light / Support | support@ehv.test | ChangeMe123! |
| Handwerkspartner | partner@ehv.test | ChangeMe123! |
| Maklerpartner | makler@ehv.test | ChangeMe123! |

Die Daten werden beim ersten Start in `data/runtime.json` erzeugt. Die Datei ist ignoriert und kann für einen frischen Teststand entfernt werden.

## Enthaltene Funktionen

- Rollen und serverseitige Berechtigungsprüfung für Super Admin, Admin Light, Partner-Manager, Handwerks- und Maklerpartner
- Zugriffsscope aus expliziter Partner-Objekt-Zuordnung, Gewerk, PLZ/Region und optional befristeter Ausnahmezuweisung außerhalb des Lizenzgebiets
- Partnerverwaltung und vorbereiteter Einladungs-/Onboardingprozess
- Kunden- und Objektakten mit stabiler EHV-Objekt-ID und externer Phase-4-Referenz
- Serviceakten und vorbereitete geschützte Upload-Dropzone
- Verkaufsbereitakte für Makler
- historisierte Makler-Verkehrswertvalidierung; bestehender Phase-4-Wert bleibt referenzierte Quelle
- Dashboard-KPIs und Excel-kompatibler CSV-Export
- Audit-Log für Anmeldung, abgewiesene Zugriffe und fachliche Änderungen
- responsive, markennahe Oberfläche in Grün-, Mint- und Naturtönen

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md)
- [Sicherheit und Datenschutz](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Offene Abhängigkeiten](docs/OPEN_DEPENDENCIES.md)

## Tests

```text
node --test
```

Die Testplattform ist kein Ersatz für einen Security-Audit, ein AV-/Malware-Scanning der Uploads oder die produktiven EHV-Schnittstellen. Diese Abhängigkeiten sind bewusst als Integrationsgrenzen dokumentiert.
