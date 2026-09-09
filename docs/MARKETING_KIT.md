# Marketing-Kit

Admin Light und Super Admin finden oben rechts **Marketing-Kit Einstellungen**.
Aktive Basic-/Tippgeber-, Handwerks- und Maklerpartner finden dort **Marketing-Kit**.

Vier Kategorien: Kundenflyer, Webseiten-Badge, Social-Media-Vorlagen, WhatsApp-Vorlagen.
Dateien per Drag & Drop oder Dateiauswahl hochladen. PDF, PNG, JPG, WEBP und UTF-8-TXT
bis 10 MB; Textvorlagen werden als TXT bereitgestellt, Webseiten-Badges als Bild.
HTML/SVG/Programme sind nicht zugelassen. Typ-/Signaturprüfung ist kein Virenscanner.

Uploads beginnen als **Entwurf**. Nach Ansicht gibt ein Admin die einzelne Datei
explizit für alle aktiven Partner frei. Partner können nur freigegebene Inhalte
ansehen und herunterladen. Keine Veränderung von Kontolizenzen oder Kundendaten.

Freigaben können zurückgezogen werden. Bereits heruntergeladene Kopien sind nicht
rückholbar; bereits ausgestellte Dateilinks gelten noch höchstens 60 Sekunden.
Die Dateien liegen im privaten Pilot-Supabase-Bucket `ehv-marketing-kit`, nicht in
GitHub und nicht in öffentlichen Kundendokument-Buckets. SQL-Direktzugriffe für
anon/authenticated sind gesperrt; nur die rollenprüfende Portal-API liefert Metadaten
und temporäre Links. Die Supportansicht übernimmt Partnerrechte und bleibt lesend.

**Löschen** verlangt eine Bestätigung, sperrt das Dokument zuerst und entfernt danach
die Datei aus Storage. Metadaten/Löschprotokoll bleiben zur Nachvollziehbarkeit erhalten.
Fehlt die Storage-Bestätigung, sehen Admins „Dateilöschung ausstehend“ mit erneutem
Löschversuch. Versionierung verhindert konkurrierende Freigaben/Löschungen. Upload,
Freigabe, Rücknahme und Löschung werden transaktional mit der Metadatenänderung geloggt.

Tests prüfen Rollen, Entwurfs-/Freigabegrenzen, Typvalidierung, Dateimetadaten,
Versionierung, Rücknahme, Fehlerkompensation und Löschwiederholung. Der Deployment-
Smoke-Test lädt ausschließlich eigene private Testentwürfe in alle vier Rubriken,
vergleicht die gespeicherten Bytes, prüft die Partner-Sicht und löscht die Testdateien.
Es werden keine Testdateien für echte Partner veröffentlicht und keine Mails versendet.
