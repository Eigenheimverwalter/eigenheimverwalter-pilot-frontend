# Offene Abhängigkeiten

| Abhängigkeit | Status | Nächster Schritt |
|---|---|---|
| Originaler Laravel-Sourcecode | Nicht im Arbeitsbereich | Repository/Archiv mit Commit-Referenz bereitstellen |
| GitHub Account/Organisation `Eigenheimverwalter` | Connector liefert keine Repositories/Org-Mitgliedschaft | GitHub App für Zielorganisation und Repository-Schreibrecht freigeben |
| Bestehende Pilot-/Phase-4-API | Vertrag und Zugang fehlen | OpenAPI/Postman, Basis-URL, Test-Credentials und Datenverantwortung bereitstellen |
| Vertriebs-CRM | Anbieter/API/Mapping fehlen | Exportformat, Feldmapping, Dubletten- und Delta-Strategie festlegen |
| Transaktions-E-Mail (Registrierung, Reset, Empfehlung) | Persistente Outbox und Vorlagen vorhanden; produktive Zustellung noch nicht quittiert | All-Inkl-/Sales-OS-Mailadapter anbinden, Zustellstatus übernehmen sowie SPF, DKIM und DMARC prüfen |
| App-Downloadlinks nach Kundenbestätigung | Über `APP_IOS_DOWNLOAD_URL` und `APP_ANDROID_DOWNLOAD_URL` vorbereitet | Finale App-Store- und Google-Play-URLs in der produktiven Serverkonfiguration hinterlegen |
| Upload-Storage und Malware Scan | Nicht verbunden | EU-Storage, KMS, AV/CDR und Aufbewahrungsklassen auswählen |
| ImmoScout/Immowelt/Maklersoftware | Partnerzugänge und API-Verträge fehlen | Erst nach fachlicher Freigabe je Adapter implementieren |
| Branding-Assets | Kein Logo/CRM-Source im Arbeitsbereich | freigegebene SVG/Fonts/Design Tokens bereitstellen |
| Datenschutz-/Security-Abnahme | Ausstehend | DSB, Legal und externen Penetrationstest einplanen |

Die fehlenden Integrationen sind bewusst nicht mit Mock-Produktivzugängen oder kopierter Phase-4-Logik kaschiert. Die Demo-Daten sind synthetisch und enthalten keine echten Kundendaten.
