import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legalPermissions,legalDocumentRequest,legalFileLimit} from '../supabase/functions/_shared/legal-documents.mjs';
import {supported,dynamicSupported,publicPaths} from '../public/assets/supabase-routes.mjs';
const admin={id:'admin',role:'super_admin',status:'active'},light={id:'light',role:'admin_light',status:'active'};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nLegal test fixture\n%%EOF').toString('base64');
function fixture(){
  const rows=new Map(),blobs=new Map(),events=[];let failRemove=false,uncertainInsert=false;
  const store={viewed:async()=>events.push('VIEWED'),list:async()=>[...rows.values()],get:async id=>rows.get(id),change:async(action,id,actor,revision,data)=>{
    let row=rows.get(id);
    if(action==='UPLOAD'){row={id,...data,version:1,revision:1,status:'DRAFT',uploaded_at:'2026-09-09T00:00:00Z',uploaded_by:actor};rows.set(id,row);if(uncertainInsert)throw Error('response lost');}
    else{if(row.revision!==revision)throw Error('conflict');if(action==='DELETE_COMPLETE'){rows.delete(id);return row;}if(action==='DELETE_PREPARE')row.deletion_requested_at='now';else row.status={APPROVE:'APPROVED',ACTIVATE:'ACTIVE',ARCHIVE:'ARCHIVED'}[action];row.revision++;}
    events.push(action);return structuredClone(row);
  }};
  const files={upload:async(path,bytes)=>blobs.set(path,bytes),remove:async path=>{if(failRemove)throw Error('storage unavailable');blobs.delete(path)},signedUrl:async(path,seconds)=>{assert.equal(seconds,60);return 'https://example.invalid/signed?expires=60'}};
  const request=args=>legalDocumentRequest({profile:admin,path:'/legal-documents',store,files,newId:()=>id,...args});
  const upload=()=>request({method:'POST',body:{name:'AGB.pdf',title:'AGB',documentType:'TERMS',audience:'BASIC',acceptanceText:'Ich stimme zu.',content:pdf,status:'ACTIVE',version:99}});
  return{rows,blobs,events,request,upload,setFailRemove:v=>failRemove=v,setUncertainInsert:v=>uncertainInsert=v};
}
test('Legal permissions default to Super Admin; Admin Light uses existing explicit role configuration',()=>{
  assert.equal(legalPermissions(admin).length,5);assert.deepEqual(legalPermissions(light),[]);
  assert.deepEqual(legalPermissions(light,[{role:'admin_light',permissions:['legal_documents.read','legal_documents.upload']}]),['legal_documents.read','legal_documents.upload']);
  for(const role of ['support_staff','partner_basic','referral_partner','crafts_partner','broker_partner'])assert.deepEqual(legalPermissions({id:'x',role,status:'active'},[{role,permissions:['*']}]),[]);
  assert.deepEqual(legalPermissions(admin,[],true),[]);assert.deepEqual(legalPermissions({...admin,status:'disabled'}),[]);
});
test('Upload reuses validated private PDF handling and cannot pick status or version',async()=>{
  const f=fixture(),r=await f.upload();assert.equal(r.status,201);assert.equal(r.body.document.status,'DRAFT');assert.equal(r.body.document.version,1);assert.equal(f.blobs.size,1);assert.equal(f.rows.get(id).sha256.length,64);
  assert.equal(r.body.document.storage_path,undefined);assert.equal(r.body.document.sha256,undefined);assert.equal(f.rows.get(id).audience,'BASIC');
});
test('Wrong file type, oversize, missing title/text, missing permission and support writes are blocked',async()=>{
  const f=fixture(),body={documentType:'TERMS',name:'AGB.pdf',content:pdf,title:'AGB',acceptanceText:'Zustimmung'};
  for(const args of [{body:{...body,title:''}},{body:{...body,acceptanceText:''}},{body:{...body,content:'data:application/pdf;base64,YmFk'}},{body,maxBytes:3},{body,profile:light},{body,supportView:true}])await assert.rejects(f.request({method:'POST',...args}));
  assert.equal(f.blobs.size,0);assert.equal(legalFileLimit(999999999),10485760);assert.equal(legalFileLimit(1000),1000);
});
test('Uncertain committed insert keeps the legal evidence bytes',async()=>{const f=fixture();f.setUncertainInsert(true);const r=await f.upload();assert.equal(r.status,201);assert.equal(f.blobs.size,1);assert.equal(f.rows.size,1)});
test('Preview requires permission and issues only short signed URLs',async()=>{
  const f=fixture();await f.upload();const r=await f.request({method:'GET',path:`/legal-documents/${id}/file`});assert.equal(r.body.expiresIn,60);
  assert.ok(f.events.includes('VIEWED'));
  await assert.rejects(f.request({method:'GET',path:`/legal-documents/${id}/file`,profile:light}),e=>e.status===403);
});
test('Admin Light upload permission cannot approve or activate',async()=>{
  const f=fixture();await f.upload();const args={method:'PATCH',path:`/legal-documents/${id}`,profile:light,roleProfiles:[{role:'admin_light',permissions:['legal_documents.read','legal_documents.upload']}]};
  for(const action of ['APPROVE','ACTIVATE','ARCHIVE'])await assert.rejects(f.request({...args,body:{revision:1,action}}),e=>e.status===403);
});
test('Deletion hides draft first; storage failure is retryable and does not discard metadata',async()=>{
  const f=fixture();await f.upload();f.setFailRemove(true);await assert.rejects(f.request({method:'DELETE',path:`/legal-documents/${id}`,body:{revision:1}}),/storage unavailable/);
  assert.equal(f.rows.size,1);assert.ok(f.rows.get(id).deletion_requested_at);
  await assert.rejects(f.request({method:'GET',path:`/legal-documents/${id}/file`}),e=>e.status===410);
  f.setFailRemove(false);await f.request({method:'DELETE',path:`/legal-documents/${id}`,body:{revision:2}});assert.equal(f.rows.size,0);assert.equal(f.blobs.size,0);
});
test('Approved, active and archived versions cannot be deleted even by Super Admin',async()=>{
  const f=fixture();await f.upload();for(const status of ['APPROVED','ACTIVE','ARCHIVED']){f.rows.get(id).status=status;await assert.rejects(f.request({method:'DELETE',path:`/legal-documents/${id}`,body:{revision:1}}),e=>e.code==='LEGAL_DOCUMENT_RETAINED');}assert.equal(f.blobs.size,1);
});
test('Stale revision cannot overwrite or delete a legal document',async()=>{const f=fixture();await f.upload();await assert.rejects(f.request({method:'PATCH',path:`/legal-documents/${id}`,body:{revision:2,action:'APPROVE'}}),e=>e.status===409);});
test('Legal routes use authenticated portal bridge, not public routes',()=>{assert.ok(supported.has('/api/legal-documents'));assert.ok(dynamicSupported.some(re=>re.test(`/api/legal-documents/${id}/file`)));assert.ok(!publicPaths.some(re=>re.test('/api/legal-documents')));});
test('Schema enforces append-only acceptances, atomic activation and private storage',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202609090002_partner_legal_documents.sql',import.meta.url),'utf8');
  for(const marker of ['LEGAL_ACCEPTANCE_IMMUTABLE','LEGAL_DOCUMENT_VERSION_IMMUTABLE','LEGAL_DOCUMENT_RETAINED','pg_advisory_xact_lock','legal_one_active_version','for update','enable row level security','legal_document_versions','legal_documents.approve'])assert.ok(sql.includes(marker),marker);
  assert.match(sql,/ehv-legal-documents','ehv-legal-documents',false/);assert.match(sql,/new.document_version:=doc.version/);assert.match(sql,/new.acceptance_text:=doc.acceptance_text/);assert.match(sql,/new.accepted_at:=now\(\)/);
});
test('UI reuses Marketing Kit preview and supports explicit review steps with no implicit publish',()=>{
  const ui=readFileSync(new URL('../public/assets/legal-documents.js',import.meta.url),'utf8');
  for(const marker of ['previewMarketingFile','ondrop','EINMAL HOCHLADEN','name="audiences"','getAll(\'audiences\')','APPROVE','ACTIVATE','ARCHIVE','Bestätigungstext','deletionPending'])assert.ok(ui.includes(marker));
  const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');assert.ok(app.includes('Zugänge, APIs & Versionen'));assert.ok(app.includes('open-legal-documents'));
});
