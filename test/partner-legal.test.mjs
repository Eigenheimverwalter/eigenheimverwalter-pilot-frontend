import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {partnerLegalRequest} from '../supabase/functions/_shared/partner-legal.mjs';
import {supportsPath,isPublicPath} from '../public/assets/supabase-routes.mjs';
import {legalStepMarkup} from '../public/assets/partner-legal-step.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',docId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',userId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const profile={id:userId,role:'partner_basic',status:'active'},user={id:userId,email_confirmed_at:'2026-09-09'};
function fixture(){
  const calls=[],result={onboardingId:id,onboardingStatus:'LEGAL_PENDING',plan:'BASIC',documents:[{id:docId,version:1,accepted:false}],missingDocumentTypes:[],accepted:false,dataComplete:true,file:{storage_path:'private/not-public.pdf'}};
  const store={step:async input=>{calls.push(input);return structuredClone(result)}};
  const files={signedUrl:async(path,seconds)=>{calls.push({path,seconds});return 'https://example.invalid/private-signed'}};
  return{calls,result,request:args=>partnerLegalRequest({method:'GET',path:`/partner-onboarding/${id}/legal`,profile,user,store,files,...args})};
}
test('Legal manifest requires own authenticated partner identity and disallows all support/admin contexts',async()=>{
  for(const role of ['super_admin','admin_light','support_staff','customer']){const f=fixture();await assert.rejects(f.request({profile:{...profile,role}}),e=>e.status===403);assert.equal(f.calls.length,0);}
  for(const args of [{supportView:true},{profile:{...profile,status:'disabled'}},{user:{id:userId}},{user:{...user,id:id}}]){const f=fixture();await assert.rejects(f.request(args),e=>e.status===403);assert.equal(f.calls.length,0);}
});
test('Manifest does not expose private storage or extra internal fields',async()=>{
  const f=fixture();f.result.prefilled_data={email:'private'};const {body}=await f.request();assert.equal(body.file,undefined);assert.equal(body.prefilled_data,undefined);assert.equal(f.calls[0].actor,userId);
});
test('Preview signs only the SQL-authorized current document after owner/audit check',async()=>{
  const f=fixture(),r=await f.request({path:`/partner-onboarding/${id}/legal/${docId}/file`});
  assert.equal(f.calls[0].action,'VIEW');assert.deepEqual(f.calls[1],{path:'private/not-public.pdf',seconds:60});assert.equal(r.body.expiresIn,60);assert.equal(r.body.asset.storage_path,undefined);
  f.result.documents=[];await assert.rejects(f.request({path:`/partner-onboarding/${id}/legal/${docId}/file`}),e=>e.status===404);
});
test('POST rejects unchecked, malformed, oversized and non-boolean consent',async()=>{
  for(const documents of [null,{},[{id:docId,version:1,accepted:false}],[{id:docId,version:1,accepted:'true'}],[{id:'bad',version:1,accepted:true}],Array(21).fill({id:docId,version:1,accepted:true})]){
    const f=fixture();await assert.rejects(f.request({method:'POST',body:{documents}}),e=>e.code==='LEGAL_ACCEPTANCE_REQUIRED');assert.equal(f.calls.length,0);
  }
});
test('POST whitelists document confirmations; client cannot forge actor, timestamp, IP or acceptance text',async()=>{
  const f=fixture();await f.request({method:'POST',userAgent:'Test\nAgent',body:{actor:id,ip:'8.8.8.8',status:'ACTIVE',acceptedAt:'2000-01-01',documents:[{id:docId,version:1,accepted:true,acceptanceText:'forged'}]}});
  assert.deepEqual(f.calls[0],{action:'ACCEPT',onboardingId:id,actor:userId,documentId:null,documents:[{id:docId,version:1,accepted:true}],ip:null,userAgent:'TestAgent'});
});
test('Unknown methods, malformed IDs and file writes are rejected before SQL',async()=>{
  const f=fixture();for(const args of [{method:'DELETE'},{path:'/partner-onboarding/not-an-id/legal'},{method:'POST',path:`/partner-onboarding/${id}/legal/${docId}/file`}])await assert.rejects(f.request(args));assert.equal(f.calls.length,0);
});
test('Frontend legal routes are authenticated; backend dispatch happens before legacy automatic activation',()=>{
  const route=`/api/partner-onboarding/${id}/legal`;assert.ok(supportsPath(route));assert.ok(supportsPath(`${route}/${docId}/file`));assert.equal(isPublicPath(route),false);
  const api=readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');assert.ok(api.indexOf('await partnerLegalRoute')<api.indexOf('partner_basic.email_confirmed'));
});
test('Legal UI starts unselected, uses exact version text and shows prior evidence without a preselected checkbox',()=>{
  const document={id:docId,version:1,title:'AGB',name:'agb.pdf',acceptanceText:'Ich stimme <ausdrücklich> zu.',effectiveFrom:'2026-01-01'};
  const html=legalStepMarkup({dataComplete:true,documents:[document],missingDocumentTypes:[]});
  assert.match(html,/type="checkbox"[^>]*required/);assert.doesNotMatch(html,/\schecked(?:[\s=>])/);assert.match(html,/type="submit" disabled/);assert.match(html,/&lt;ausdrücklich&gt;/);
  const reused=legalStepMarkup({dataComplete:true,accepted:true,documents:[{...document,accepted:true,acceptedAt:'2026-09-09'}],missingDocumentTypes:[]});assert.doesNotMatch(reused,/type="checkbox"/);assert.match(reused,/bereits bestätigt/);
  assert.match(legalStepMarkup({dataComplete:false,documents:[],missingDocumentTypes:['TERMS']}),/Eine Zustimmung ist derzeit nicht möglich/);
});
