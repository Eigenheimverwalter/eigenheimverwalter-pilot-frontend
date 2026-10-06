let selectedPropertyId='';
let selectedTrade='';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

async function request(path,options={}){
  const bridge=window.ehvSupabaseBridge;
  if(bridge?.handles(path))return bridge.request(path,options);
  const base=String(window.__EHV_RUNTIME__?.legacyApiBase||'').replace(/\/$/,'');
  const csrf=window.ehvPortalContext?.csrf;
  const response=await fetch(`${base}${path}`,{
    ...options,
    credentials:'include',
    headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...(options.headers||{})}
  });
  const data=response.status===204?null:await response.json();
  if(!response.ok)throw new Error(data?.error||'Serviceakte konnte nicht angelegt werden');
  return data;
}

const fileData=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=reject;
  reader.readAsDataURL(file);
});

function closeDialog(){document.querySelector('.modal.production-service-modal')?.remove()}

const caseStatusLabel={new:'Neu',open:'Offen',in_progress:'In Bearbeitung',completed:'Abgeschlossen',cancelled:'Storniert'};

function caseForm(record={}){
  return `<form id="production-service-case-edit-form"><label>Titel<input name="title" required value="${escapeHtml(record.title||`${selectedTrade} · Service`)}"></label><div class="form-grid"><label>Priorität<select name="priority">${[['low','Niedrig'],['medium','Normal'],['high','Hoch']].map(([value,label])=>`<option value="${value}" ${record.priority===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Status<select name="status">${Object.entries(caseStatusLabel).map(([value,label])=>`<option value="${value}" ${String(record.status||'open')===value?'selected':''}>${label}</option>`).join('')}</select></label></div><label>Beschreibung<textarea name="description" rows="5">${escapeHtml(record.description||'')}</textarea></label><button class="primary wide-action">Änderungen speichern</button><button class="outline wide-action" type="button" id="delete-production-service-case">Serviceakte löschen</button></form>`;
}

function openEditDialog(record){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal production-service-modal" role="dialog" aria-modal="true"><div class="modal-card"><button class="modal-close" aria-label="Schließen">×</button><h2>Serviceakte pflegen</h2><div class="source-note">Änderungen werden als Admin-Eingriff protokolliert. Gewerkepartner können diesen Eintrag anschließend nur lesen.</div>${caseForm(record)}</div></div>`);
  const modal=document.querySelector('.production-service-modal');
  const form=modal.querySelector('#production-service-case-edit-form');
  modal.querySelector('.modal-close').onclick=closeDialog;
  form.onsubmit=async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    const submit=form.querySelector('button.primary');submit.disabled=true;
    try{await request(`/api/cases/${encodeURIComponent(record.id)}`,{method:'PATCH',body:JSON.stringify(values)});closeDialog();await renderAdminCases()}
    catch(error){submit.disabled=false;alert(error.message)}
  };
  modal.querySelector('#delete-production-service-case').onclick=async()=>{
    if(!confirm('Diese Serviceakte wirklich unwiderruflich löschen?'))return;
    try{await request(`/api/cases/${encodeURIComponent(record.id)}`,{method:'DELETE'});closeDialog();await renderAdminCases()}
    catch(error){alert(error.message)}
  };
}

async function renderAdminCases(){
  const target=document.querySelector('#admin-equipment-service-cases');
  if(!target)return;
  target.innerHTML='<p class="muted">Serviceakten werden geladen …</p>';
  try{
    const data=await request('/api/cases');
    const normalize=value=>String(value||'').trim().toLocaleLowerCase('de-DE');
    const cases=(data?.cases||[]).filter(item=>String(item.propertyId)===String(selectedPropertyId)&&normalize(item.category||item.trade)===normalize(selectedTrade));
    target.innerHTML=cases.length?cases.map(item=>`<div class="service-record-block"><div class="service-history"><div><b>${escapeHtml(item.title||'Serviceakte')}</b><small>${escapeHtml(item.description||'Ohne Beschreibung')}</small><small>${(item.documents||[]).length} Unterlage(n) · ${escapeHtml(caseStatusLabel[item.status]||item.status||'Offen')}</small></div><span class="status ${item.priority==='high'?'high':''}">${escapeHtml(item.priority==='high'?'Hoch':item.priority==='low'?'Niedrig':'Normal')}</span></div><button class="outline edit-production-service-case" data-case-id="${escapeHtml(item.id)}">Bearbeiten</button></div>`).join(''):'<p class="muted">Für dieses Gewerk wurde noch keine administrativ gepflegte Serviceakte angelegt.</p>';
    target.querySelectorAll('.edit-production-service-case').forEach(button=>button.onclick=()=>openEditDialog(cases.find(item=>String(item.id)===button.dataset.caseId)));
  }catch(error){target.innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`}
}

function openDialog(){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal production-service-modal" role="dialog" aria-modal="true"><div class="modal-card"><button class="modal-close" aria-label="Schließen">×</button><h2>Serviceakte ${escapeHtml(selectedTrade)} anlegen</h2><form id="production-service-case-form"><div class="source-note">Die Serviceakte wird direkt dieser Immobilie und dem Gewerk ${escapeHtml(selectedTrade)} zugeordnet.</div><label>Titel<input name="title" required value="${escapeHtml(selectedTrade)} · Service"></label><div class="form-grid"><label>Gewerk<input value="${escapeHtml(selectedTrade)}" readonly></label><label>Priorität<select name="priority"><option value="medium">Normal</option><option value="high">Hoch</option><option value="low">Niedrig</option></select></label></div><label>Beschreibung<textarea name="description" rows="4" placeholder="Auftrag, Feststellung oder gewünschte Leistung"></textarea></label><label class="dropzone">Unterlagen per Drag & Drop oder Dateiauswahl<input id="production-service-files" type="file" multiple accept="application/pdf,image/png,image/jpeg"><small>PDF, PNG oder JPG · mehrere Dateien möglich</small></label><div id="production-service-file-list" class="muted">Keine Unterlagen ausgewählt.</div><button class="primary wide-action">Serviceakte verbindlich anlegen</button></form></div></div>`);
  const modal=document.querySelector('.production-service-modal');
  const form=modal.querySelector('#production-service-case-form');
  const files=modal.querySelector('#production-service-files');
  const list=modal.querySelector('#production-service-file-list');
  modal.querySelector('.modal-close').onclick=closeDialog;
  files.onchange=()=>{list.textContent=[...files.files].map(file=>file.name).join(' · ')||'Keine Unterlagen ausgewählt.'};
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector('button.primary');
    submit.disabled=true;submit.textContent='Serviceakte wird angelegt …';
    try{
      const values=new FormData(form);
      const documents=await Promise.all([...files.files].map(async file=>({name:file.name,content:await fileData(file)})));
      await request('/api/cases',{method:'POST',body:JSON.stringify({propertyId:selectedPropertyId,title:values.get('title'),category:selectedTrade,priority:values.get('priority'),description:values.get('description'),documents})});
      closeDialog();
      window.dispatchEvent(new CustomEvent('ehv:service-case-created',{detail:{propertyId:selectedPropertyId,trade:selectedTrade}}));
      await renderAdminCases();
    }catch(error){submit.disabled=false;submit.textContent='Serviceakte verbindlich anlegen';alert(error.message)}
  };
}

function injectButton(){
  if(!selectedPropertyId||!selectedTrade||document.querySelector('#create-equipment-service-case'))return;
  const card=document.querySelector('.cockpit-card');
  if(!card)return;
  card.insertAdjacentHTML('afterbegin',`<div class="card-head production-service-create"><div><span class="kicker">ADMIN-SERVICEPFLEGE</span><h3>Serviceakte ${escapeHtml(selectedTrade)}</h3></div><button class="primary" id="create-equipment-service-case">+ Serviceakte anlegen</button></div><div id="admin-equipment-service-cases"></div>`);
  document.querySelector('#create-equipment-service-case').onclick=openDialog;
  renderAdminCases();
}

window.ehvAdminServiceCare={
  mount(propertyId,trade){
    selectedPropertyId=String(propertyId||'');
    selectedTrade=String(trade||'').trim();
    injectButton();
  }
};

document.addEventListener('click',event=>{
  const tradeSummary=event.target.closest?.('.trade-grid summary');
  if(tradeSummary){
    selectedPropertyId=String(document.querySelector('#cockpit-property')?.value||'');
    selectedTrade=tradeSummary.querySelector('span')?.textContent?.trim()||'';
    return;
  }
  const serviceTab=event.target.closest?.('[data-equipment-tab="service"]');
  if(serviceTab)queueMicrotask(injectButton);
});
