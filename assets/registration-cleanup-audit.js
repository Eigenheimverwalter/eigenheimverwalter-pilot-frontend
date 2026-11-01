const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>value?new Date(value).toLocaleString('de-DE'):'–';
const status=value=>({ELIGIBLE:'Offen',COMPLETED:'Abgeschlossen',WITHDRAWN:'Auf Wunsch gelöscht',AUTO_REMOVED:'Automatisch bereinigt',REVIEW_REQUIRED:'Prüfung erforderlich'}[value]||value||'–');

function installAuditButton(){
  const content=document.querySelector('#content');
  if(!content||content.querySelector('#registration-cleanup-audit-button'))return;
  const heading=content.querySelector('h3');
  if(heading?.textContent?.trim()!=='Eigenheime / Kunden')return;
  const toolbar=content.querySelector('.toolbar');
  if(!toolbar)return;
  const button=document.createElement('button');
  button.id='registration-cleanup-audit-button';
  button.className='outline';
  button.textContent='Registrierungsprotokoll';
  toolbar.append(button);
  button.addEventListener('click',async()=>{
    button.disabled=true;
    button.textContent='Protokoll wird geladen …';
    try{
      const result=await window.ehvApi('/api/registration-cleanup/audit');
      const rows=Array.isArray(result.rows)?result.rows:[];
      const events=Array.isArray(result.events)?result.events:[];
      const eventRows=events.map(event=>{
        const row=rows.find(candidate=>String(candidate.source_user_id)===String(event.sourceUserId));
        return `<tr><td>${date(event.occurredAt)}</td><td>${esc(row?.email||`Kunden-ID ${event.sourceUserId}`)}</td><td>${esc(event.label)}</td><td>${event.sequence?`Stufe ${event.sequence}`:'–'}</td></tr>`;
      }).join('');
      const statusRows=rows.map(row=>`<tr><td>${esc(row.email||`Kunden-ID ${row.source_user_id}`)}</td><td>${esc(status(row.status))}</td><td>${row.reminder_count||0}</td><td>${date(row.withdrawal_requested_at)}</td><td>${date(row.removed_at)}</td><td>${date(row.updated_at)}</td></tr>`).join('');
      const existing=content.querySelector('#registration-cleanup-audit');
      if(existing)existing.remove();
      content.querySelector('.page')?.insertAdjacentHTML('beforeend',`<section class="card" id="registration-cleanup-audit" style="margin-top:18px"><div class="toolbar"><div><span class="kicker">NACHWEIS · UNVERÄNDERLICHE EREIGNISSE</span><h3>Registrierungs- und Reaktionsprotokoll</h3><p class="muted">Versand, Rückläufer, bestätigte Abbrüche und Löschungen mit Zeitstempel.</p></div><button class="outline" id="registration-cleanup-audit-close">Schließen</button></div><h4>Aktueller Bearbeitungsstand</h4><div class="table-wrap"><table><thead><tr><th>Konto</th><th>Status</th><th>Mails</th><th>Löschung bestätigt</th><th>Gelöscht am</th><th>Letzte Änderung</th></tr></thead><tbody>${statusRows||'<tr><td colspan="6">Keine Vorgänge vorhanden.</td></tr>'}</tbody></table></div><h4 style="margin-top:24px">Ereignisverlauf</h4><div class="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Konto</th><th>Ereignis</th><th>Stufe</th></tr></thead><tbody>${eventRows||'<tr><td colspan="4">Keine Ereignisse vorhanden.</td></tr>'}</tbody></table></div></section>`);
      content.querySelector('#registration-cleanup-audit-close')?.addEventListener('click',()=>content.querySelector('#registration-cleanup-audit')?.remove());
      content.querySelector('#registration-cleanup-audit')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){window.alert(error instanceof Error?error.message:'Registrierungsprotokoll konnte nicht geladen werden.');}
    finally{button.disabled=false;button.textContent='Registrierungsprotokoll';}
  });
}

const start=()=>{
  const content=document.querySelector('#content');
  if(!content)return;
  new MutationObserver(installAuditButton).observe(content,{childList:true,subtree:true});
  installAuditButton();
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
