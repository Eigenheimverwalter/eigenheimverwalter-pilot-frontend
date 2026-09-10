import {portalRequest} from './partner-referrals.js?v=20260909-app-download';
import {portalRootPath} from './portal-navigation.mjs';
export async function openPremiumUpgrade(){
  if(window.ehvPortalContext?.supportView)return;
  const profile=await portalRequest('/api/partner-basic/profile');if(profile.referralOnly||profile.plan==='premium')return;
  document.querySelector('.premium-upgrade-modal')?.remove();
  const modal=document.createElement('div');modal.className='modal premium-upgrade-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.innerHTML=`<div class="modal-card"><div class="modal-head"><h3>Mit Premium weiterwachsen</h3><button class="close" aria-label="Schließen">×</button></div><p>Empfehlungen bleiben unbegrenzt. Premium erweitert Ihre Betreuung über drei Gewerkakten hinaus.</p><ul><li>Unbegrenzte eigene Kunden und Gewerkakten</li><li>Zwei enthaltene PLZ-Lizenzgebiete</li><li>Regionale Kundenchancen und erweiterte Servicefunktionen</li></ul><p>Ihre bestehenden Kunden, Akten und Dokumente bleiben erhalten. Vertrag und Zahlung bestätigen Sie gesondert.</p><button class="primary" data-start-upgrade>Premium-Upgrade starten</button><p role="status" data-upgrade-status></p></div>`;
  document.body.append(modal);modal.querySelector('.close').onclick=()=>modal.remove();
  const requestKey=crypto.randomUUID();modal.querySelector('[data-start-upgrade]').onclick=async event=>{const button=event.currentTarget,status=modal.querySelector('[data-upgrade-status]');button.disabled=true;status.textContent='Ihr bestehendes Partnerkonto wird übernommen …';try{
    const existing=await portalRequest('/api/partner-onboarding');
    if(existing.onboarding){location.assign(portalRootPath(window.__EHV_RUNTIME__?.basePath)+'partner-onboarding/'+existing.onboarding.onboarding_id+'/');return;}
    const {account,partner}=await portalRequest('/api/account');
    const result=await portalRequest('/api/partner-onboarding',{method:'POST',body:JSON.stringify({request_key:requestKey,requested_plan:'PREMIUM',existing_partner_id:partner.id,partner_type:profile.tradeId==='BROKER'?'BROKER_PARTNER':'EQUIPMENT_PARTNER',equipment_type:profile.tradeId==='BROKER'?null:profile.tradeId,prefilled_data:{company:partner.company,contact_name:account.name,email:account.email,phone:account.phone,address:account.address,postal_code:account.postalCode,city:account.city}})});
    location.assign(portalRootPath(window.__EHV_RUNTIME__?.basePath)+'partner-onboarding/'+result.onboarding_id+'/');
  }catch(error){status.textContent=error.message;button.disabled=false;}};
}
export async function mountPremiumPromotion(){
  const page=document.querySelector('#content .page');if(!page||window.ehvPortalContext?.supportView)return;
  const profile=await portalRequest('/api/partner-basic/profile');if(!page.isConnected||profile.referralOnly||profile.plan==='premium'||page.querySelector('.basic-premium-promotion'))return;
  const nav=document.querySelector('#nav');
  if(nav&&!nav.querySelector('[data-premium-menu]'))for(const label of ['Premium-Mitgliedschaft','Regionale Kundenchancen']){const button=document.createElement('button');button.type='button';button.dataset.premiumMenu='true';button.textContent='🔒 '+label;button.setAttribute('aria-label',label+' – mit Premium freischalten');button.onclick=()=>openPremiumUpgrade().catch(error=>{button.title=error.message;});nav.append(button);}
  const banner=document.createElement('section');banner.className='card basic-premium-promotion';banner.style.marginBottom='18px';banner.innerHTML='<div class="toolbar"><div><b>Sie nutzen Basic</b><p>Unbegrenzt empfehlen · bis zu 3 Gewerkakten betreuen. Mehr Möglichkeiten mit Premium.</p></div><button class="primary">Premium entdecken →</button></div>';banner.querySelector('button').onclick=openPremiumUpgrade;page.prepend(banner);
}
window.addEventListener('ehv-basic-rendered',()=>mountPremiumPromotion().catch(()=>{}));
