import {decodeMarketingFile,marketingMaxBytes} from './marketing-kit.mjs';
import {legalAudiences} from './legal-audience.mjs';
export const legalDocumentTypes=Object.freeze({TERMS:'AGB / Kooperationsbedingungen',PRIVACY:'Datenschutzinformationen',PRICE_SHEET:'Preisblatt',CONDITIONS:'Konditionsblatt'});
export const legalPermissionKeys=Object.freeze(['legal_documents.read','legal_documents.upload','legal_documents.approve','legal_documents.activate','legal_documents.delete']);
const fail=(message,status=422,code)=>{throw Object.assign(new Error(message),{status,code})};
export function legalPermissions(profile,roleProfiles=[],supportView=false){
  if(!profile||profile.status!=='active'||supportView)return[];
  if(profile.role==='super_admin')return[...legalPermissionKeys];
  if(profile.role!=='admin_light')return[];
  const assigned=roleProfiles.find(p=>p.role===profile.role)?.permissions||[];
  return legalPermissionKeys.filter(key=>assigned.includes(key)||assigned.includes('*'));
}
export const legalFileLimit=value=>{const size=Number(value);return Number.isInteger(size)&&size>0?Math.min(size,marketingMaxBytes):marketingMaxBytes};
export const legalDocumentMetadata=row=>({id:row.id,documentType:row.document_type,title:row.title,name:row.file_name,mimeType:row.mime_type,size:row.file_size,version:row.version,revision:row.revision,status:row.status,acceptanceText:row.acceptance_text,uploadedBy:row.uploaded_by,uploadedByName:row.uploaded_by_name||row.uploaded_by,createdAt:row.uploaded_at,approvedAt:row.approved_at,approvedBy:row.approved_by,effectiveFrom:row.effective_from,archivedAt:row.archived_at,deletionPending:Boolean(row.deletion_requested_at)});
export async function legalDocumentRequest({method,path,body={},profile,roleProfiles,supportView=false,store,files,maxBytes=marketingMaxBytes,newId=()=>crypto.randomUUID()}){
  const permissions=legalPermissions(profile,roleProfiles,supportView),need=key=>{if(!permissions.includes('legal_documents.'+key))fail('Für diese Aktion fehlt das Rechtsdokumenten-Recht. Der Super Admin kann es in der Zugangsverwaltung vergeben.',403,'LEGAL_PERMISSION_DENIED')};
  need('read');
  if(path==='/legal-documents'&&method==='GET')return{status:200,body:{permissions,types:legalDocumentTypes,audiences:legalAudiences,maxBytes:legalFileLimit(maxBytes),documents:(await store.list()).map(row=>({...legalDocumentMetadata(row),audience:row.audience||'LEGACY'}))}};
  if(path==='/legal-documents'&&method==='POST'){
    need('upload');
    if(!Object.hasOwn(legalDocumentTypes,body.documentType))fail('Bitte die Dokumentenart auswählen.');
    if(!Object.hasOwn(legalAudiences,body.audience))fail('Bitte Basic, Premium Handwerk oder Premium Makler als Zielgruppe auswählen.');
    const title=String(body.title||'').trim(),acceptanceText=String(body.acceptanceText||'').trim();
    if(!title||title.length>180||!acceptanceText||acceptanceText.length>2000)fail('Titel und rechtlich freigegebener Bestätigungstext sind erforderlich.');
    const file=decodeMarketingFile(body.name,body.content);
    if(file.mime!=='application/pdf')fail('Rechtsdokumente müssen als PDF hochgeladen werden.');
    if(file.bytes.length>legalFileLimit(maxBytes))fail('Die Datei überschreitet die konfigurierte maximale Größe.',413);
    const id=newId(),path=`${id}/${id}.pdf`,sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',file.bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    await files.upload(path,file.bytes,'application/pdf');
    let row;try{row=await store.change('UPLOAD',id,profile.id,null,{document_type:body.documentType,audience:body.audience,title,file_name:file.name,storage_path:path,file_size:file.bytes.length,sha256,acceptance_text:acceptanceText})}
    catch(error){
      // A lost DB response can still mean a successful insert. Verify before
      // deleting bytes; an uncertain committed document must remain available.
      let existing;try{existing=await store.get(id)}catch{throw error;}
      if(existing)row=existing;
      else if(error.status>=400&&error.status<500){await files.remove(path);throw error;}
      else fail('Der Upload konnte nicht eindeutig bestätigt werden. Bitte die Übersicht neu laden und vor einem erneuten Upload den Dokumentenstand prüfen.',503,'LEGAL_UPLOAD_UNCERTAIN');
    }
    return{status:201,body:{document:legalDocumentMetadata(row)}};
  }
  const match=path.match(/^\/legal-documents\/([0-9a-f-]{36})(?:\/(file))?$/i);
  if(!match)fail('Rechtsdokumenten-Route nicht gefunden.',404);
  const row=await store.get(match[1]);if(!row)fail('Dokument nicht gefunden.',404);
  if(method==='GET'&&match[2]){
    if(row.deletion_requested_at)fail('Die Dateilöschung wurde bereits begonnen.',410);
    await store.viewed(row.id,profile.id);
    return{status:200,body:{url:await files.signedUrl(row.storage_path,60,row.file_name),expiresIn:60,asset:{...legalDocumentMetadata(row),publishedAt:row.approved_at}}};
  }
  if(match[2]||!['PATCH','DELETE'].includes(method))fail('Methode nicht unterstützt.',405);
  if(!Number.isSafeInteger(body.revision)||body.revision!==row.revision)fail('Die Dokumentversion wurde geändert. Bitte neu laden.',409,'LEGAL_VERSION_CONFLICT');
  if(method==='DELETE'){
    need('delete');
    if(row.status!=='DRAFT')fail('Diese Dokumentversion ist freigegeben oder wurde bereits von Partnern akzeptiert und kann aus Nachweisgründen nicht gelöscht werden. Sie kann archiviert werden.',409,'LEGAL_DOCUMENT_RETAINED');
    const hidden=await store.change('DELETE_PREPARE',row.id,profile.id,row.revision,{});
    await files.remove(hidden.storage_path);
    await store.change('DELETE_COMPLETE',row.id,profile.id,hidden.revision,{});
    return{status:200,body:{deleted:true}};
  }
  const action=body.action;
  if(!['APPROVE','ACTIVATE','ARCHIVE'].includes(action))fail('Ungültige Aktion.');
  need(action==='APPROVE'?'approve':'activate');
  const data=action==='ACTIVATE'?{effective_from:body.effectiveFrom}:{};
  const next=await store.change(action,row.id,profile.id,row.revision,data);
  return{status:200,body:{document:legalDocumentMetadata(next)}};
}
