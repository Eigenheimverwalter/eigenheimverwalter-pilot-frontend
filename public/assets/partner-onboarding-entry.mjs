export const escapeOnboarding=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeOnboarding;
export function onboardingLocation(path,hash){
  const match=String(path).match(/\/partner-onboarding\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  const token=new URLSearchParams(String(hash).replace(/^#/, '')).get('token');
  return {id:match?.[1]||null,token:token&&/^[a-f0-9]{64}$/.test(token)?token:null};
}
export function onboardingAuthMarkup(invitation,register=false){
  return `<section class="card"><h2>${register?'Persönlichen Zugang anlegen':'Mit vorhandenem Zugang anmelden'}</h2>
    <p>${register?'Sie vergeben zunächst nur Ihr Passwort. Vertragsbestätigungen folgen in einem eigenen Schritt.':'Verwenden Sie die E-Mail-Adresse, an die Ihre Einladung geschickt wurde.'}</p>
    <form data-onboarding-auth><label>E-Mail-Adresse<input name="email" type="email" autocomplete="username" value="${esc(invitation?.email||'')}" ${invitation?.email?'readonly':''} required></label>
    <label>Passwort<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" ${register?'minlength="12" maxlength="128"':''} required></label>
    ${register?'<small>12–128 Zeichen, Groß-/Kleinbuchstaben, Zahl und Sonderzeichen (!@#$%^&amp;*).</small><label>Passwort wiederholen<input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>':''}
    <p data-error role="alert"></p><button type="submit" class="primary">${register?'Zugang anlegen & weiter':'Anmelden & Registrierung fortsetzen'}</button></form>
    <div class="onboarding-actions">${!invitation?.registered&&!invitation?.login_required&&invitation?.email?`<button type="button" class="outline" data-toggle-auth>${register?'Ich habe bereits einen Zugang':'Ich benötige einen neuen Zugang'}</button>`:''}
    <button type="button" class="link" data-forgot>Passwort vergessen?</button></div></section>`;
}
export function onboardingDataMarkup(flow){
  const data=flow.prefilled_data||{},fields=[['company','Unternehmen',180,'organization'],['contact_name','Ansprechpartner',120,'name'],['phone','Telefonnummer',50,'tel'],['address','Geschäftsadresse',180,'street-address'],['postal_code','Postleitzahl der Geschäftsadresse',5,'postal-code'],['city','Ort',100,'address-level2']];
  return `<section class="card"><h2>Unternehmens- & Kontaktdaten prüfen</h2><p>Bereits hinterlegte Angaben wurden übernommen. Ihre Login-E-Mail bleibt unverändert.</p>
    <p><b>${esc(flow.requested_plan==='PREMIUM'?'Premium':'Basic')}</b> · ${esc({REFERRAL:'Tippgeber',BROKER_PARTNER:'Maklerpartner',EQUIPMENT_PARTNER:'Handwerkspartner'}[flow.partner_type]||flow.partner_type)} ${flow.equipment_type?'· '+esc(flow.equipment_type):''}</p>
    <form data-onboarding-data><label>Login-E-Mail<input type="email" value="${esc(data.email)}" readonly></label><div class="form-grid">
    ${fields.map(([name,label,max,autocomplete])=>`<label>${label}<input name="${name}" value="${esc(data[name])}" maxlength="${max}" autocomplete="${autocomplete}" ${name==='phone'?'type="tel"':name==='postal_code'?'inputmode="numeric" pattern="[0-9]{5}"':''} required></label>`).join('')}</div>
    ${flow.requested_plan==='BASIC'?'<p class="source-note">Die Geschäftsadresse ist keine PLZ-Lizenz. Basic benötigt kein Lizenzgebiet und keinen Checkout.</p>':'<p class="source-note">Premium: Die Auswahl und Reservierung Ihrer zwei enthaltenen Lizenzgebiete erfolgt vor dem Checkout. Die Geschäftsadresse ist keine Reservierung.</p>'}
    <p data-error role="alert"></p><button type="submit" class="primary">Angaben speichern & weiter</button></form></section>`;
}
