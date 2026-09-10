import './supabase-bridge.js?v=20260910-checkout';
import {isSelfServicePath,selfServiceEmailMarkup,selfServicePasswordMarkup,selfServicePlanMarkup,validSelfServicePassword} from './partner-self-service.mjs';
import {renderPartnerLegalStep} from './partner-legal-step.js?v=20260909-onboarding-entry';
import {onboardingLocation,onboardingAuthMarkup,onboardingDataMarkup,escapeOnboarding as esc} from './partner-onboarding-entry.mjs';
import {renderPremiumStep} from './partner-premium.js?v=20260910-membership';
const bridge=window.ehvSupabaseBridge,host=document.querySelector('#onboarding-step'),logout=document.querySelector('#onboarding-logout');
const locationData=onboardingLocation(location.pathname,location.hash),id=locationData.id;
const selfService=!id&&isSelfServicePath(location.pathname);
let token=locationData.token,invitation=null,busy=false;
const path=`/api/partner-onboarding/${id}`;
const request=(url,method='GET',data)=>bridge.request(url,{method,...(data?{body:JSON.stringify(data)}:{})});
const publicRequest=(action,data={})=>request(`/api/onboarding-invitations/${id}/${action}`,'POST',{token,...data});
const clearToken=()=>{token=null;history.replaceState(null,'',location.pathname);};
const showError=error=>{
  host.innerHTML=`<section class="card"><h2>Registrierung noch nicht abgeschlossen</h2><p data-error role="alert">${esc(error.message)}</p><button type="button" class="outline" data-retry>Erneut prüfen</button></section>`;
  host.querySelector('[data-retry]').onclick=()=>start();
};
function authForm(register){
  host.innerHTML=onboardingAuthMarkup(invitation,register);
  if(selfService)host.querySelector('section>p').textContent='Melden Sie sich mit Ihrer bestätigten E-Mail-Adresse an. Bereits aktive Partner nutzen ihren bestehenden Portalzugang.';
  const form=host.querySelector('form'),status=host.querySelector('[data-error]'),submit=form.querySelector('[type=submit]');
  host.querySelector('[data-toggle-auth]')?.addEventListener('click',()=>authForm(!register));
  host.querySelector('[data-forgot]').onclick=async()=>{
    if(busy)return;const email=form.elements.email.value.trim();if(!form.elements.email.reportValidity())return;
    busy=true;submit.disabled=true;
    try{const result=await request('/api/password/forgot','POST',{email});status.textContent=result.message+' Kehren Sie danach zu diesem Einladungslink zurück.';}catch(error){status.textContent=error.message;}finally{busy=false;submit.disabled=false;}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;submit.disabled=true;status.textContent='Zugang wird geprüft …';
    try{
      const data=Object.fromEntries(new FormData(form));
      if(register)await publicRequest('register',{password:data.password,passwordConfirmation:data.passwordConfirmation});
      await bridge.signInForOnboarding(data.email,data.password);form.reset();
      await resume();
    }catch(error){status.textContent=error.message;}finally{busy=false;submit.disabled=false;}
  };
}
function dataForm(flow){
  host.innerHTML=onboardingDataMarkup(flow);const form=host.querySelector('form'),status=host.querySelector('[data-error]'),submit=form.querySelector('[type=submit]');
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;submit.disabled=true;
    try{const updated=await request(`${path}/data`,'PATCH',{version:flow.version,data:Object.fromEntries(new FormData(form))});await renderFlow(updated);}
    catch(error){status.textContent=error.message;if(error.code==='ONBOARDING_CHANGED'){const reload=document.createElement('button');reload.type='button';reload.className='outline';reload.textContent='Aktuellen Stand laden';reload.onclick=()=>resume().catch(showError);status.append(reload);}}
    finally{busy=false;submit.disabled=false;}};
}
async function renderFlow(flow){
  if(['CREATED','INVITED'].includes(flow.onboarding_status))flow=await request(`${path}/start`,'POST',token?{token}:{});
  if(['STARTED','DATA_INCOMPLETE'].includes(flow.onboarding_status))return dataForm(flow);
  if(flow.requested_plan==='PREMIUM'&&['DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED'].includes(flow.onboarding_status))return renderPremiumStep(host,flow,{request,resume});
  if(['DATA_COMPLETE','LEGAL_PENDING'].includes(flow.onboarding_status)){
    await renderPartnerLegalStep(host,id,{onContinue:()=>resume()});
    const back=document.createElement('button');back.type='button';back.className='outline';back.textContent='Unternehmensdaten ändern';back.onclick=()=>dataForm(flow);host.prepend(back);return;
  }
  const complete=flow.onboarding_status==='ACTIVE';
  host.innerHTML=`<section class="card"><h2>${complete?'Kooperation aktiv':'Ihr aktueller Registrierungsstand'}</h2><p>Status: <b>${esc(flow.onboarding_status)}</b></p>
    <p>${complete?'Die Aktivierung wurde vom System bestätigt.':['CANCELLED','EXPIRED'].includes(flow.onboarding_status)?'Dieser Vorgang kann nicht fortgesetzt werden. Bitte wenden Sie sich an Ihr eigenheimverwalter-Team.':'Ihre Angaben bleiben gespeichert. Zahlung, Lizenzierung und Aktivierung müssen anschließend serverseitig bestätigt werden. Dieser Vorbereitungsschritt löst keine Zahlung aus.'}</p>
    ${complete?'<p><a class="primary" href="./">Zum Partnerportal</a></p>':''}<button class="outline" data-refresh type="button">Status aktualisieren</button></section>`;
  host.querySelector('[data-refresh]').onclick=()=>resume().catch(showError);
}
async function resume(){
  if(selfService)return resumeSelfService();
  logout.hidden=false;let flow;
  try{flow=await request(path);}catch(error){if(!token||![403,404].includes(error.status))throw error;flow=await publicRequest('claim');}
  clearToken();await renderFlow(flow);
}
logout.onclick=async()=>{if(busy)return;busy=true;try{await request('/api/logout','POST',{});logout.hidden=true;invitation=null;if(selfService)selfServiceEmail();else authForm(false);}catch(error){showError(error);}finally{busy=false;}};
async function start(){
  try{
    if((!id&&!selfService)||!bridge?.enabled)throw Error('Bitte öffnen Sie den vollständigen Registrierungslink im eigenheimverwalter-Portal.');
    if(await bridge.onboardingAuthUser())return await resume();
    if(selfService)return selfServiceEmail();
    if(token){invitation=await publicRequest('inspect');authForm(!invitation.registered&&!invitation.login_required);}else authForm(false);
  }catch(error){showError(error);}
}
function selfServiceSubmit(run){
  const form=host.querySelector('form'),status=host.querySelector('[data-error]'),submit=form.querySelector('[type=submit]');
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;submit.disabled=true;status.textContent='Bitte warten …';
    try{await run(Object.fromEntries(new FormData(form)),status,form);}catch(error){status.textContent=error.message;}finally{busy=false;submit.disabled=false;}};
}
function selfServiceEmail(){
  host.innerHTML=selfServiceEmailMarkup();host.querySelector('[data-login]').onclick=()=>authForm(false);
  selfServiceSubmit(async(data,status)=>{const result=await request('/api/onboarding-self-service/email','POST',{email:data.email});status.textContent=result.message;});
}
async function resumeSelfService(){
  logout.hidden=false;
  const state=await request('/api/onboarding-self-service/session','POST',{});
  // Supabase consumes its own one-time Auth fragment. Do not persist it ourselves.
  history.replaceState(null,'',location.pathname);
  if(state.needs_password){
    host.innerHTML=selfServicePasswordMarkup(state.email);
    selfServiceSubmit(async(data,status,form)=>{
      if(!validSelfServicePassword(data.password,data.passwordConfirmation))throw Error('Bitte identische Passwörter mit den genannten Anforderungen eingeben.');
      await bridge.updatePassword(data.password);form.reset();await resumeSelfService();
    });return;
  }
  const go=id=>location.assign(new URL(id,location.href).href);
  if(state.onboarding_id){go(state.onboarding_id);return;}
  const catalog=await request('/api/partner-basic/trades'),trades=catalog.trades.filter(t=>!['BROKER','broker','whitelabel'].includes(t.id));
  host.innerHTML=selfServicePlanMarkup(state.email,trades);
  const form=host.querySelector('form'),kind=form.elements.partner_type,plan=form.elements.requested_plan,equipment=form.elements.equipment_type;
  const sync=()=>{const premium=plan.value==='PREMIUM';
    kind.querySelector('[value="REFERRAL"]').disabled=premium;if(premium&&kind.value==='REFERRAL')kind.value='EQUIPMENT_PARTNER';
    const needsTrade=kind.value==='EQUIPMENT_PARTNER';equipment.disabled=!needsTrade;equipment.required=needsTrade;host.querySelector('[data-equipment]').hidden=!needsTrade;
    host.querySelector('[data-plan-note]').textContent=premium?'Premium: Zwei PLZ-Lizenzgebiete sind enthalten. Vertrag, Preis und Zahlung bestätigen Sie erst in den folgenden Schritten.':'Basic benötigt kein PLZ-Lizenzgebiet und keine Zahlung.';
  };plan.onchange=sync;kind.onchange=sync;sync();
  const requestKey=crypto.randomUUID();
  selfServiceSubmit(async(data)=>{
    const result=await request('/api/partner-onboarding','POST',{request_key:requestKey,requested_plan:data.requested_plan,partner_type:data.partner_type,equipment_type:data.equipment_type,prefilled_data:{}});
    go(result.onboarding_id);
  });
}
start();
