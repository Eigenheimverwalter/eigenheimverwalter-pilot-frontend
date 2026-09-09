# Rechtsdokumentenverwaltung

Oben rechts: **Zugänge, APIs & Versionen → Rechtsdokumente**.

Super Admin / Admin Plus besitzt alle Rechtsdokumentenrechte. Für Admin Light
werden die fünf `legal_documents.*`-Rechte im bestehenden Rollenprofil festgelegt:
**Zugangsverwaltung → Rollenrechte konfigurieren**. `read` ist Voraussetzung für
alle übrigen Aktionen. Partner und Support-Sichten besitzen keinen Verwaltungszugriff.

## Dokumentenzyklus

- PDF auswählen oder per Drag & Drop ablegen. Titel und Bestätigungstext prüfen.
- Als neue Version speichern. Dateiname, Dokumentart, Version, Größe, Uploader,
  Uploadzeit, Status, Freigabezeit und Gültigkeit werden angezeigt.
- Die Vorschau verwendet den vorhandenen Marketing-Kit-PDF-Dialog mit einem
  60 Sekunden gültigen privaten Link. Keine öffentlichen Storage-URLs.
- **Freigeben** setzt APPROVED, **Aktivieren** setzt ACTIVE. Aktivierung erfordert
  ein bereits erreichtes Gültigkeitsdatum. Zukünftige Versionen bleiben bis dahin
  APPROVED und werden bewusst manuell aktiviert; es gibt noch keinen Scheduler.
- Die Aktivierung archiviert atomar die bisher aktive Version desselben Typs.
- Freigegebene/aktive/archivierte Dokumente werden nicht physisch gelöscht.
  Nur ungenutzte DRAFT-Versionen dürfen entfernt werden. Ein fehlgeschlagener
  Storage-Löschvorgang bleibt als ausstehend sichtbar und kann wiederholt werden.
- Versionen, Dateiverweise und Bestätigungstexte werden nicht überschrieben.
  Auch eine gelöschte Entwurfsnummer wird nicht wiederverwendet.

## Daten und Sicherheit

Private Supabase-Bucket `ehv-legal-documents`; PDF bis 10 MiB. Mit dem Function-Secret
`LEGAL_DOCUMENT_MAX_BYTES` kann das Serverlimit reduziert werden (1–10485760).
Dateityp, Dateiendung und PDF-Signatur/EOF werden überprüft. Dies ersetzt keinen
Malware-Scanner und keine rechtliche Inhaltsprüfung.

`legal_documents` und `legal_acceptances` sind eigenständige RLS-geschützte Entitäten.
Die Acceptances speichern die konkrete Version, den serverseitigen Zeitpunkt,
Identität und den für die Version gespeicherten Bestätigungstext. Ein Datenbanktrigger
verhindert spätere Umschreibung/Löschung von Zustimmungen. Die vorbereitete Tabelle
`partner_onboardings` referenziert bestehende Text-Partner-IDs ohne Umnummerierung.

Bei unklarer Antwort nach einem Upload werden die Bytes nicht vorschnell gelöscht:
zuerst die Übersicht neu laden. Ein nicht zuordenbares privates Objekt benötigt
gegebenenfalls technische Prüfung; keine automatische Löschung von Beweisen.

## Liefergrenze dieses Bausteins

Diese Verwaltung ändert **noch nicht** den laufenden Basic-/Sales-/Invite-Prozess.
Das Schema und die gemeinsam getesteten Fachregeln sind Vorarbeiten, keine bereits
fertige Stripe-/Onboardingintegration. Insbesondere sind Checkout, Webhook,
PLZ-Reservierung, der zentrale Transportdienst, die Onboarding-Schrittoberfläche,
SalesOS-Rückmeldung und die Einbindung des 3-Immobilien-Limits noch separat anzubinden.
Die Reihenfolge und offenen Freischaltungsvoraussetzungen stehen in
`PARTNER_ONBOARDING_IMPLEMENTATION.md`.
