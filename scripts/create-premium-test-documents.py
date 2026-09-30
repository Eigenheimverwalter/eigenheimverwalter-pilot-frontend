from pathlib import Path
import sys
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

target = Path(__file__).resolve().parents[1] / 'test' / 'fixtures' / 'partner-premium'
target.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle('TestTitle', fontName='Helvetica-Bold', fontSize=25, leading=31, textColor=HexColor('#12333b'), spaceAfter=22))
styles.add(ParagraphStyle('TestBody', fontSize=12, leading=19, spaceAfter=16, textColor=HexColor('#243b42')))
documents = {
    'terms-test.pdf': ('TEST Kooperationsbedingungen', [
        'Nur für den technischen Test mit basic.heizung@ehv.test. Kein produktiver Vertrag und kein Rechtsrat.',
        'Dieser Test prüft die Darstellung von Dokumenten, die ausdrückliche Zustimmung zu einer konkreten Version und die anschließende Weiterleitung zum Stripe-Testcheckout.',
        'Testtarif Handwerkspartner: 499,00 EUR netto pro Jahr; zwei PLZ-Gebiete enthalten. Bis zu acht zusätzliche PLZ-Gebiete zu jeweils 129,99 EUR netto pro Jahr. Hinzu kommen 19 % Umsatzsteuer.',
        'Die Anzeige simuliert 12 Monate Laufzeit, Verlängerung um weitere 12 Monate und eine Kündigungsfrist von drei Monaten. Diese Angaben begründen im Test keinen zahlungspflichtigen Vertrag.',
        'Ausschließlich Stripe-Testkarten verwenden. Es wird kein echtes Geld abgebucht. Vor Produktivbetrieb müssen freigegebene Vertragsunterlagen und die produktive Zahlungskonfiguration vorliegen.'
    ]),
    'privacy-test.pdf': ('TEST Datenschutzhinweise', [
        'Nur für den technischen Test mit basic.heizung@ehv.test. Dieses Dokument ersetzt keine rechtsgeprüfte Datenschutzerklärung.',
        'Der Test verwendet das ausdrücklich benannte Partner-Testkonto sowie fiktive Kunden- und Immobilienangaben. Keine weiteren personenbezogenen Daten eingeben.',
        'Zur technischen Nachvollziehbarkeit werden Dokumentversion, Konto-E-Mail, Zeitpunkt und Zustimmungstext gespeichert. Diese Nachweise dürfen nicht nachträglich auf eine andere Dokumentversion umgebogen werden.',
        'Der Stripe-Testcheckout erhält die Angaben des Testpartners und die ausgewählten Testtarife. Nur fiktive Zahlungsmittel verwenden; keine echten Karten- oder Bankdaten eingeben.',
        'Diese Unterlagen sind auf diesen Testvorgang beschränkt. Andere Partner erhalten sie nicht. Vor dem Produktivstart müssen die tatsächlich freigegebenen Datenschutzinformationen bereitstehen.'
    ])
}
for filename, (title, paragraphs) in documents.items():
    if '--broker' in sys.argv:
        filename = 'broker-' + filename
        paragraphs = [p.replace('basic.heizung@ehv.test', 'makler_basic@ehv.test').replace('Handwerkspartner: 499,00', 'Maklerpartner: 979,00') for p in paragraphs]
    doc = SimpleDocTemplate(str(target / filename), pagesize=A4, rightMargin=52, leftMargin=52, topMargin=62, bottomMargin=52)
    story = [Paragraph('eigenheimverwalter | TESTUMGEBUNG', styles['TestBody']), Spacer(1, 12), Paragraph(title, styles['TestTitle'])]
    story += [Paragraph(text, styles['TestBody']) for text in paragraphs]
    story += [Spacer(1, 20), Paragraph('Dokumentstand 10.09.2026 | ausschließlich Sandbox | keine Produktivfreigabe', styles['TestBody'])]
    doc.build(story)
    print(filename)
