# Admin Plus Management Intelligence

## Verantwortlichkeiten

- SalesOS ist die operative Source of Truth für Leads, Aktivitäten, Stufen, Aufgaben, Follow-ups und Won/Lost.
- Pilot ist die Source of Truth für Partner, Onboarding, Recht, Zahlungen, Lizenzen, Regionen, Service, Immobilien und Opportunities.
- Admin Plus konsumiert beide Quellen über serverseitige Analytics-Adapter. Operative Sales-Datensätze werden nicht in eine zweite Sales-Datenbank kopiert.

## Datenfluss

`SalesOS Supabase -> sales-management-analytics -> Pilot portal-api -> Admin Plus`

Die Verbindung verwendet den bestehenden serverseitigen `SALES_OS_SYNC_TOKEN`. Der Browser erhält weder diesen Token noch einen Service-Role-Key. Falls die SalesOS-Quelle nicht erreichbar ist, zeigt Admin Plus für nicht belegbare Kennzahlen `N/A`; es werden keine Ersatzwerte erfunden.

## KPI-Vertrag

Jede Management-KPI besitzt einen stabilen Code, Beschreibung, Formel, Datenquelle, Aktualisierung, Filter und Drilldown. Die Definitionen liegen in `kpi_definitions`; die gemeinsame Laufzeitberechnung befindet sich in `supabase/functions/_shared/management-intelligence.mjs` und wird auch vom lokalen Kompatibilitätsserver verwendet.

Alle Antworten enthalten `meta.source`, `meta.asOf`, `meta.updateFrequency` und `meta.complete`. Schwere regionale Auswertungen dürfen später in fünf- bis fünfzehnminütigen Aggregaten materialisiert werden. Status- und Funnel-Daten bleiben near-real-time.

## Berechtigungen

- Admin Plus besitzt Vollzugriff.
- Admin Light benötigt die jeweils explizite Permission.
- Finanzkennzahlen benötigen `finance.read` und werden auch auf dem Dashboard serverseitig redigiert.
- Exporte benötigen `analytics.export` und erzeugen ein Audit-Ereignis.
- Support View und Sales-Mitarbeiter erhalten keinen Management-Zugriff.

Permission Keys:

- `dashboard.read`
- `sales.analytics.read`
- `partner.analytics.read`
- `contracts.read`
- `finance.read`
- `referral.analytics.read`
- `opportunity.analytics.read`
- `analytics.export`

## Management-Endpunkte

- `/api/management/dashboard`
- `/api/management/kpi-definitions`
- `/api/management/sales-intelligence`
- `/api/management/sales-funnel`
- `/api/management/sales-performance`
- `/api/management/sales-forecast`
- `/api/management/onboarding`
- `/api/management/partner-intelligence`
- `/api/management/contracts-licenses`
- `/api/management/revenue`
- `/api/management/referrals`
- `/api/management/basic-conversion`
- `/api/management/opportunities`
- `/api/management/properties`
- `/api/management/regions`
- `/api/management/operations`
- `/api/management/broker`
- `/api/management/actions`
- `/api/management/export`

## Deployment-Reihenfolge

1. SalesOS-Migration anwenden.
2. `sales-management-analytics` deployen.
3. Pilot-Migration anwenden.
4. Pilot `portal-api` deployen.
5. statisches Pilot-Frontend veröffentlichen.
6. authentifizierten Smoke-Test und ACL-Test ausführen.

Alte Pilot-Routen bleiben bestehen. Die neue Navigation gruppiert sie neu und ergänzt Management-Drilldowns, ohne Partner 360°, Support View, SalesOS oder operative Prozesse zu ersetzen.
