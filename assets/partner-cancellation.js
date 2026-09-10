const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('de-DE'):'–';
export async function mountPartnershipCancellation(api,partner,role){
  const page=document.querySelector('#account-form')?.closest('.page');if(!page)return;
  if(!partner){
    if(!['super_admin','admin_light'].includes(role))return;
    const section=document.createElement('section');section.className='cockpit-card';section.style.marginTop='18px';section.innerHTML='<h3>Partnerkündigungen & Aufbewahrungsprüfung</h3><p>Wird geladen …</p>';page.append(section);
    try{const data=await api('/api/account/cancellation-review');section.innerHTML=`<h3>Partnerkündigungen & Aufbewahrungsprüfung</h3><p>Nach Vertragsende muss die Verwaltung prüfen, welche partnerbezogenen Daten gelöscht und welche Nachweise befristet aufbewahrt werden. Kundenakten dürfen nicht pauschal gelöscht werden.</p>${data.cancellations.map(c=>`<p><b>${esc(c.partner_id)}</b> · Ende ${date(c.effective_date)}<br>${esc(c.status)} · Abrechnung: ${esc(c.billing_status)}<br>${c.deletion_status==='RETENTION_REVIEW_REQUIRED'?'<strong>Lösch- und Aufbewahrungsprüfung erforderlich</strong>':'Löschprüfung nach Vertragsende'}</p>`).join('')||'<p>Noch keine Kündigungen eingegangen.</p>'}`;}catch(error){section.textContent=error.message}return;
  }
  const section=document.createElement('section');section.className='cockpit-card';section.style.marginTop='18px';page.append(section);
  const render=async()=>{
    section.innerHTML='<h3>Partnerschaft kündigen</h3><p role="status">Vertrag und Kündigungstermin werden geprüft …</p>';
    try{const data=await api('/api/account/cancellation');if(!section.isConnected)return;
      if(data.cancellation){const c=data.cancellation;section.innerHTML=`<h3>Kündigung eingegangen</h3><p>Ihre Partnerschaft endet zum <strong>${date(c.effectiveDate)}</strong>.</p><p>Bestätigungsnummer: ${esc(c.id)}<br>Eingegangen: ${esc(new Date(c.requestedAt).toLocaleString('de-DE'))}</p><p>${c.billingStatus==='SCHEDULED'?'Die Beendigung des Stripe-Abos ist vorgemerkt.':c.billingStatus==='NOT_REQUIRED'?'Kein kostenpflichtiges Abo vorhanden.':c.billingStatus==='WAITING_NEXT_PERIOD'?'Die Kündigung ist gespeichert. Das Abo läuft bis zum bestätigten Vertragsende weiter.':'Die Kündigung ist gespeichert; die Abrechnung wird noch abgeglichen. Ihre Eingangsfrist bleibt gewahrt.'}</p><p>Bis Vertragsende bleibt Ihr Zugang erhalten. Danach erfolgt die Prüfung der Lösch- und Aufbewahrungspflichten.</p><button class="outline" data-receipt>Bestätigung herunterladen</button>`;
        section.querySelector('[data-receipt]').onclick=()=>{const text=`eigenheimverwalter – Kündigungsbestätigung\nNummer: ${c.id}\nEingang: ${c.requestedAt}\nVertragsende: ${c.effectiveDate}\n`;const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Kuendigungsbestaetigung.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};return;}
      const terms=data.terms;
      section.innerHTML=`<h3>Partnerschaft kündigen</h3><p>${terms.plan==='premium'?'Premium':'Basic'} · ${esc(terms.rule)}</p><p>Nächstmögliches Vertragsende: <strong>${date(terms.effectiveDate)}</strong></p><button class="outline" data-cancel-start>Partnerschaft kündigen</button>`;
      section.querySelector('[data-cancel-start]').onclick=()=>openConfirmation(terms);
    }catch(error){section.innerHTML=`<h3>Partnerschaft kündigen</h3><p role="alert">${esc(error.message)}</p><button class="outline" data-retry>Erneut prüfen</button>`;section.querySelector('[data-retry]').onclick=render;}
  };
  function openConfirmation(terms){
    const dialog=document.createElement('dialog');dialog.className='cockpit-card';dialog.style.cssText='max-width:620px;width:calc(100% - 32px);max-height:85vh;overflow:auto;color:var(--text,#e6f2f4);background:#0a252b;border:1px solid #36616a;border-radius:16px';document.body.append(dialog);
    const close=()=>{dialog.close();dialog.remove()};dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
    dialog.innerHTML=`<h2>Partnerschaft wirklich beenden?</h2><p>Schritt 1 von 2</p><p>Ihre Partnerschaft endet zum <strong>${date(terms.effectiveDate)}</strong>. Bis dahin gelten die vereinbarten Leistungen und Zahlungspflichten weiter.</p><p>${esc(terms.notice)}</p><label><input type="checkbox" data-end-check> Ich möchte die Partnerschaft zu diesem Termin kündigen.</label><p><button class="outline" data-back>Zurück</button> <button class="primary" data-next disabled>Weiter zur Bestätigung</button></p>`;
    dialog.querySelector('[data-back]').onclick=close;dialog.querySelector('[data-end-check]').onchange=e=>dialog.querySelector('[data-next]').disabled=!e.target.checked;
    dialog.querySelector('[data-next]').onclick=()=>{
      dialog.innerHTML=`<h2>Kündigung verbindlich bestätigen</h2><p>Schritt 2 von 2 · Vertragsende ${date(terms.effectiveDate)}</p><p>${esc(terms.notice)}</p><form><label><input type="checkbox" name="deletion" required> Ich habe den Hinweis zur endgültigen Löschung und zu den Ausnahmen verstanden.</label><label>Bitte zur Bestätigung KÜNDIGEN eingeben<input name="confirmation" autocomplete="off" required></label><p role="alert" data-error></p><button type="button" class="outline" data-back>Abbrechen</button> <button type="submit" class="primary" disabled>Jetzt verbindlich kündigen</button></form>`;
      dialog.querySelector('[data-back]').onclick=close;const form=dialog.querySelector('form'),button=form.querySelector('[type=submit]');form.oninput=()=>button.disabled=!(form.elements.deletion.checked&&form.elements.confirmation.value==='KÜNDIGEN');
      form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{await api('/api/account/cancellation',{method:'POST',body:JSON.stringify({effectiveDate:terms.effectiveDate,confirmPartnership:true,acknowledgeDeletion:form.elements.deletion.checked,confirmation:form.elements.confirmation.value})});close();await render()}catch(error){form.querySelector('[data-error]').textContent=error.message;button.disabled=false}};
    };dialog.showModal();
  }
  await render();
}
