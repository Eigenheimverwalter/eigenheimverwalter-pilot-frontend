# Kundenempfehlung → Registrierung in der bestehenden App

Stand: 9. September 2026. **Vorbereitung, noch nicht aktiviert.**

## Fachliches Ziel

Ein Kunde bestätigt eine Partnerempfehlung und startet im selben Ablauf die
Registrierung in der echten EHV-App. Kein zusätzlicher Pilot-Supabase-Kundenzugang.
Ein bestehendes App-Konto wird nach Anmeldung verknüpft, nicht neu angelegt.
Die bewährte Gestaltung des Bestätigungsformulars bleibt erhalten.

## Tatsächlich geprüfte Quelle

Lokal vorhanden: Flutter-Referenz `20aug2026_version_app.zip`, nicht als aktuell
verifizierter Produktionsstand.

- `lib/retrofit/Apis.dart`: `/app/auth/create`.
- `lib/retrofit/api_client.dart`: `POST`, Rückgabetyp `LoginData`.
- `lib/requestModel/registerRequest.dart`: **nur `email`**, kein Partner- oder Referral-Feld.
- `lib/views/AuthFlows/RegistrationView.dart`: bei `data.status` Wechsel zur Erfolgsseite.
- `lib/model/login_data.dart`: `status`, `message`, optionale Login-Daten.
- API-Basis per `API_BASE_URL` überschreibbar; Referenz-Standard zeigt auf
  `https://codeplayjam.com/property-management-phase4/api/v1/`.

Aus `status: true` lässt sich weder die abgeschlossene E-Mail-Bestätigung noch
eine verknüpfte Partnerempfehlung ableiten. Die aktuelle produktive API-Basis,
Backend-Implementierung, Dublettenregeln und Übergabe-/Rückmeldeverfahren sind
noch zu bestätigen. Es wurden keine Testregistrierungen bei Codeplayjam ausgelöst.

## Bereits vorbereitet

`lib/referral-app-registration.mjs` enthält eine transportunabhängige,
getestete Zustands- und Zuordnungslogik:

- Nur bestätigte Empfehlungen mit zusätzlichem ausdrücklichem Registrierungswunsch.
- Feste IDs für Einladung, Partner, lokale Kundenakte und Immobilie.
- Stabiler Idempotency-Key pro Einladung; keine Übernahme von Browser-Partner-IDs.
- Zustände: `prepared`, `email_verification_pending`,
  `existing_account_sign_in_required`, `registered`.
- Erst bestätigte App-Identität **und** Partner-/Immobilienzuordnung zählen als
  App-Registrierung. Keine Gleichsetzung mit „Empfehlung angenommen“.
- Tippgeber bleiben ausschließlich der Herkunft zugeordnet; keine Freigabe von
  App-Kundendaten, Gewerken oder Equipment.
- Keine Passwörter, Zugangstoken oder Bestätigungstoken im Integrationsauftrag.

Das Modul ist **nicht in die produktiven Routen eingebunden**. Es legt keine Konten
an, speichert keine neuen Kundendaten und sendet keine E-Mails. Die Oberfläche ist
deshalb unverändert. Das ist keine fertige App-Anbindung und keine aktive Queue.

## Geplanter Kundenprozess nach Freigabe

1. Empfehlung, E-Mail und Immobilienadresse wie bisher bestätigen.
2. Gesonderte, nicht vorangekreuzte Auswahl: „Ich möchte meine Immobilie in der
   eigenheimverwalter-App verwalten und die App-Registrierung starten.“ Verweise
   auf die gültigen App-Datenschutzinformationen und Nutzungsbedingungen ergänzen.
3. Ein gemeinsamer Bestätigungsbutton führt Empfehlung und Registrierungsauftrag
   atomar zusammen. Die Empfehlung bleibt bei einem App-Ausfall erhalten.
4. Das App-Backend startet seine eigene Registrierungs-/Passwortvergabe oder
   verlangt bei einem Bestandskonto die Anmeldung. Pilot erhält kein App-Passwort.
5. Nach bestätigter Registrierung meldet das App-Backend die stabilen App-Kunden-
   und Immobilien-IDs sowie die unveränderte Herkunftszuordnung zurück.
6. Erst dann zeigt das Portal „App-Registrierung abgeschlossen“ und bietet den
   geprüften App-/Store-Link an. Ein Download allein ist kein Registrierungsnachweis.

## Mit den App-Entwicklern zu bestätigender Vertrag

**Dies sind Anforderungen für eine neue/erweiterte Schnittstelle, keine Behauptung
über bereits existierende API-Felder oder Endpunkte.**

Serverseitiger Auftrag: Vertragsversion, Request-/Idempotency-ID, bestätigte
Kontakt-/Adressdaten, Herkunftspartner, Empfehlung, lokale Kunden-/Immobilien-ID,
versionierter Registrierungswunsch mit Serverzeit. Gewerk nur bei Fachpartnern.

Antwort: Registrierung gestartet oder Anmeldung erforderlich. Keine öffentliche
Auskunft darüber, ob eine beliebige fremde E-Mail bereits existiert.

Authentifizierte Rückmeldung: eindeutige Event-/Request-ID, App-Kunden-ID,
App-Immobilien-ID, bestätigte E-Mail, bestätigte authentifizierte Identität und
Partnerzuordnung. Ein Browser-JSON mit `customerIdentityConfirmed: true` ist kein
Nachweis. `applyAppRegistrationReceipt` darf ausschließlich hinter einem Adapter
stehen, der die tatsächliche Herkunft und Berechtigung bereits verifiziert hat.

Voraussetzungen für Freischaltung:

- Aktueller Flutter- und Backend-Stand sowie verbindliche API-Basis.
- Testumgebung mit minimal berechtigtem Service-Zugang (Secrets nur serverseitig).
- Idempotente App-Operation inklusive atomarer Referral-Zuordnung; bestehende
  Herkunft darf durch eine spätere Empfehlung nicht stillschweigend ersetzt werden.
- Persistente Outbox, atomare Speicherung mit Referral-Bestätigung, sichere
  Parallelitätskontrolle und begrenzte Wiederholungen bei Netzwerkfehlern.
- Signierte/authentifizierte Rückmeldungen, Zeitfenster, Replay-Schutz und
  Objekt-/Identitätsprüfung; kein unauthentifizierter Completion-Endpunkt.
- Kurzlebiger, undurchsichtiger Einmalcode für die App-Weiterleitung; keine
  Namen, E-Mails, Adressen, Passwörter oder frei änderbaren Partner-IDs in URLs.
- Bestandskonto ausschließlich nach tatsächlicher Anmeldung verknüpfen.
- Lösch-/Widerrufsverfahren, Aufbewahrung und aktuelle Rechtstexte abstimmen;
  keine automatische rückwirkende Registrierung bereits bestätigter Empfehlungen.
- Geprüfte Store-/App-Links und ggf. Universal-/App-Links in der echten App.

Ein Play-Store-/App-Store-Console-Zugang ist nur nötig, falls App-Link-Handling
oder ein neuer App-Build veröffentlicht werden muss. Für die Kernverbindung ist
zunächst der App-Backend-Vertrag entscheidend, nicht das Store-Passwort.

## Abnahme vor Aktivierung

Neue und bestehende App-Konten, doppelte Klicks, wiederholte Rückmeldungen,
Timeout vor/nach Kontoanlage, fehlende/abgelaufene Bestätigung, gleichzeitige
Aufträge, falsche Partner-ID, fremde App-Identität, deaktivierter Partner,
Abbruch/Widerruf und mobile Links prüfen. Dann End-to-End: Bestätigung → echte
App-Anmeldung → eine Kundenakte/Immobilie → korrekte Partnerzuordnung → KPI.

Die vorbereiteten Unit-Tests ersetzen diese Integrationsabnahme nicht.
