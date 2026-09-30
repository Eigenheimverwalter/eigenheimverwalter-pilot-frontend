// Bounded private DRAFT upload check; never approves or activates a document.
import {readFileSync} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const base='https://rpniwtshbwjuesoeztyt.supabase.co',key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Missing service configuration');
async function call(path,method='GET',body,headers={}){const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...headers},...(body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{}if(!r.ok)throw Error(`Legal smoke ${r.status}: ${data?.code||data?.error||'request failed'} ${data?.message||''}`);return data;}
const [admin]=await call('/rest/v1/portal_users?role=eq.super_admin&status=eq.active&select=id&limit=1');if(!admin)throw Error('No authorized admin');
const counters=await call('/rest/v1/legal_document_versions?select=document_type,last_version');
const docs=await call('/rest/v1/legal_documents?select=document_type,version,audience,status,sandbox_onboarding_id');
console.log(JSON.stringify({versionCounters:counters.map(c=>({type:c.document_type,counter:c.last_version,highest:Math.max(0,...docs.filter(d=>d.document_type===c.document_type).map(d=>d.version))})),commonActive:docs.filter(d=>d.audience==='COMMON'&&d.status==='ACTIVE'&&!d.sandbox_onboarding_id).length}));
const id=randomUUID(),path=id+'/'+id+'.pdf',bytes=readFileSync('test/fixtures/partner-premium/broker-terms-test.pdf');let uploaded=false,row;
const change=(action,revision,data={})=>call('/rest/v1/rpc/change_legal_document','POST',{p_action:action,p_id:id,p_actor:admin.id,p_revision:revision,p_data:data});
try{
 await call('/storage/v1/object/ehv-legal-documents/'+path,'POST',bytes,{'Content-Type':'application/pdf','x-upsert':'false'});uploaded=true;
 row=await change('UPLOAD',null,{document_type:'TERMS',title:'TEST – Uploadprüfung, nicht freigeben',file_name:'upload-test.pdf',storage_path:path,file_size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),acceptance_text:'Technischer Testentwurf, keine Vertragsfreigabe.'});
 assert.equal(row.status,'DRAFT');assert.equal(row.audience,'COMMON');
 const [persisted]=await call('/rest/v1/legal_documents?id=eq.'+id+'&select=id,status,audience');assert.equal(persisted.id,id);
 const preview=await call('/storage/v1/object/sign/ehv-legal-documents/'+path,'POST',{expiresIn:60});assert.ok(preview.signedURL||preview.signedUrl);
 console.log(JSON.stringify({privatePdfUpload:true,metadataConfirmed:true,commonWithoutAudienceSelection:true,privatePreview:true,neverPublished:true}));
}finally{
 if(uploaded){if(!row){const rows=await call('/rest/v1/legal_documents?id=eq.'+id+'&select=*');row=rows[0];}
 if(row){assert.equal(row.status,'DRAFT');row=await change('DELETE_PREPARE',row.revision);}
 await call('/storage/v1/object/ehv-legal-documents','DELETE',{prefixes:[path]});
 if(row)await change('DELETE_COMPLETE',row.revision);
 console.log(JSON.stringify({ownTestDraftRemoved:true}));}
}
