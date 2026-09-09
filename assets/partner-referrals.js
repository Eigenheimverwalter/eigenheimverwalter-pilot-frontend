import { portalRootPath } from './portal-navigation.mjs';
import { makeReferralQr } from './referral-qr.mjs';
import { customerTableHead, propertyRegion } from './customer-overview.mjs';

const q = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const referralRoles = ['partner_basic', 'referral_partner', 'crafts_partner', 'broker_partner'];

export async function portalRequest(path, options = {}) {
  let bridge = window.ehvSupabaseBridge;
  if (!bridge && window.__EHV_RUNTIME__?.authMode === 'supabase') {
    await import('./supabase-bridge.js');
    bridge = window.ehvSupabaseBridge;
  }
  if (bridge?.handles(path)) return bridge.request(path, options);
  if (window.ehvApi) return window.ehvApi(path, options);
  throw new Error('Die sichere Portalverbindung ist noch nicht bereit. Bitte laden Sie die Seite neu.');
}

const readonly = () => Boolean(window.ehvPortalContext?.supportView);
const dialog = (title, html) => {
  q('.referral-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal referral-modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="modal-card"><div class="modal-head"><h3>${escape(title)}</h3><button type="button" class="close" aria-label="Schließen">×</button></div>${html}</div></div>`);
  q('.referral-modal .close').onclick = () => q('.referral-modal')?.remove();
};
const errorDialog = error => dialog('Kundenempfehlung', `<p class="error" role="alert">${escape(error.message)}</p>`);

export function referralLink(path) {
  if (!/^\/ref\/[^/?#]+$/.test(String(path))) throw new Error('Der persönliche Empfehlungslink ist nicht verfügbar.');
  return new URL(portalRootPath(window.__EHV_RUNTIME__?.basePath) + path.slice(1), location.origin).href;
}

export async function showPartnerQr() {
  if (readonly()) return errorDialog(new Error('Die Supportansicht ist ausschließlich lesend.'));
  try {
    const d = await portalRequest('/api/referral');
    if (!d.partner?.canRecommend) throw new Error('Für diesen Zugang ist kein Empfehlungslink freigegeben.');
    const code = makeReferralQr(referralLink(d.link));
    dialog('Ihr persönlicher Empfehlungs-QR-Code', `<p><b>${escape(d.partner.company)}</b></p><div class="partner-qr-code" role="img" aria-label="QR-Code zum persönlichen Empfehlungsformular">${code.svg}</div><p>Beim Scannen öffnet sich Ihr Empfehlungsformular. Die Anfrage wird eindeutig Ihrem Partnerkonto zugeordnet.</p><label>Empfehlungslink<input value="${escape(code.link)}" readonly></label><button type="button" class="primary" id="download-partner-qr">QR-Code herunterladen (SVG)</button>`);
    q('#download-partner-qr').onclick = () => {
      const url = URL.createObjectURL(new Blob([code.svg],{type:'image/svg+xml'}));
      const link = document.createElement('a');
      link.href = url; link.download = 'eigenheimverwalter-partner-qr.svg';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    };
  } catch (error) { errorDialog(error); }
}

export function recommendationForm(profile) {
  return `<form id="customer-recommendation-form"><div class="source-note">${profile.referralOnly
    ? 'Sie empfehlen einen Kunden ohne Gewerk und ohne Gebietsschutz. Nach seiner Bestätigung bleibt die Empfehlung eindeutig Ihrem Konto zugeordnet.'
    : `Der Kunde bestätigt seine Kontaktdaten und die Immobilienadresse für <b>${escape(profile.tradeName)}</b>. Die Zuordnung bleibt auf Ihr Partnerkonto und dessen Berechtigungen begrenzt.`}</div>
    <label>Kundenname<input name="name" autocomplete="name" maxlength="120" required></label>
    <label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
    <label>Straße und Hausnummer<input name="address" autocomplete="street-address" maxlength="180" required></label>
    <div class="form-grid"><label>Postleitzahl<input name="postalCode" pattern="[0-9]{5}" inputmode="numeric" maxlength="5" autocomplete="postal-code" required></label><label>Ort<input name="city" autocomplete="address-level2" maxlength="100" required></label></div>
    ${profile.referralOnly ? '' : `<label>Zuordnung<input value="${escape(profile.tradeName)}" readonly></label>`}
    <label class="check-row"><input name="consentConfirmed" type="checkbox" required> Der Kunde hat der Kontaktaufnahme zugestimmt.</label>
    <button type="submit" class="primary wide-action">Empfehlungs-E-Mail senden</button><p id="customer-recommendation-status" role="status" aria-live="polite"></p></form>`;
}

export async function openCustomerRecommendation() {
  if (readonly()) return errorDialog(new Error('Die Supportansicht ist ausschließlich lesend.'));
  try {
    const profile = (await portalRequest('/api/referral')).partner;
    if (!profile?.canRecommend) throw new Error('Für diesen Zugang ist keine Kundenempfehlung freigegeben.');
    dialog('Neuen Kunden empfehlen', recommendationForm(profile));
    const form = q('#customer-recommendation-form');
    let submitting = false;
    form.onsubmit = async event => {
      event.preventDefault();
      if (submitting || readonly()) return;
      if (form.reportValidity && !form.reportValidity()) return;
      const fields = new FormData(form), payload = Object.fromEntries(fields);
      payload.consentConfirmed = fields.has('consentConfirmed');
      const button = form.querySelector('button[type="submit"]'), status = q('#customer-recommendation-status');
      submitting = true; button.disabled = true; status.textContent = 'Empfehlung wird gespeichert und versendet …';
      try {
        const result = await portalRequest('/api/referral/invitations', {method:'POST', body:JSON.stringify(payload)});
        const sent = result.delivery?.status === 'sent' || result.status === 'sent';
        dialog(sent ? 'Empfehlung versendet' : 'Empfehlung gespeichert', `<p>${sent ? 'Die Bestätigungs-E-Mail wurde zum Versand angenommen.' : 'Die Empfehlung wurde erfasst. Ein erfolgreicher E-Mail-Versand ist noch nicht bestätigt; bitte nicht erneut anlegen.'}</p><div class="source-note">Absender: registrierung@eigenheimverwalter.de<br>Als Nächstes bestätigt der Kunde seine Angaben über den Link in der E-Mail. Erst danach wird die Zuordnung aktiv.</div><button type="button" class="primary" id="recommendation-finish">Zur Kundenübersicht</button>`);
        q('#recommendation-finish').onclick = () => {q('.referral-modal')?.remove(); renderReferralCustomers();};
      } catch (error) {
        status.className = 'error'; status.textContent = error.message;
        button.disabled = false; submitting = false;
      }
    };
  } catch (error) { errorDialog(error); }
}

export async function mountReferralActions() {
  q('#partner-referral-actions')?.remove();
  if (readonly()) return;
  const container = q('#content .page');
  if (!container) return;
  const d = await portalRequest('/api/referral');
  if (!d.partner?.canRecommend || container !== q('#content .page')) return;
  container.insertAdjacentHTML('afterbegin', `<section id="partner-referral-actions" class="card"><div class="toolbar"><div><h3>Kundenempfehlungen</h3><p class="muted">Neue Kunden einladen oder Ihren persönlichen Empfehlungslink weitergeben.</p></div><button type="button" class="primary" id="new-customer-recommendation">Neuen Kunden empfehlen</button></div><div class="referral-link"><input id="partner-referral-url" aria-label="Persönlicher Empfehlungslink" value="${escape(referralLink(d.link))}" readonly><button type="button" class="outline" id="copy-partner-referral">Link kopieren</button></div><p id="referral-copy-status" role="status"></p></section>`);
  q('#new-customer-recommendation').onclick = openCustomerRecommendation;
  q('#new-customer-recommendation').insertAdjacentHTML('afterend','<button type="button" class="outline" id="show-partner-qr">QR-Code</button>');
  q('#show-partner-qr').onclick = showPartnerQr;
  q('#copy-partner-referral').onclick = async () => {
    try { await navigator.clipboard.writeText(q('#partner-referral-url').value); q('#referral-copy-status').textContent = 'Empfehlungslink kopiert.'; }
    catch { q('#partner-referral-url').select(); q('#referral-copy-status').textContent = 'Bitte den markierten Link manuell kopieren.'; }
  };
}

export async function renderReferralCustomers() {
  try {
    const d = await portalRequest('/api/referral');
    const labels = {pending:'Bestätigung offen', accepted:'Vom Kunden bestätigt', successful:'Erfolgreicher Tipp', brokerage_in_progress:'Vermittlung durch eigenheimverwalter Makler', won:'Zugeordnet'};
    q('#section-label').textContent = 'KUNDENEMPFEHLUNGEN'; q('#page-title').textContent = 'Kunden und Immobilien';
    q('#content').innerHTML = `<div class="page"><h3>Ihre empfohlenen Kunden</h3><p class="muted">${d.partner.referralOnly ? 'Sie sehen ausschließlich Namen, maskierte E-Mail-Adressen und die von Ihnen vermittelten Adressen. Weitere Kunden- und Immobiliendaten bleiben gesperrt.' : 'Die Übersicht enthält ausschließlich Empfehlungen Ihres eigenen Partnerkontos.'}</p><div class="card table-wrap"><table><thead>${customerTableHead('Verkaufsakte / Equipment')}</thead><tbody>${d.invitations.map(row => `<tr><td>${escape(row.name)}<br><small>${escape(row.email)}</small></td><td>${d.partner.referralOnly?'Nicht freigegeben':'Nicht in der Empfehlung erfasst'}</td><td>${propertyRegion(row)}</td><td>${escape(labels[row.status] || row.status)}<br><small>Empfohlen: ${escape(new Date(row.createdAt).toLocaleDateString('de-DE'))}</small></td><td><span class="muted">${d.partner.referralOnly?'Kein Aktenzugriff als Tippgeber':'Aktenzugriff über die bestätigte Kundenzuordnung'}</span></td></tr>`).join('') || '<tr><td colspan="5">Noch keine Kunden empfohlen.</td></tr>'}</tbody></table></div></div>`;
    await mountReferralActions();
    q('#sidebar')?.classList.remove('open');
  } catch (error) { errorDialog(error); }
}

export async function confirmCustomerReferral() {
  const [kind, token] = location.pathname.split('/').filter(Boolean).slice(-2);
  if (kind !== 'empfehlung' || !token) return;
  try {
    const path = `/api/referral-invitations/${encodeURIComponent(token)}`, d = await portalRequest(path);
    dialog('Empfehlung und Daten bestätigen', `<form id="confirm-customer-referral"><p><b>${escape(d.partner.company)}</b> hat Sie empfohlen${d.referralOnly ? '.' : ` für ${escape(d.trade.name)}.`}</p><div class="source-note">${escape(d.customer.name)}<br>${escape(d.customer.email)}<br>${escape(d.customer.address)}<br>${escape(d.customer.postalCode)} ${escape(d.customer.city)}</div><label class="check-row"><input name="emailConfirmed" type="checkbox" required> Die E-Mail-Adresse ist korrekt.</label><label class="check-row"><input name="addressConfirmed" type="checkbox" required> Die Immobilienadresse ist korrekt.</label><label class="check-row"><input name="accepted" type="checkbox" required> Ich bestätige die Empfehlung und die Zuordnung zu diesem Partner.</label><button type="submit" class="primary wide-action">Angaben bestätigen</button><p id="confirm-referral-status" role="status"></p></form>`);
    const form = q('#confirm-customer-referral');
    let busy = false;
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || (form.reportValidity && !form.reportValidity())) return;
      busy = true;
      try {
        const fields = new FormData(form);
        await portalRequest(path, {method:'POST', body:JSON.stringify({accepted:fields.has('accepted'), emailConfirmed:fields.has('emailConfirmed'), addressConfirmed:fields.has('addressConfirmed')})});
        dialog('Empfehlung bestätigt', '<p>Vielen Dank. Ihre bestätigten Angaben wurden gespeichert und die Empfehlung wurde dem Partner zugeordnet.</p>');
      } catch (error) {busy = false; q('#confirm-referral-status').textContent = error.message;}
    };
  } catch (error) { errorDialog(error); }
}
