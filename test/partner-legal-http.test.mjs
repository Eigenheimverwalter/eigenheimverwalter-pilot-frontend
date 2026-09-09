import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {assertPartnerLegalIdentity,partnerLegalErrors,partnerLegalRequest} from '../supabase/functions/_shared/partner-legal.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const strip=source=>stripTypeScriptTypes(source.replace(/^import [\s\S]*?;\r?\n/gm,''),{mode:'strip'});
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture({role='partner_basic',verified=true,error=null}={}){
  const calls=[];
  const deps={assertPartnerLegalIdentity,partnerLegalErrors,partnerLegalRequest};
  const partnerLegalRoute=new Function(...Object.keys(deps),strip(read('../supabase/functions/_shared/partner-legal-route.ts')).replace('export async function','async function')+';return partnerLegalRoute')(...Object.values(deps));
  const service={rpc:async(name,input)=>{calls.push({name,input});return{error,data:{onboardingId:id,onboardingStatus:'LEGAL_PENDING',plan:'BASIC',documents:[],missingDocumentTypes:['TERMS','PRIVACY'],accepted:false,dataComplete:true}}}};
  const routes={partnerLegalRoute,corsHeaders:()=>({}),authenticate:async()=>({profile:{id:actor,role,status:'active'},user:{id:actor,email_confirmed_at:verified?'2026-09-09':null},sourceUserId:'linked-existing-partner',service}),loadRuntime:()=>{throw Error('Legal HTTP dispatch must never enter legacy activation')},sourcePartner:()=>{throw Error('No implicit activation')},replaceRuntime:()=>{throw Error('No writes allowed')}};
  let handler;new Function('Deno',...Object.keys(routes),strip(read('../supabase/functions/portal-api/index.ts')))({serve:fn=>handler=fn},...Object.values(routes));
  return{calls,request:({method='GET',body,headers={}}={})=>handler(new Request(`https://example.invalid/functions/v1/portal-api/partner-onboarding/${id}/legal`,{method,headers:{Authorization:'Bearer verified',...headers},...(body===undefined?{}:{body})}))};
}
test('Real HTTP route bypasses legacy activation and passes only authenticated identity to RPC',async()=>{
  const f=fixture(),response=await f.request();assert.equal(response.status,200);assert.equal(f.calls[0].name,'partner_legal_step');assert.equal(f.calls[0].input.p_actor,actor);assert.equal(f.calls[0].input.p_action,'READ');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Real HTTP route rejects staff, support impersonation and unverified identities before reading SQL',async()=>{
  for(const params of [{role:'admin_light'},{role:'support_staff'},{verified:false}]){const f=fixture(params);assert.equal((await f.request()).status,403);assert.equal(f.calls.length,0);}
  const f=fixture();assert.equal((await f.request({headers:{'x-ehv-support-user':actor}})).status,403);assert.equal(f.calls.length,0);
});
test('Real HTTP body limit and malformed JSON cannot reach the acceptance engine',async()=>{
  const f=fixture();assert.equal((await f.request({method:'POST',body:'x'.repeat(8193)})).status,413);assert.equal((await f.request({method:'POST',body:'{'})).status,400);assert.equal(f.calls.length,0);
});
test('Real HTTP maps business errors without exposing database details or secrets',async()=>{
  const f=fixture({error:{message:'internal SQL LEGAL_VERSION_CONFLICT'}}),response=await f.request();assert.equal(response.status,409);const data=await response.json();assert.equal(data.code,'LEGAL_VERSION_CONFLICT');assert.ok(!data.error.includes('internal SQL'));
  const unavailable=await fixture({error:{message:'private schema secret'}}).request();assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('private schema'));
});
