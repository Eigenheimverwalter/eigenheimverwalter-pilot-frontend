# EHV Anlass- & Opportunity Engine

## Architektur

Die Engine ist eine eigenständige Workflow-Schicht. Sie berechnet keine konkurrierenden Phase-4-Health-Scores und erzeugt keine neue Equipmentakte. Bestehende Immobilien-, Equipment-, Service- und ACL-Daten bleiben führend.

`Trigger Definition → Trigger Event → Affected Property → Relevance Decision → Partner Opportunity → Customer Action → Assignment/Service Lead → Service Record`

Die Testplattform persistiert die Objekte derzeit in der vorhandenen JSON-Testdatenhaltung. Für die Laravel-/MySQL-Produktivmigration sind folgende Tabellen vorgesehen:

| Tabelle | Zweck | zentrale Indizes |
| --- | --- | --- |
| `trigger_definitions` | konfigurierbare Regeln, Schwellen, Cooldowns, Gewerke und Templates | `code UNIQUE`, `active`, `category` |
| `trigger_events` | konkrete interne, externe oder geplante Ereignisse | `(source, external_event_id) UNIQUE`, `processing_status`, `event_start` |
| `affected_properties` | Objektentscheidung und erklärbarer Score | `(trigger_event_id, property_id) UNIQUE`, `decision`, `score_total` |
| `partner_opportunities` | aggregierter Partnerbedarf | `(trigger_event_id, partner_id, trade_id) UNIQUE`, `status` |
| `opportunity_properties` | interne Zuordnung; nicht ungeprüft an Partner ausgeben | `(opportunity_id, property_id) UNIQUE` |
| `customer_action_templates` | generische Texte und Antwortpfade | `code UNIQUE`, `active` |
| `customer_actions` | Kontaktstatus, Reaktion, Opt-out und Deduplizierung | `(trigger_event_id, property_id) UNIQUE`, `status`, `created_at` |
| `opportunity_events` | Conversion- und Workflowverlauf | `opportunity_id`, `type`, `at` |
| `opportunity_jobs` | Queue-Status, Cursor, Batchgröße und Wiederholungen | `status`, `trigger_event_id` |

JSON-Felder werden für Schwellen, Bedingungen, Equipmenttypen, Gewerke, Score-Regeln, Rohpayload und Score-Breakdown verwendet. Personenbezogene Daten gehören nicht in Rohpayloads oder technische Logs.

## Module und Adapter

- `TriggerDefinitionRepository` und `TriggerEventRepository`
- `OpportunityRuleEngine` für deklarative Pfad-/Operator-/Punktregeln
- `RelevanceScoringService` mit gespeichertem Breakdown
- `CustomerContactPolicy` für Cooldown, Kontaktlimit, Opt-out, Deduplizierung und aktive Tickets
- `PartnerMatcher` auf Basis von Aktivstatus, Gewerk, PLZ/Region und bestehender Assignmentlogik
- `CustomerActionService` für generische Templates und Antworten
- `OpportunityJobDispatcher` für spätere Laravel-Queue-/Worker-Verarbeitung in Batches
- `Phase4ServiceRecordAdapter` für die Rückspielung in bestehende Service-/Equipmentprozesse
- `WeatherProviderInterface` als späterer providerneutraler Eingangsadapter

## ACL und Datenschutz

- Admin Plus konfiguriert Definitionen, erzeugt Events und darf Testreaktionen simulieren.
- Admin Light sieht Definitionen, Events, Scores und Conversion ausschließlich lesend.
- Partner sehen nur aggregierte Objektzahlen, Prioritätsverteilung, Region, Gewerk und Handlungsempfehlung.
- Objekt- und Kundenzugriff entsteht erst nach positiver Kundenreaktion durch ein serverseitiges Assignment.
- Abschluss ist nur durch den tatsächlich zugeordneten Partner möglich und erzeugt einen bestehenden Serviceeintrag.
- Trigger-, Kundenreaktions-, Assignment- und Abschlussaktionen werden auditiert.

## Queue- und Provider-Migration

Der Testmodus nutzt denselben Jobdatensatz, verarbeitet kleine Bestände aber synchron (`inline_test`). Produktiv wird `process_trigger_event` als Laravel Job mit `chunkById`, Retry/Backoff, Dead-Letter-Überwachung und eindeutigen Datenbankindizes ausgeführt. Wetteranbieter implementieren später ein Interface, das normalisierte `TriggerEvent`-DTOs liefert; die Rule Engine bleibt providerneutral.
