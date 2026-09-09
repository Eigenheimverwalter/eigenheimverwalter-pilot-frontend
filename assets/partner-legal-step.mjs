const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleString('de-DE'):'–';
// Shared by the source-independent onboarding UI. No implicit acceptance, no
// activation, and no client-supplied contract copy. Already accepted versions
// are shown as evidence, not as preselected checkboxes.
export function legalStepMarkup(data){
  const missing=data.missingDocumentTypes||[],documents=data.documents||[];
  return `<section class="card" data-partner-legal-step><h2>Verträge &amp; Datenschutz</h2>
    <p>Bitte prüfen Sie die Dokumente und bestätigen Sie die erforderlichen Angaben ausdrücklich.</p>
    ${missing.length?'<p class="error" role="alert">Die erforderlichen Rechtsdokumente sind noch nicht vollständig freigegeben. Eine Zustimmung ist derzeit nicht möglich.</p>':''}
    ${!data.dataComplete?'<p class="source-note">Bitte vervollständigen Sie zuerst Ihre Unternehmens- und Kontaktdaten.</p>':''}
    <form data-legal-consent><div class="table-wrap"><table><thead><tr><th>Dokument</th><th>Version / Gültig ab</th><th>Ansehen</th></tr></thead><tbody>
    ${documents.map(d=>`<tr><td><b>${escape(d.title)}</b><br><small>${escape(d.name)}</small></td><td>${escape(d.version)}<br>${escape(date(d.effectiveFrom))}</td><td><button class="outline" type="button" data-legal-preview="${escape(d.id)}">Dokument ansehen</button></td></tr>`).join('')}</tbody></table></div>
    ${documents.map(d=>d.accepted?`<p class="source-note">${escape(d.title)} · Version ${escape(d.version)}: bereits bestätigt am ${escape(date(d.acceptedAt))}.</p>`:
      `<label class="legal-consent-row"><input type="checkbox" name="${escape(d.id)}" required> <span>${escape(d.acceptanceText)}</span></label>`).join('')}
    <p data-legal-status role="status" aria-live="polite"></p>
    <button class="primary" type="submit" disabled>${data.accepted?'Mit bestätigten Dokumenten fortfahren':'Verbindlich zustimmen und fortfahren'}</button></form></section>`;
}
