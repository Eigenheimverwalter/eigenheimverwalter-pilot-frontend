import {portalRequest} from './partner-referrals.js?v=20260909-qr-1';
const q=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatMarketingSize=bytes=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toLocaleString('de-DE',{maximumFractionDigits:1})} KB`:`${(bytes/(1024*1024)).toLocaleString('de-DE',{maximumFractionDigits:1})} MB`;
const date=value=>value?new Date(value).toLocaleString('de-DE'):'–';
const types={'application/pdf':'PDF','image/png':'PNG','image/jpeg':'JPG','image/webp':'WEBP','text/plain':'TXT'};
const statuses={draft:'Entwurf',published:'Für Partner freigegeben',deleted:'Dateilöschung ausstehend'};
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file)});
let generation=0;
export async function renderMarketingKit(){
  const current=++generation;
  q('#section-label').textContent='MARKETING-KIT';q('#page-title').textContent='Marketing-Kit';
  q('#content').innerHTML='<div class="page"><p role="status">Marketing-Kit wird geladen …</p></div>';
  try{
    const data=await portalRequest('/api/marketing-kit');if(current!==generation||q('#section-label').textContent!=='MARKETING-KIT')return;
    const manage=data.canManage;
    q('#page-title').textContent=manage?'Marketing-Kit Einstellungen':'Marketing-Kit';
    q('#content').innerHTML=`<div class="page marketing-kit"><header><h2>${manage?'Inhalte für Partner verwalten':'Materialien für Ihre Kundenansprache'}</h2><p class="muted">${manage?'Dateien hochladen, prüfen und ausdrücklich für alle aktiven Partner freigeben. Neue Dateien sind zunächst Entwürfe.':'Hier finden Sie die von eigenheimverwalter freigegebenen Vorlagen zum Ansehen und Herunterladen.'}</p></header><p id="marketing-status" role="status" aria-live="polite"></p>${Object.entries(data.categories).map(([category,label])=>`<section class="card marketing-category"><h3>${escape(label)}</h3>${manage?`<label class="marketing-drop" data-category="${category}" tabindex="0"><span><b>Dateien hierher ziehen oder auswählen</b><small>PDF, PNG, JPG, WEBP oder TXT · maximal 10 MB je Datei</small></span><input type="file" data-category="${category}" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" multiple aria-label="${escape(label)} hochladen"></label>`:''}<div class="table-wrap"><table><thead><tr><th>Name</th><th>Dokumententyp</th><th>Größe</th><th>Hochgeladen am</th>${manage?'<th>Freigabe</th>':''}<th>Aktionen</th></tr></thead><tbody>${data.assets.filter(a=>a.category===category).map(a=>`<tr><td><b>${escape(a.name)}</b></td><td>${escape(types[a.mimeType]||a.mimeType)}</td><td>${formatMarketingSize(a.size)}</td><td>${date(a.createdAt)}</td>${manage?`<td><span class="status ${a.status==='published'?'active':'invited'}">${statuses[a.status]}</span>${a.publishedAt?`<br><small>Freigegeben ${date(a.publishedAt)}</small>`:''}</td>`:''}<td><div class="marketing-actions">${a.status!=='deleted'?`<button class="outline" data-action="view" data-id="${a.id}">Ansehen</button><button class="outline" data-action="download" data-id="${a.id}">Herunterladen</button>${manage?`<button class="${a.status==='draft'?'primary':'outline'}" data-action="${a.status==='draft'?'publish':'withdraw'}" data-id="${a.id}">${a.status==='draft'?'Für Partner freigeben':'Freigabe zurückziehen'}</button>`:''}`:''}${manage?`<button class="outline marketing-delete" data-action="delete" data-id="${a.id}">${a.status==='deleted'?'Löschung erneut versuchen':'Löschen'}</button>`:''}</div></td></tr>`).join('')||`<tr><td colspan="${manage?6:5}" class="empty">${manage?'Noch keine Datei hochgeladen.':'Hier sind noch keine Materialien freigegeben.'}</td></tr>`}</tbody></table></div></section>`).join('')}</div>`;
    const page=q('#content .marketing-kit'),report=(text,error=false)=>{const element=q('#marketing-status');if(element&&page.isConnected){element.textContent=text;element.className=error?'error':'source-note'}};
    let busy=false;
    const upload=async(category,fileList)=>{
      if(busy)return;const files=Array.from(fileList);if(!files.length)return;busy=true;
      page.querySelectorAll('button,input').forEach(e=>e.disabled=true);
      let count=0;const errors=[];
      for(const file of files){try{if(!file.size||file.size>data.maxBytes)throw Error('Datei ist leer oder größer als 10 MB.');report(`${file.name} wird hochgeladen …`);await portalRequest('/api/marketing-kit',{method:'POST',body:JSON.stringify({category,name:file.name,content:await readFile(file)})});count++;}catch(error){errors.push(`${file.name}: ${error.message}`)}}
      busy=false;if(!page.isConnected)return;await renderMarketingKit();const element=q('#marketing-status');if(element){element.className=errors.length?'error':'source-note';element.textContent=`${count} Datei(en) als Entwurf gespeichert.${errors.length?' '+errors.join(' · '):' Bitte ansehen und anschließend freigeben.'}`;}
    };
    page.querySelectorAll('.marketing-drop').forEach(zone=>{
      const input=zone.querySelector('input');input.onchange=()=>upload(zone.dataset.category,input.files);
      zone.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===zone){e.preventDefault();input.click()}};
      zone.ondragover=e=>{e.preventDefault();zone.classList.add('dragging')};zone.ondragleave=()=>zone.classList.remove('dragging');
      zone.ondrop=e=>{e.preventDefault();zone.classList.remove('dragging');upload(zone.dataset.category,e.dataTransfer.files)};
    });
    page.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
      if(busy)return;const asset=data.assets.find(a=>a.id===button.dataset.id),action=button.dataset.action;
      if(action==='delete'&&!window.confirm(`„${asset.name}“ endgültig löschen? Die Datei wird auch für Partner entfernt.`))return;
      if(action==='publish'&&!window.confirm(`„${asset.name}“ für alle aktiven Partner freigeben?`))return;
      busy=true;button.disabled=true;
      try{
        if(action==='view'||action==='download'){
          const result=await portalRequest(`/api/marketing-kit/${asset.id}/file`);
          if(action==='view')previewMarketingFile(result);
          else {const response=await fetch(result.url);if(!response.ok)throw Error('Download fehlgeschlagen. Bitte erneut versuchen.');const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=asset.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
        }else{
          await portalRequest(`/api/marketing-kit/${asset.id}`,{method:action==='delete'?'DELETE':'PATCH',body:JSON.stringify({version:asset.version,...(action==='delete'?{}:{status:action==='publish'?'published':'draft'})})});
          if(page.isConnected){await renderMarketingKit();const note=q('#marketing-status');if(note)note.textContent=action==='delete'?'Datei gelöscht.':action==='publish'?'Datei ist für Partner freigegeben.':'Freigabe zurückgezogen. Bereits heruntergeladene Kopien bleiben beim Empfänger.';}
        }
      }catch(error){if(action==='delete'&&page.isConnected)await renderMarketingKit();const note=q('#marketing-status');if(note){note.textContent=error.message;note.className='error'}}finally{busy=false;button.disabled=false;}
    });
  }catch(error){q('#content').innerHTML=`<div class="page"><p class="card error" role="alert">${escape(error.message)}</p></div>`;}
}
export function previewMarketingFile(result){
  q('.marketing-preview')?.remove();const asset=result.asset;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal marketing-preview" role="dialog" aria-modal="true" aria-label="Dateivorschau"><div class="modal-card"><div class="modal-head"><h3>${escape(asset.name)}</h3><button class="close" aria-label="Vorschau schließen">×</button></div><p>${escape(types[asset.mimeType])} · ${formatMarketingSize(asset.size)}</p><div class="marketing-preview-body"></div><p class="muted">Der Dateilink ist kurzzeitig gültig. Falls nötig, die Vorschau erneut öffnen.</p></div></div>`);
  const modal=q('.marketing-preview'),box=modal.querySelector('.marketing-preview-body'),close=modal.querySelector('.close');close.onclick=()=>modal.remove();close.focus();modal.onkeydown=e=>{if(e.key==='Escape')modal.remove()};
  if(asset.mimeType.startsWith('image/')){const image=document.createElement('img');image.src=result.url;image.alt=asset.name;box.append(image);}
  else if(asset.mimeType==='text/plain'){const pre=document.createElement('pre');box.append(pre);pre.textContent='Text wird geladen …';fetch(result.url).then(r=>{if(!r.ok)throw Error('Datei konnte nicht geladen werden.');return r.text()}).then(text=>pre.textContent=text).catch(e=>pre.textContent=e.message);}
  else{const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';link.className='outline';link.textContent='PDF in neuem Fenster öffnen';box.append(link);const frame=document.createElement('iframe');frame.src=result.url;frame.title=asset.name;frame.setAttribute('sandbox','');box.append(frame);}
}
