// Historical evidence belongs to the authenticated identity, not a supplied partner ID.
export async function accountLegalHistory({service,actorId,documentId=null}) {
  const fail=()=>{throw Object.assign(new Error('Vertragsunterlagen konnten nicht geladen werden.'),{status:503});};
  const flows=await service.from('partner_onboardings').select('id').eq('auth_user_id',actorId);
  if(flows.error)fail();
  if(!flows.data?.length){if(documentId)throw Object.assign(new Error('Dokument nicht gefunden.'),{status:404});return {documents:[]};}
  const evidence=await service.from('legal_acceptances').select('legal_document_id,document_type,document_version,accepted_at,acceptance_text').in('onboarding_id',flows.data.map(x=>x.id)).order('accepted_at',{ascending:false});
  if(evidence.error)fail();
  const accepted=(evidence.data||[]).filter((x,i,a)=>a.findIndex(y=>y.legal_document_id===x.legal_document_id)===i);
  if(documentId&&!accepted.some(x=>x.legal_document_id===documentId))throw Object.assign(new Error('Dokument nicht gefunden.'),{status:404});
  if(!accepted.length)return {documents:[]};
  const docs=await service.from('legal_documents').select('id,title,file_name,version,status,storage_path').in('id',documentId?[documentId]:accepted.map(x=>x.legal_document_id));
  if(docs.error)fail();
  if(documentId){const doc=docs.data?.find(x=>x.id===documentId);if(!doc)fail();const signed=await service.storage.from('ehv-legal-documents').createSignedUrl(doc.storage_path,60);if(signed.error||!signed.data?.signedUrl)fail();return {url:signed.data.signedUrl};}
  return {documents:accepted.map(a=>{const d=docs.data?.find(x=>x.id===a.legal_document_id);return {id:a.legal_document_id,type:a.document_type,version:a.document_version,acceptedAt:a.accepted_at,acceptanceText:a.acceptance_text,title:d?.title||'Vertragsdokument',fileName:d?.file_name||'',available:Boolean(d),status:d?.status||'UNAVAILABLE'};})};
}
