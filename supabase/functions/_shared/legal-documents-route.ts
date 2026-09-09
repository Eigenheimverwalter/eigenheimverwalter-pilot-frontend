import {legalDocumentRequest,legalFileLimit,legalPermissions} from './legal-documents.mjs';
import {readMarketingBody} from './marketing-kit-route.ts';
const bucket='ehv-legal-documents';
const errorMessages:Record<string,[string,number]>={
  LEGAL_DOCUMENT_RETAINED:['Diese Dokumentversion ist freigegeben oder bereits akzeptiert und darf nur archiviert werden.',409],
  LEGAL_VERSION_CONFLICT:['Die Dokumentversion wurde zwischenzeitlich geändert. Bitte neu laden.',409],
  INVALID_LEGAL_TRANSITION:['Diese Statusänderung ist nicht möglich. Bitte den aktuellen Dokumentenstand prüfen.',409],
  LEGAL_EFFECTIVE_DATE_REQUIRED:['Bitte ein bereits erreichtes Gültigkeitsdatum wählen. Für spätere Gültigkeit das Dokument zunächst freigegeben lassen.',422],
  LEGAL_DOCUMENT_NOT_FOUND:['Dokument nicht gefunden.',404],
  LEGAL_PERMISSION_DENIED:['Keine Berechtigung.',403],
};
const checked=async(promise:PromiseLike<any>,message:string)=>{const r=await promise;if(r.error){const code=Object.keys(errorMessages).find(k=>String(r.error.message).includes(k)),mapped=code?errorMessages[code]:[message,503];throw Object.assign(new Error(String(mapped[0])),{status:mapped[1],code});}return r.data;};
export async function legalDocumentsRoute(req:Request,path:string,service:any,profile:any,state:any,supportView:boolean){
  if(!legalPermissions(profile,state.roleProfiles||[],supportView).includes('legal_documents.read'))throw Object.assign(new Error('Für die Rechtsdokumentenverwaltung fehlt die Berechtigung. Der Super Admin kann diese in der Zugangsverwaltung vergeben.'),{status:403,code:'LEGAL_PERMISSION_DENIED'});
  const store={
    list:async()=>{const rows=await checked(service.from('legal_documents').select('*').order('uploaded_at',{ascending:false}),'Rechtsdokumente konnten nicht geladen werden.');const ids=[...new Set(rows.map((r:any)=>r.uploaded_by).filter(Boolean))];const users=ids.length?await checked(service.from('portal_users').select('id,display_name').in('id',ids),'Ersteller konnten nicht geladen werden.'):[];return rows.map((r:any)=>({...r,uploaded_by_name:users.find((u:any)=>u.id===r.uploaded_by)?.display_name}));},
    get:async(id:string)=>await checked(service.from('legal_documents').select('*').eq('id',id).maybeSingle(),'Dokument konnte nicht geprüft werden.'),
    viewed:async(id:string,actor:string)=>await checked(service.rpc('audit_legal_preview',{p_document:id,p_actor:actor}),'Dokumentaufruf konnte nicht protokolliert werden.'),
    change:async(action:string,id:string,actor:string,revision:number|null,data:any)=>await checked(service.rpc('change_legal_document',{p_action:action,p_id:id,p_actor:actor,p_revision:revision,p_data:data}),'Dokumentänderung konnte nicht bestätigt werden.'),
  };
  const files={
    upload:async(path:string,bytes:Uint8Array,mime:string)=>await checked(service.storage.from(bucket).upload(path,bytes,{contentType:mime,upsert:false,cacheControl:'60'}),'PDF konnte nicht gespeichert werden.'),
    remove:async(path:string)=>await checked(service.storage.from(bucket).remove([path]),'Dateilöschung noch nicht abgeschlossen. Bitte erneut löschen.'),
    signedUrl:async(path:string,seconds:number)=>(await checked(service.storage.from(bucket).createSignedUrl(path,seconds),'PDF konnte nicht geöffnet werden.')).signedUrl,
  };
  return legalDocumentRequest({method:req.method,path,body:await readMarketingBody(req),profile,roleProfiles:state.roleProfiles||[],supportView,store,files,maxBytes:legalFileLimit(Deno.env.get('LEGAL_DOCUMENT_MAX_BYTES'))});
}
