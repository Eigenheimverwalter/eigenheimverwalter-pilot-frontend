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

## Phase 2 – Zustimmungs-Engine

- `GET /api/partner-onboarding/{id}/legal` liefert nur für das verifizierte eigene
  Partnerkonto die aktuellen Pflichtversionen und bereits bestehende Nachweise.
- `GET .../legal/{documentId}/file` prüft die Zuordnung nochmals, protokolliert
  den Vorschau-Aufruf und erzeugt einen 60-Sekunden-Link. Der Audit-Eintrag beweist
  einen angeforderten Abruf, nicht, dass ein Mensch das Dokument tatsächlich las.
- `POST .../legal` nimmt ausschließlich `{documents:[{id,version,accepted:true}]}`
  entgegen. Alle Pflichtversionen werden in einer Datenbanktransaktion geprüft.
  Fehlende Versionen/Checkboxen oder eine zwischenzeitliche neue Version verhindern
  jede Teilannahme. Doppelklicks erzeugen keine doppelten Nachweise.
- Mindestens TERMS und PRIVACY bleiben serverseitig Pflicht. Weitere Typen können
  durch die spätere serverseitige Plankonfiguration ergänzt werden; nicht durch
  Browserdaten. Ein nicht verfügbares Pflichtdokument blockiert die Zustimmung.
- Eine Upgrade-Zustimmung kann nur vom selben bestätigten Benutzer für denselben
  bestehenden Partner, dieselbe E-Mail und exakt dieselbe aktive Version stammen.
  In diesem Fall wird der alte Nachweis referenziert, kein neuer Zeitpunkt erfunden.
- Das wiederverwendbare Formular `partner-legal-step.js` zeigt bestehende Nachweise
  als Text und neue Bestätigungen als **nicht vorausgewählte** Pflichtcheckboxen.
  Es wird erst mit dem zentralen Dienst an neue Entry-Flows angeschlossen.
- Annahme setzt höchstens LEGAL_ACCEPTED. Weder Partner noch Lizenz werden dadurch
  aktiviert, auch nicht bei Premium oder einem gefälschten Formularstatus.
- Abgelaufene, fremde, unbestätigte und Support-/Admin-Kontexte sind ausgeschlossen.
  Die Edge-Route läuft vor der alten automatischen Basic-Aktivierung.

`accepted_ip` bleibt derzeit NULL: Für die vorhandene Edge-Proxykette wurde kein
vertrauenswürdiger Client-IP-Header nachgewiesen. Ein vom Browser manipulierbarer
Forwarded-Header wird nicht als Beweis gespeichert. User-Agent wird begrenzt und
von Steuerzeichen bereinigt. IP/User-Agent/E-Mail/Vertragstext gelangen nicht in
den allgemeinen Audit-Metadatensatz. Die genaue Aufbewahrung ist rechtlich zu klären.

Malware-Vorbereitung: Die bestehende private DRAFT→APPROVED-Sperre ist der
Integrationspunkt für einen späteren Scanner. MIME-/PDF-Signaturprüfung ist kein
Virenscan; ohne konfigurierten Scanner wird kein Scan-Erfolg behauptet.
