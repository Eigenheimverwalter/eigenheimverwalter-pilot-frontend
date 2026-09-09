import {portalRequest} from './partner-referrals.js?v=20260909-qr-1';
import {previewMarketingFile} from './marketing-kit.js?v=20260909-legal-1';
import {legalStepMarkup} from './partner-legal-step.mjs';
// Phase 2 component; the central onboarding shell supplies the current own flow
// and next-step callback in phase 3/5. Do not mount it on legacy invitation flows.
export async function renderPartnerLegalStep(container,onboardingId,{onContinue}={}){
  if(!document.querySelector('link[data-partner-legal-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./partner-legal-step.css',import.meta.url).href;style.dataset.partnerLegalStyle='';document.head.append(style);}
  const path=`/api/partner-onboarding/${encodeURIComponent(onboardingId)}/legal`;
  container.textContent='Rechtsdokumente werden geladen …';
  try{
    const data=await portalRequest(path);if(!container.isConnected)return;
    container.innerHTML=legalStepMarkup(data);
    const form=container.querySelector('[data-legal-consent]'),status=container.querySelector('[data-legal-status]'),submit=form.querySelector('[type=submit]');
    let busy=false;
    const valid=()=>data.dataComplete&&!data.missingDocumentTypes.length&&data.documents.length>=2&&[...form.querySelectorAll('[type=checkbox]')].every(x=>x.checked);
    const refresh=()=>{submit.disabled=busy||!valid()};form.onchange=refresh;refresh();
    form.querySelectorAll('[data-legal-preview]').forEach(button=>button.onclick=async()=>{
      if(busy)return;button.disabled=true;
      try{const file=await portalRequest(`${path}/${button.dataset.legalPreview}/file`);if(container.isConnected)previewMarketingFile(file);}
      catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!valid())return;busy=true;refresh();
      form.querySelectorAll('[type=checkbox]').forEach(x=>x.disabled=true);status.textContent='Bestätigungen werden gespeichert …';
      try{
        const result=await portalRequest(path,{method:'POST',body:JSON.stringify({documents:data.documents.map(d=>({id:d.id,version:d.version,accepted:d.accepted||form.elements.namedItem(d.id)?.checked===true}))})});
        if(!container.isConnected)return;
        if(!result.accepted)throw Error('Die Bestätigungen sind noch nicht vollständig gespeichert. Bitte den aktuellen Stand neu laden.');
        status.textContent='Ihre Bestätigungen wurden gespeichert. Dies allein aktiviert noch keine kostenpflichtige Kooperation.';
        if(onContinue)await onContinue(result);else{await renderPartnerLegalStep(container,onboardingId);return;}
      }catch(error){
        if(!container.isConnected)return;
        status.textContent=error.message+' Bitte den aktuellen Dokumentenstand neu laden.';
        const reload=document.createElement('button');reload.type='button';reload.className='outline';reload.textContent='Dokumente neu laden';
        reload.onclick=()=>renderPartnerLegalStep(container,onboardingId,{onContinue});status.append(document.createTextNode(' '),reload);
        // Ambiguous responses/stale versions require a reload before a retry.
        return;
      }
      busy=false;form.querySelectorAll('[type=checkbox]').forEach(x=>x.disabled=false);refresh();
    };
  }catch(error){container.textContent=error.message;}
}
