import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketingAccess,marketingCategories,decodeMarketingFile,marketingKitRequest} from '../supabase/functions/_shared/marketing-kit.mjs';
import {supportsPath,isPublicPath,isDocumentUpload} from '../public/assets/supabase-routes.mjs';
const id='00000000-0000-4000-8000-000000000001',partner={status:'active'},time='2026-09-09T12:00:00Z';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function fixture(){
  const rows=new Map(),objects=new Map(),signs=[];let insertFails=false,deleteFails=false,casFails=false;
  const store={list:async manage=>[...rows.values()].filter(r=>!r.storage_deleted_at&&(manage||r.status==='published')),get:async id=>rows.get(id),insert:async row=>{if(insertFails)throw Error('metadata failed');rows.set(row.id,{...row})},update:async(id,version,patch)=>{const row=rows.get(id);if(casFails||row.version!==version)return null;const next={...row,...patch};rows.set(id,next);return next}};
  const files={upload:async(path,bytes)=>objects.set(path,bytes),remove:async path=>{if(deleteFails)throw Error('storage failed');objects.delete(path)},signedUrl:async(path,seconds)=>{signs.push({path,seconds});return'https://example.invalid/signed'}};
  const request=(method='GET',path='/marketing-kit',body={},role='admin_light',supportView=false)=>marketingKitRequest({method,path,body,profile:{id:'actor',role,status:'active'},partner,supportView,store,files,now:()=>time,newId:()=>id});
  const upload=category=>request('POST','/marketing-kit',{category:category||'flyer',name:'Flyer.png',content:png,status:'published',object_path:'foreign/private'});
  return{rows,objects,signs,request,upload,failInsert:()=>insertFails=true,failDelete:value=>deleteFails=value,failCas:()=>casFails=true};
}
test('all four requested categories exist and only active admins can manage',()=>{
  assert.deepEqual(Object.keys(marketingCategories),['flyer','website_badge','social','whatsapp']);
  for(const role of ['admin_light','super_admin'])assert.equal(marketingAccess({role,status:'active'},null).manage,true);
  for(const role of ['partner_basic','referral_partner','crafts_partner','broker_partner']){assert.equal(marketingAccess({role,status:'active'},partner).read,true);assert.equal(marketingAccess({role,status:'active'},partner).manage,false);assert.equal(marketingAccess({role,status:'active'},{status:'paused'}).read,false);}
  for(const role of ['support_staff','partner_manager','customer','unknown'])assert.equal(marketingAccess({role,status:'active'},partner).read,false);
  assert.equal(marketingAccess({role:'admin_light',status:'active'},partner,true).manage,false);
  assert.equal(marketingAccess({role:'admin_light',status:'disabled'},partner).read,false);
  assert.equal(marketingAccess({role:'partner_basic',status:'invited'},partner,true).read,true);
});
test('uploads start as private drafts with server-generated path and verified metadata',async()=>{
  const f=fixture(),r=await f.upload();assert.equal(r.status,201);assert.equal(r.body.asset.status,'draft');assert.equal(r.body.asset.name,'Flyer.png');assert.equal(r.body.asset.mimeType,'image/png');assert.equal(r.body.asset.createdAt,time);assert.equal(f.rows.get(id).object_path,`${id}/${id}.png`);assert.equal(f.rows.get(id).sha256.length,64);assert.equal(f.objects.size,1);
  assert.equal((await f.request('GET','/marketing-kit',{},'referral_partner')).body.assets.length,0);
  await assert.rejects(f.request('GET',`/marketing-kit/${id}/file`,{},'referral_partner'),e=>e.status===404);
  assert.ok(!(JSON.stringify(r.body).includes('object_path')));
});
test('file validation rejects spoofed, active, empty and oversized inputs',()=>{
  for(const [name,content] of [['x.html','data:text/html;base64,PGgxPmJvb208L2gxPg=='],['x.svg','data:image/svg+xml;base64,PHN2Zz4='],['x.pdf',png],['x.png','data:image/png;base64,ZmFrZQ=='],['x.png','data:image/png;base64,'],['x.txt','data:text/plain;base64,AA=='],['x.txt','data:text/plain;base64,/w==']])assert.throws(()=>decodeMarketingFile(name,content));
  assert.throws(()=>decodeMarketingFile('x.png','A'.repeat(14*1024*1024)),e=>e.status===413);
  assert.equal(decodeMarketingFile('WhatsApp.txt','data:text/plain;base64,SGFsbG8h').mime,'text/plain');
});
test('metadata failure compensates uploaded bytes; invalid category never stores bytes',async()=>{
  const f=fixture();await assert.rejects(f.upload('other'),e=>e.status===422);assert.equal(f.objects.size,0);f.failInsert();await assert.rejects(f.upload());assert.equal(f.objects.size,0);
});
test('publication exposes only approved files and signed links expire in 60 seconds',async()=>{
  const f=fixture();await f.upload();await f.request('PATCH',`/marketing-kit/${id}`,{version:1,status:'published'});
  for(const role of ['partner_basic','referral_partner','crafts_partner','broker_partner']){const list=await f.request('GET','/marketing-kit',{},role);assert.equal(list.body.canManage,false);assert.equal(list.body.assets.length,1);assert.equal(list.body.assets[0].status,'published');await f.request('GET',`/marketing-kit/${id}/file`,{},role);}
  assert.ok(f.signs.every(x=>x.seconds===60));
});
test('each marketing download signs the selected asset path',async()=>{
  const f=fixture(),second='00000000-0000-4000-8000-000000000002';
  for(const [assetId,path,name] of [[id,'first/first.pdf','Erstes.pdf'],[second,'second/second.pdf','Zweites.pdf']])f.rows.set(assetId,{id:assetId,category:'flyer',name,mime_type:'application/pdf',size_bytes:10,status:'published',object_path:path,version:1,created_at:time});
  await f.request('GET',`/marketing-kit/${id}/file`,{},'partner_basic');
  await f.request('GET',`/marketing-kit/${second}/file`,{},'partner_basic');
  assert.deepEqual(f.signs.map(x=>x.path),['first/first.pdf','second/second.pdf']);
});
test('partner roles cannot upload, publish, withdraw or delete even with forged IDs',async()=>{
  const f=fixture();await f.upload();for(const role of ['partner_basic','referral_partner','crafts_partner','broker_partner'])for(const method of ['POST','PATCH','DELETE'])await assert.rejects(f.request(method,`/marketing-kit/${id}`,{version:1,status:'published'},role),e=>e.status===403);
  assert.equal(f.rows.get(id).status,'draft');assert.equal(f.objects.size,1);
});
test('withdrawal blocks subsequent preview and download requests from all partners',async()=>{
  const f=fixture();await f.upload();await f.request('PATCH',`/marketing-kit/${id}`,{version:1,status:'published'});await f.request('PATCH',`/marketing-kit/${id}`,{version:2,status:'draft'});
  assert.equal((await f.request('GET','/marketing-kit',{},'partner_basic')).body.assets.length,0);await assert.rejects(f.request('GET',`/marketing-kit/${id}/file`,{},'partner_basic'),e=>e.status===404);
  assert.equal((await f.request('GET',`/marketing-kit/${id}/file`)).status,200);
});
test('stale version and racing writes cannot publish or delete the wrong revision',async()=>{
  const f=fixture();await f.upload();await assert.rejects(f.request('PATCH',`/marketing-kit/${id}`,{version:99,status:'published'}),e=>e.status===409);f.failCas();await assert.rejects(f.request('DELETE',`/marketing-kit/${id}`,{version:1}),e=>e.status===409);assert.equal(f.objects.size,1);
});
test('delete revokes access first and removes bytes; cleanup failures can be retried',async()=>{
  const f=fixture();await f.upload();f.failDelete(true);await assert.rejects(f.request('DELETE',`/marketing-kit/${id}`,{version:1}));assert.equal(f.rows.get(id).status,'deleted');await assert.rejects(f.request('GET',`/marketing-kit/${id}/file`),e=>e.status===404);assert.equal((await f.request()).body.assets.length,1);
  f.failDelete(false);await f.request('DELETE',`/marketing-kit/${id}`,{version:2});assert.equal(f.objects.size,0);assert.equal((await f.request()).body.assets.length,0);
});
test('support context is read-only and inherits target partner visibility',async()=>{
  const f=fixture();await f.upload();assert.equal((await f.request('GET','/marketing-kit',{},'partner_basic',true)).body.canManage,false);await assert.rejects(f.request('DELETE',`/marketing-kit/${id}`,{version:1},'partner_basic',true),e=>e.status===403);
  assert.equal((await f.request('GET','/marketing-kit',{},'partner_basic',true)).status,200);
});
test('marketing routes use authenticated portal API, not public or property uploads',()=>{
  for(const path of ['/api/marketing-kit',`/api/marketing-kit/${id}`,`/api/marketing-kit/${id}/file`]){assert.ok(supportsPath(path));assert.equal(isPublicPath(path),false);assert.equal(isDocumentUpload(path),false);}
  assert.equal(supportsPath('/api/marketing-kit/../../secrets'),false);
});
test('schema denies direct client SQL access and uses private storage and transaction audit',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202609090001_marketing_kit.sql',import.meta.url),'utf8');assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public.marketing_kit_assets from anon, authenticated/);assert.match(sql,/'ehv-marketing-kit','ehv-marketing-kit',false/);assert.match(sql,/create trigger marketing_kit_audit/);assert.doesNotMatch(sql,/create policy/i);
});
test('admin and partner menus expose kit, frontend supports drop and explicit approval',()=>{
  const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8'),ui=readFileSync(new URL('../public/assets/marketing-kit.js',import.meta.url),'utf8');
  assert.match(app,/Marketing-Kit Einstellungen/);assert.match(app,/if\(x==='marketing-kit'\)return renderMarketingKit/);for(const marker of ['zone.ondrop','input.onchange','Für Partner freigeben','Freigabe zurückziehen','Hochgeladen am','Herunterladen','endgültig löschen'])assert.ok(ui.includes(marker));assert.match(ui,/pre.textContent=text/);assert.doesNotMatch(ui,/innerHTML\s*=\s*text/);
});
