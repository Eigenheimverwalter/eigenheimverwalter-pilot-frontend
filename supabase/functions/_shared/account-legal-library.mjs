import {accountLegalHistory} from './account-legal.mjs';
import {accountLegalAudience} from './legal-audience.mjs';
export async function accountLegalLibrary({service,actorId,partner,documentId=null}){
  const audience=accountLegalAudience(partner);
  const history=await accountLegalHistory({service,actorId});
  let current=[];
  if(audience){const allowed=['COMMON',audience,...(audience==='BASIC_REFERRAL'?['BASIC']:[])];const result=await service.from('legal_documents').select('id,title,file_name,document_type,version,status,effective_from,acceptance_text,audience,storage_path').in('audience',allowed).eq('status','ACTIVE').is('sandbox_onboarding_id',null).is('deletion_requested_at',null).lte('effective_from',new Date().toISOString());
    if(result.error)throw Object.assign(new Error('Aktuelle Vertragsunterlagen konnten nicht geladen werden.'),{status:503});
    const matching=(result.data||[]).filter(d=>d.audience==='COMMON'||d.audience===audience||(audience==='BASIC_REFERRAL'&&d.audience==='BASIC'&&['PRICE_SHEET','CONDITIONS'].includes(d.document_type))).sort((a,b)=>Number(b.audience===audience)-Number(a.audience===audience));
    current=matching.filter((doc,index)=>matching.findIndex(other=>other.document_type===doc.document_type)===index);}
  if(documentId){
    const doc=current.find(d=>d.id===documentId);
    if(!doc)return accountLegalHistory({service,actorId,documentId});
    const signed=await service.storage.from('ehv-legal-documents').createSignedUrl(doc.storage_path,60);
    if(signed.error||!signed.data?.signedUrl)throw Object.assign(new Error('Dokument konnte nicht bereitgestellt werden.'),{status:503});
    return {url:signed.data.signedUrl};
  }
  const ids=new Set(current.map(d=>d.id));
  return {audience,documents:current.map(d=>({id:d.id,title:d.title,fileName:d.file_name,type:d.document_type,version:d.version,status:d.status,available:true,acceptedAt:history.documents.find(h=>h.id===d.id)?.acceptedAt||null})),historyDocuments:history.documents.filter(d=>!ids.has(d.id))};
}
