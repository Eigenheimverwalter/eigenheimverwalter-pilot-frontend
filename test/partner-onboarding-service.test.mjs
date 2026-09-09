import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {PartnerOnboardingService,partnerOnboardingRequest,onboardingServiceErrors,hashOnboardingToken,onboardingSummary} from '../supabase/functions/_shared/partner-onboarding-service.mjs';
import {createSupabaseOnboardingService} from '../supabase/functions/_shared/partner-onboarding-store.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profile={id:actor,role:'partner_basic',status:'active'},user={id:actor,email:'owner@example.invalid',email_confirmed_at:'2026-09-09'};
const valid={source:'SELF_SERVICE_BASIC',request_key:id,requested_plan:'BASIC',partner_type:'REFERRAL',prefilled_data:{email:user.email}};
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Central creation uses 256-bit random tokens, hashes only in storage and no token on replay',async()=>{
  const calls=[];let first=true;
  const service=new PartnerOnboardingService({store:{create:async input=>{calls.push(input);const created=first;first=false;return{created,flow:{...input.input,id,status:'CREATED',version:1,token_hash:input.tokenHash,auth_user_id:actor}};}}});
  const created=await service.create(valid,{source:valid.source,actorId:actor});assert.equal(created.created,true);
  assert.match(created.secure_onboarding_token,/^[a-f0-9]{64}$/);assert.equal(calls[0].tokenHash,await hashOnboardingToken(created.secure_onboarding_token));
  assert.ok(!JSON.stringify(calls).includes(created.secure_onboarding_token));assert.equal(created.token_hash,undefined);assert.equal(created.auth_user_id,undefined);
  assert.equal((await service.create(valid,{source:valid.source,actorId:actor})).secure_onboarding_token,null);
  await assert.rejects(service.create(valid,{source:'SALES_OS'}),/ONBOARDING_PERMISSION_DENIED/);
});
test('Browser creation derives source and identity; it cannot spoof SalesOS, another email or privileged status',async()=>{
  let seen;const service={create:async(input,context)=>{seen={input,context};return{created:true}}};
  const request=body=>partnerOnboardingRequest({method:'POST',path:'/partner-onboarding',body,profile,user,service});
  await request({...valid,prefilled_data:{email:'forged@example.invalid'},status:'ACTIVE',auth_user_id:'forged',sales_lead_id:'forged',required_document_types:[]});
  assert.equal(seen.input.prefilled_data.email,user.email);assert.equal(seen.input.source,'SELF_SERVICE_BASIC');
  for(const key of ['status','auth_user_id','sales_lead_id','required_document_types'])assert.equal(seen.input[key],undefined);
  await assert.rejects(request({...valid,source:'SALES_OS'}),/ONBOARDING_PERMISSION_DENIED/);
  await assert.rejects(request({...valid,source:'CRM_IMPORT'}),/ONBOARDING_PERMISSION_DENIED/);
});
test('No support or unconfirmed account may invoke an onboarding operation',async()=>{
  for(const change of [{supportView:true},{user:{...user,email_confirmed_at:null}},{profile:{...profile,status:'disabled'}},{profile:{...profile,id:id}}]){
    await assert.rejects(partnerOnboardingRequest({method:'POST',path:'/partner-onboarding',body:valid,profile,user,service:{create:()=>assert.fail()},...change}),/ONBOARDING_PERMISSION_DENIED/);
  }
});
test('Status/data actions are whitelisted and immutable identity fields are rejected',async()=>{
  const calls=[];const service=new PartnerOnboardingService({store:{step:async input=>{calls.push(input);return{id,status:'DATA_COMPLETE',prefilled_data:{},version:4}}}});
  const data={company:' A ',contact_name:' B ',phone:'1',address:'Test',postal_code:'22043',city:'Hamburg'};
  await service.step('SAVE_DATA',id,{actorId:actor,version:3,data});assert.equal(calls[0].data.company,'A');
  for(const key of ['email','partner_id','status','requested_plan','auth_user_id'])await assert.rejects(service.step('SAVE_DATA',id,{actorId:actor,version:3,data:{...data,[key]:'forged'}}),/ONBOARDING_INPUT_INVALID/);
  await assert.rejects(service.step('ACTIVE',id,{actorId:actor}),/ONBOARDING_INPUT_INVALID/);
  await assert.rejects(service.step('SAVE_DATA',id,{actorId:actor,version:0,data}),/ONBOARDING_CHANGED/);
  await assert.rejects(service.step('START',id,{actorId:actor,token:'short'}),/ONBOARDING_NOT_FOUND/);
  assert.equal(onboardingSummary({id,status:'LEGAL_ACCEPTED',requested_plan:'BASIC',prefilled_data:{}}).next_step,'ACTIVATION_PENDING');
});
function httpFixture({enabled='true',rpcError=null}={}){
  const calls=[];const strip=s=>stripTypeScriptTypes(s.replace(/^import [\s\S]*?;\r?\n/gm,''),{mode:'strip'});
  const deps={createSupabaseOnboardingService,partnerOnboardingRequest,onboardingServiceErrors,loadRuntime:async()=>({state:{trades:[]}}),array:x=>x||[],Deno:{env:{get:()=>enabled}}};
  const route=new Function(...Object.keys(deps),strip(read('../supabase/functions/_shared/partner-onboarding-route.ts')).replace('export async function','async function')+';return partnerOnboardingRoute')(...Object.values(deps));
  const db={rpc:async(name,input)=>{calls.push({name,input});return{error:rpcError,data:{id,status:'CREATED',version:1,prefilled_data:{email:user.email}}}}};
  return{calls,request:async(method='GET',body,path=`/partner-onboarding/${id}`)=>route(new Request('https://example.invalid'+path,{method,...(body!==undefined?{body}:{})}),path,db,profile,user)};
}
test('Real route keeps rollout disabled by default and limits malformed/oversized input',async()=>{
  assert.equal((await httpFixture({enabled:''}).request()).status,503);
  const f=httpFixture();await assert.rejects(f.request('PATCH','{',`/partner-onboarding/${id}/data`),e=>e.status===400);
  await assert.rejects(f.request('PATCH','x'.repeat(8193),`/partner-onboarding/${id}/data`),e=>e.status===413);assert.equal(f.calls.length,0);
});
test('Real route passes verified actor and maps SQL failures without leaking internals',async()=>{
  const f=httpFixture();assert.equal((await f.request()).status,200);assert.equal(f.calls[0].input.p_actor,actor);
  await assert.rejects(httpFixture({rpcError:{message:'private SQL ONBOARDING_NOT_FOUND'}}).request(),e=>e.status===404&&!e.message.includes('private'));
  await assert.rejects(httpFixture({rpcError:{message:'private connection secret'}}).request(),e=>e.status===503&&!e.message.includes('secret'));
});
