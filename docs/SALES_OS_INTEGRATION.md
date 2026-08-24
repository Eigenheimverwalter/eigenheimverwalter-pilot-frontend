# Sales OS → Pilot Partnerintegration

## Zielbild

Das Sales OS bleibt führend für Akquise und Vertragsabschluss. Nach dem Status **Gewonnen** übermittelt es den Partner mit Gewerk, Kontaktdaten, Vertragslaufzeit und PLZ-Lizenzen an das Pilot-Portal. Das Pilot-Portal bleibt führend für operative Partnerkonten, Kunden-/Objektzugriffe, Serviceakten und Opportunities.

## Übertragene Daten

- stabile Sales-OS-Partner- und Lead-ID
- Unternehmen und Ansprechpartner
- E-Mail, Telefon und Unternehmensanschrift
- Partnerart und genau ein Gewerk pro Pilot-Zugang
- Kooperationsbeginn und Vertragsende
- zwei bzw. konfigurierbar viele im Grundpreis enthaltene PLZ
- hinzugebuchte PLZ einschließlich Buchungsdatum und Laufzeitbezug

Der Import ist idempotent: `sourceRefs.salesOsPartnerId` aktualisiert den vorhandenen Partner. Er erzeugt weder doppelte Konten noch Passwörter. Ein Benutzerzugang wird erst im vorhandenen Pilot-Onboarding angelegt.

## Serverkonfiguration

Pilot:

```text
SALES_OS_SYNC_TOKEN=<zufälliger Wert mit mindestens 32 Zeichen>
SALES_OS_INTEGRATIONS_URL=<URL der Supabase Function sales-integrations>
SALES_OS_FUNCTION_JWT=<serverseitiger Sales-OS-Servicezugang>
```

Sales OS (Supabase Function Secrets):

```text
PILOT_PARTNER_SYNC_URL=https://eigenheimverwalter-pilot.de/api/integrations/sales-os/partners
PILOT_PARTNER_SYNC_TOKEN=<identisch mit SALES_OS_SYNC_TOKEN>
```

Geheimnisse dürfen nicht im Browser, Repository oder Audit-Log stehen.

## E-Mail

Partnernachrichten werden im Pilot-Portal protokolliert und serverseitig an die bestehende Sales-OS-Funktion übergeben. Die Funktion erzwingt den konfigurierten Absender `partner@eigenheimverwalter.de`; OAuth-/Google-Zugangsdaten bleiben ausschließlich in den Supabase Function Secrets. Ohne vollständige Konfiguration meldet das Portal den Versand ehrlich als Warteschlange und nicht als versendet.
