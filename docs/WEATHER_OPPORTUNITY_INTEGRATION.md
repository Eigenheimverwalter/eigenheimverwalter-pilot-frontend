# Wetterintegration der Anlass- & Opportunity Engine

## Umgesetzter Stand

- `DwdWarningProvider` ruft amtliche Warnungen serverseitig ab und normalisiert sie in providerneutrale Ereignisse.
- Sturm, Hagel, Starkregen und Frost werden bestehenden Trigger-Definitionen zugeordnet.
- Ereignisse werden anhand ihrer externen ID dedupliziert und durchlaufen die bestehende Relevance-, Cooldown-, ACL- und Opportunity-Logik.
- Admin Plus kann den Abruf unter **Versionsstand, APIs & externe Dienste** kontrolliert auslösen. Abrufe und Fehler werden auditiert.
- Es werden keine Kundenadressen an den Wetteranbieter übertragen.

## Bewusste Go-live-Grenzen

Die aktuelle Testplattform ordnet Warnregionen gegen den vorhandenen lokalen PLZ-Katalog zu. Vor produktiver Aktivierung automatischer Kundenkontakte sind erforderlich:

1. vollständiger deutscher PLZ-/Geokatalog,
2. DWD-CAP-Polygonzuordnung statt reiner Orts-/Bundeslandzuordnung,
3. Bright-Sky- oder DWD-Messwertadapter für die Nachereignisbestätigung,
4. fachlich freigegebene Schwellen je Warnart und Gewerk,
5. produktiver Push-Adapter der EHV-App inklusive Opt-out, Ruhezeiten und Zustellstatus,
6. zeitgesteuerter Queue-Worker mit Monitoring, Retry und Alarmierung.

Ohne diese Punkte darf ein DWD-Abruf Ereignisse und interne Opportunities erzeugen, aber noch keine unkontrollierte Massenbenachrichtigung auslösen.
