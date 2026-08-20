# Architektur

## Zielbild

Die Testplattform trennt Identität, Autorisierung, fachliche Daten, Auditierung und externe Integrationen. Das entspricht den späteren Laravel-Grenzen, ohne nicht vorliegenden Produktionscode zu imitieren.

```text
Browser
  -> Session + CSRF
  -> HTTP/API-Schicht
  -> Permission Gate
  -> Property Scope (Assignment + Gewerk + Region + Laufzeit)
  -> Fachmodule
       Partner / Onboarding
       Kunden / Objekte
       Serviceakten
       Verkaufsbereitakten / Bewertungen
       KPIs / Export
  -> persistenter Testdatenspeicher
  -> Audit-Log

Externe Adapter (noch offen)
  -> bestehende Laravel-/Pilot-API
  -> Phase-4-Werte und Berechnungen
  -> CRM
  -> Object Storage + Malware Scan
  -> E-Mail / Einladungen
  -> Immobilienportale / Maklersoftware
```

## Autorisierungsregel

Ein Partnerzugriff auf ein Objekt wird nur erlaubt, wenn eine aktive explizite Zuordnung besteht. Zusätzlich müssen Gewerk und lizenzierte PLZ passen. Eine durch einen berechtigten Admin erteilte, dokumentierte Ausnahme kann die Region überschreiben und zeitlich begrenzt werden. Rollenrechte allein geben keinem Partner Zugriff auf alle Objekte einer Region.

Super Admin ist die einzige Bypass-Rolle. Admin Light erhält ausschließlich definierte Supportrechte und keine Partner-, Rollen- oder Bewertungsänderungen.

## Migration in das bestehende Laravel-System

Empfohlene Zuordnung:

| Testplattform | Laravel-Ziel |
|---|---|
| `users.role` / Permission Map | vorhandene `roles` und `role_permissions`; Helper auf `is_access = 1` korrigieren |
| `partners.tradeIds` | `trades` + `partner_trade` Pivot |
| `partners.postalCodes` | vorhandene `user_assigned_license_postal_codes` |
| `assignments` | neue `partner_property_assignments` Tabelle |
| `canAccessProperty` | Laravel Policy + Middleware, in jeder Controller-/API-Aktion |
| `audit` | append-only `audit_logs`, idealerweise zusätzlicher manipulationserschwerender Export/SIEM |
| `phase4Ref` | stabiler Fremdschlüssel/API-Identifier; keine Kopie der Berechnungslogik |

Vorgeschlagene Laravel-Policies sind `PartnerPolicy`, `PropertyPolicy`, `ServiceCasePolicy`, `SalesFilePolicy` und `ValuationPolicy`. UI-Prüfungen dürfen nur Bedienkomfort liefern; jede Abfrage und Mutation muss dieselbe Policy serverseitig durchlaufen.

## Datenhoheit

- Phase 4 bleibt Source of Truth für EHV-Verkehrswert und bestehende Objektberechnungen.
- Das Portal speichert nur Referenzen, fachliche Ergänzungen, Zuweisungen und Makler-Validierungen.
- Maklerwerte werden als neue Version angefügt und nicht überschrieben.
- Externe Systeme erhalten eigene Adapter und externe IDs; keine Portallogik wird in das Kernmodell eingebaut.
