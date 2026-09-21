const bridge=window.ehvSupabaseBridge;
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const formatDate=value=>value?new Date(value).toLocaleString('de-DE'):'Nicht dokumentiert';

async function addInvitationControl(partnerId){
  if(!bridge?.enabled)return;
  const data=await bridge.request(`/api/partners/${partnerId}`);
  if(!data?.partner||data.partner.status!=='invited'||document.querySelector('[data-partner-invitation-control]'))return;
  const invitation=data.invitation,expired=invitation&&new Date(invitation.expiresAt).getTime()<=Date.now(),section=document.createElement('article');
  section.className='card';section.dataset.partnerInvitationControl='true';section.style.marginTop='18px';
  section.innerHTML=`<div class="card-head"><div><span class="kicker">REGISTRIERUNGSEINLADUNG</span><h3>${expired?'Frist abgelaufen':'Registrierung noch offen'}</h3></div><span class="status ${expired?'high':'invited'}">${expired?'Abgelaufen':'Ausstehend'}</span></div><p>Empfänger: <b>${escapeHtml(data.partner.email)}</b><br><small>Letzte Einladung: ${formatDate(invitation?.createdAt)} · gültig bis ${formatDate(invitation?.expiresAt)}</small></p><div class="source-note">Beim erneuten Versand wird der bisherige Link sofort ungültig. Der neue Link ist sieben Tage gültig und die Aktion wird protokolliert.</div><button class="primary" data-resend-partner-invitation>Neue Registrierungseinladung senden</button>`;
  const anchor=document.querySelector('#content .grid-2');if(anchor)anchor.insertAdjacentElement('afterend',section);else document.querySelector('#content .page')?.append(section);
  section.querySelector('[data-resend-partner-invitation]').onclick=async event=>{const button=event.currentTarget;if(!confirm(`Neue Registrierungseinladung an ${data.partner.email} senden?`))return;button.disabled=true;button.textContent='Einladung wird versendet …';try{const result=await bridge.request(`/api/partners/${partnerId}/registration-invitation/resend`,{method:'POST',body:'{}'});section.querySelector('h3').textContent='Neue Einladung wurde versendet';section.querySelector('.status').textContent='Versendet';section.querySelector('.status').className='status active';section.querySelector('small').textContent=`Neu versendet: ${formatDate(result.invitation.createdAt)} · gültig bis ${formatDate(result.invitation.expiresAt)}`;button.remove();const toast=document.querySelector('#toast');toast.textContent=`Neue Einladung an ${data.partner.email} versendet`;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3200)}catch(error){button.disabled=false;button.textContent='Neue Registrierungseinladung senden';alert(error.message||'Die Einladung konnte nicht versendet werden')}};
}

document.addEventListener('click',event=>{const button=event.target.closest('.partner-record');if(button)setTimeout(()=>addInvitationControl(button.dataset.id).catch(()=>{}),250)});
