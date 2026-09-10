import {escapeOnboarding as esc} from './partner-onboarding-entry.mjs';
import {renderPartnerLegalStep} from './partner-legal-step.js?v=20260910-premium';
const money=cents=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
const selections=new Map();
export async function renderPremiumStep(host,flow,{request,resume}){
  const path=`/api/partner-onboarding/${flow.onboarding_id}`;
  const state=await request(`${path}/premium`);
  const legalAccepted=['LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED'].includes(flow.onboarding_status);
  let codes=state.attempt?.postalCodes||selections.get(flow.onboarding_id)||['',''];
  let busy=false,checked=null;
  const locked=Boolean(state.attempt),broker=flow.partner_type==='BROKER_PARTNER';
  const image=new URL('./premium-partnership.png',import.meta.url).href;
  host.innerHTML=`<section class="premium-hero"><div><span class="premium-eyebrow">IHRE PREMIUM-PARTNERSCHAFT</span>
    <h2>Aus einzelnen Aufträgen wird dauerhafte Betreuung.</h2><p>Gemeinsam machen wir die scheckheftgepflegte Immobilie zum Standard: Leistungen nachvollziehbar dokumentieren, Eigentümer verlässlich begleiten und Immobilienwerte langfristig erhalten.</p>
    <ul><li>Unbegrenzt eigene ${broker?'Kunden und Immobilien':'Kunden und Gewerkakten'} betreuen</li><li>Zwei PLZ-Lizenzgebiete im Jahrespreis enthalten</li><li>Bestehende Kunden, Akten und Dokumente bleiben erhalten</li></ul></div>
    <figure><img src="${image}" width="1536" height="1024" alt="Handwerker und Eigentümerin besprechen die Betreuung ihres Hauses"><figcaption>Illustration der Zusammenarbeit · KI-generiert</figcaption></figure></section>
    <ol class="premium-progress" aria-label="Upgrade-Schritte"><li>1 · Unternehmensdaten</li><li class="current">2 · Lizenzgebiete</li><li${legalAccepted?' class="done"':''}>3 · Vertrag & Datenschutz</li><li>4 · Sicher bezahlen</li></ol>
    <div class="premium-test-note">Stripe-Testmodus: keine echte Abbuchung. Testunterlagen ersetzen keinen produktiven Vertrag.</div>
    <div class="premium-layout"><section class="card premium-regions"><h2>Ihre Region. Ihre Partnerschaft.</h2>
      <p>Wählen Sie zwei bis zehn PLZ-Gebiete. Die ersten zwei sind enthalten; jedes weitere kostet <b>${money(state.prices.additionalUnitNetCents)} netto pro Jahr</b>.</p>
      <details class="premium-company"><summary>Unternehmensdaten ansehen</summary><p><b>${esc(flow.prefilled_data.company)}</b><br>${esc(flow.prefilled_data.contact_name)}<br>${esc(flow.prefilled_data.address)}<br>${esc(flow.prefilled_data.postal_code)} ${esc(flow.prefilled_data.city)}<br>${esc(flow.prefilled_data.email)}</p></details>
      <form data-premium-form><div data-postal-inputs></div><button type="button" class="outline" data-add-code>+ Weiteres PLZ-Gebiet hinzufügen</button>
      ${state.recommendations.length?`<p class="premium-hint">Vorschläge aus dem aktuellen PLZ-Katalog:</p><div class="premium-suggestions">${state.recommendations.map(r=>`<button type="button" class="outline" data-suggest="${esc(r.postalCode)}">${esc(r.postalCode)} ${esc(r.city||'')}</button>`).join('')}</div>`:''}
      <p class="premium-hint">Regionsschutz gilt für von eigenheimverwalter vermittelte Chancen. Ihre eigenen Kunden dürfen auch außerhalb der Lizenzgebiete liegen.</p>
      <button type="submit" class="outline" data-check>Verfügbarkeit & Preis prüfen</button><p role="status" data-check-status></p></form>
      ${locked?'<button class="outline" type="button" data-release>Checkout beenden & Gebiete neu wählen</button>':''}
    </section><aside class="card premium-summary"><span class="premium-eyebrow">${broker?'MAKLERPARTNER':'HANDWERKSPARTNER'} PREMIUM</span><h2>Ihre Jahresmitgliedschaft</h2><dl data-price></dl>
      <p class="premium-hint">Abrechnung jährlich, zuzüglich 19 % Umsatzsteuer. Vertragslaufzeit 12 Monate; automatische Verlängerung um weitere 12 Monate. Kündigungsfrist: 3 Monate vor Vertragsende gemäß den bestätigten Kooperationsbedingungen.</p>
      <button class="primary" type="button" data-continue disabled>${legalAccepted?'Weiter zum Stripe-Testcheckout':'Verträge & Datenschutz prüfen'}</button>
      <p data-error role="alert"></p><p class="premium-hint">${legalAccepted?'Ihre Zustimmung liegt vor. Premium wird erst nach bestätigter Zahlung aktiviert.':'Keine Zahlung vor Ihrer ausdrücklichen Zustimmung.'}</p>
      ${!state.configured?'<p class="premium-configuration">Die Verbindung für Testzahlungen wird noch fertig eingerichtet. Sie können bereits Ihre Gebiete und den Preis prüfen.</p>':''}
    </aside></div>`;
  const fields=host.querySelector('[data-postal-inputs]'),form=host.querySelector('form'),status=host.querySelector('[data-check-status]'),error=host.querySelector('[data-error]'),proceed=host.querySelector('[data-continue]');
  const quote=()=>{const extra=Math.max(0,codes.length-2),net=state.prices.baseNetCents+extra*state.prices.additionalUnitNetCents,tax=Math.round(net*.19);return{additionalQuantity:extra,netCents:net,taxCents:tax,grossCents:net+tax};};
  const price=()=>{const q=checked?.quote||state.attempt?.quote||quote();host.querySelector('[data-price]').innerHTML=`<div><dt>Mitgliedschaft inkl. 2 PLZ</dt><dd>${money(state.prices.baseNetCents)}</dd></div><div><dt>${q.additionalQuantity} zusätzliche PLZ</dt><dd>${money(q.additionalQuantity*state.prices.additionalUnitNetCents)}</dd></div><div><dt>Netto pro Jahr</dt><dd>${money(q.netCents)}</dd></div><div><dt>19 % Umsatzsteuer</dt><dd>${money(q.taxCents)}</dd></div><div class="premium-total"><dt>Gesamt pro Jahr</dt><dd>${money(q.grossCents)}</dd></div>`;};
  const invalidate=()=>{checked=null;proceed.disabled=true;status.textContent='Bitte die geänderte Auswahl prüfen.';selections.set(flow.onboarding_id,[...codes]);price();};
  const renderInputs=()=>{
    fields.innerHTML=codes.map((code,i)=>`<div class="premium-postal-row"><label>${i<2?'Enthaltenes Gebiet '+(i+1):'Zusatzgebiet '+(i-1)}<input aria-label="Postleitzahl ${i+1}" name="postal${i}" value="${esc(code)}" inputmode="numeric" pattern="[0-9]{5}" minlength="5" maxlength="5" placeholder="z. B. 22043" required ${locked?'readonly':''}></label>${i>1&&!locked?`<button type="button" class="outline" data-remove="${i}" aria-label="Zusatzgebiet ${i-1} entfernen">×</button>`:''}</div>`).join('');
    fields.querySelectorAll('input').forEach((input,i)=>input.oninput=()=>{codes[i]=input.value;invalidate();});
    fields.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{codes.splice(Number(button.dataset.remove),1);invalidate();renderInputs();});
    host.querySelector('[data-add-code]').disabled=locked||codes.length>=10;
    price();
  };renderInputs();
  host.querySelector('[data-add-code]').onclick=()=>{if(!locked&&codes.length<10){codes.push('');invalidate();renderInputs();fields.querySelector('input:last-of-type')?.focus();}};
  host.querySelectorAll('[data-suggest]').forEach(button=>{button.disabled=locked;button.onclick=()=>{const code=button.dataset.suggest;if(codes.includes(code))return;const blank=codes.indexOf('');if(blank>=0)codes[blank]=code;else if(codes.length<10)codes.push(code);else return;invalidate();renderInputs();};});
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;proceed.disabled=true;status.textContent='Verfügbarkeit wird geprüft …';error.textContent='';
    try{checked=await request(`${path}/quote`,'POST',{postalCodes:codes});selections.set(flow.onboarding_id,[...codes]);price();status.textContent=locked?'Ihre Gebiete sind für den bestehenden Checkout vorgemerkt.':'Die Gebiete sind aktuell verfügbar. Verbindlich reserviert wird beim Start des Checkouts.';proceed.disabled=legalAccepted&&!state.configured;}
    catch(e){checked=null;status.textContent=e.message;}finally{busy=false;}};
  proceed.onclick=async()=>{
    if(busy||!checked)return;
    if(!legalAccepted){await renderPartnerLegalStep(host,flow.onboarding_id,{onContinue:resume});return;}
    busy=true;proceed.disabled=true;error.textContent='Testcheckout wird vorbereitet …';
    try{const result=await request(`${path}/checkout`,'POST',{postalCodes:codes});if(result.active){await resume();return;}const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('Die Zahlungsadresse konnte nicht bestätigt werden.');location.assign(url.href);}
    catch(e){error.textContent=e.message;proceed.disabled=false;}finally{busy=false;}
  };
  host.querySelector('[data-release]')?.addEventListener('click',async()=>{if(busy)return;busy=true;error.textContent='Checkout und Zahlungsstand werden geprüft …';try{await request(`${path}/checkout-cancel`,'POST',{});await resume();}catch(e){error.textContent=e.message;}finally{busy=false;}});
  if(locked){checked={quote:state.attempt.quote};proceed.disabled=!state.configured;status.textContent='Es besteht bereits ein Checkout. Er wird wiederverwendet; es wird kein zweites Abo angelegt.';}
}
