import {appDownloadPanel} from './app-downloads.mjs';
await import('../runtime-config.js');
await import('./supabase-bridge.js');
const token=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||''),form=document.querySelector('#registration-form'),title=document.querySelector('#registration-title'),copy=document.querySelector('#registration-copy'),message=document.querySelector('#registration-message');
const api=async(options={})=>{const path=`/api/customer-registration/${encodeURIComponent(token)}`,bridge=window.ehvSupabaseBridge;if(bridge?.handles(path))return bridge.request(path,options);throw Error('Supabase-Schnittstelle nicht verfügbar')};
try{const invitation=await api();title.textContent=`Willkommen, ${invitation.firstName}`;copy.textContent=`Ihre Einladung für ${invitation.email} ist bis ${new Date(invitation.expiresAt).toLocaleDateString('de-DE')} gültig.`;document.querySelector('#registration-email').value=invitation.email;form.hidden=false}catch(error){title.textContent='Einladung nicht verfügbar';copy.textContent=error.message}
let busy=false;
form.onsubmit=async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  busy=true;const button=form.querySelector('button');button.disabled=true;
  message.textContent='Registrierung wird sicher verarbeitet …';
  try{
    const fields=new FormData(form),values={...Object.fromEntries(fields),consent:fields.has('consent')};
    await api({method:'POST',body:JSON.stringify(values)});
    form.reset();form.hidden=true;title.textContent='Registrierung abgeschlossen';
    copy.textContent='Ihre Registrierung im eigenheimverwalter-Portal wurde erfolgreich gespeichert.';
    message.textContent='';document.querySelector('#registration-downloads').innerHTML=appDownloadPanel();
  }catch(error){message.textContent=error.message;busy=false;button.disabled=false}
};
