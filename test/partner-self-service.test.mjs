import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {partnerSelfServiceRequest} from '../supabase/functions/_shared/partner-self-service.mjs';
import {onboardingEntryRequest} from '../supabase/functions/_shared/partner-onboarding-entry.mjs';
import {createSupabaseOnboardingService} from '../supabase/functions/_shared/partner-onboarding-store.mjs';
import {partnerOnboardingRequest} from '../supabase/functions/_shared/partner-onboarding-service.mjs';
import {isSelfServicePath,selfServicePlanMarkup,validSelfServicePassword} from '../public/assets/partner-self-service.mjs';
import {isPublicPath} from '../public/assets/supabase-routes.mjs';
const actor='87654321-1234-4234-8234-123456789abc';
const make=()=>{
  const calls=[];const service={store:{emailRequest:async args=>{calls.push(['limit',args]);return true;},selfSession:async args=>{calls.push(['session',args]);return{email:'own@example.invalid',needs_password:true,token_hash:'secret'};}}};
  const auth={admin:{generateLink:async args=>{calls.push(['link',args]);return{data:{properties:{action_link:'https://auth.example.invalid/one-time'}}};}},getUser:async()=>({data:{user:{id:actor,email_confirmed_at:'2026-09-10'}}})};
  const sendMail=async(...args)=>calls.push(['mail',...args]);
  return{calls,service,auth,sendMail,request:(options={})=>partnerSelfServiceRequest({action:'email',body:{email:' Own@example.invalid '},service,auth,sendMail,redirectTo:'https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend/partner-onboarding/',...options})};
};
test('Self-service mailbox proof uses partner mail and Supabase, never auto-confirms or resets a password',async()=>{
  const f=make(),result=await f.request();assert.equal(result.status,202);assert.equal(f.calls[0][0],'limit');assert.match(f.calls[0][1].emailHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.calls[1][1],{type:'magiclink',email:'own@example.invalid',options:{redirectTo:'https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend/partner-onboarding/'}});
  assert.equal(f.calls[2][1],'partner');assert.ok(!JSON.stringify(result).includes('one-time'));assert.ok(!JSON.stringify(f.calls).includes('password'));
});
test('Limits and existing identities return the same public response without sending mail',async()=>{
  const f=make(),a=await f.request();f.calls.length=0;f.service.store.emailRequest=async()=>false;
  assert.deepEqual(await f.request(),a);assert.equal(f.calls.length,0);
  await assert.rejects(f.request({body:{email:'wrong'}}),e=>e.status===422);
  await assert.rejects(f.request({supportView:true}),e=>e.status===403);
});
test('Self-service session requires verified Auth and ignores supplied actor/email/role',async()=>{
  const f=make();await assert.rejects(f.request({action:'session'}),e=>e.status===401);
  const r=await f.request({action:'session',authorization:'Bearer proof',body:{actorId:'forged',email:'forged',role:'super_admin'}});
  assert.deepEqual(f.calls.at(-1),['session',{actorId:actor}]);assert.equal(r.body.email,'own@example.invalid');assert.equal(r.body.token_hash,undefined);
  f.auth.getUser=async()=>({data:{user:{id:actor}}});await assert.rejects(f.request({action:'session',authorization:'Bearer proof'}),e=>e.status===401);
});
test('New pending partners use central create with Auth email, cannot choose Sales/admin source',async()=>{
  let input;const args={method:'POST',path:'/partner-onboarding',profile:{id:actor,role:'partner_basic',status:'invited'},user:{id:actor,email:'own@example.invalid',email_confirmed_at:'2026-09-10'},service:{create:async value=>{input=value;return{created:true};}},body:{requested_plan:'BASIC',partner_type:'REFERRAL',prefilled_data:{email:'forged'}}};
  assert.equal((await partnerOnboardingRequest(args)).status,201);assert.equal(input.source,'SELF_SERVICE_BASIC');assert.equal(input.prefilled_data.email,'own@example.invalid');
  await assert.rejects(partnerOnboardingRequest({...args,body:{...args.body,source:'SALES_OS'}}),/ONBOARDING_PERMISSION_DENIED/);
  await assert.rejects(partnerOnboardingRequest({...args,supportView:true}),/ONBOARDING_PERMISSION_DENIED/);
});
test('Self-service HTTP route gates mail, fixes redirect, bounds body and masks sender errors',async()=>{
  let gate='true',mail=null;const f=make();
  const dependencies={onboardingEntryRequest,partnerSelfServiceRequest,createSupabaseOnboardingService:()=>f.service,sendPortalMail:async(...args)=>{mail=args;},Deno:{env:{get:()=>gate}}};
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/_shared/partner-onboarding-entry-route.ts',import.meta.url),'utf8').replace(/^import [\s\S]*?;\r?\n/gm,''),{mode:'strip'}).replace('export async function','async function');
  const route=new Function(...Object.keys(dependencies),source+';return partnerOnboardingEntryRoute')(...Object.values(dependencies));
  const req=body=>new Request('https://example.invalid',{method:'POST',body:JSON.stringify(body)}),path='/onboarding-self-service/email',origin='https://eigenheimverwalter.github.io',db={auth:f.auth};
  gate='false';assert.equal((await route(req({email:'own@example.invalid'}),path,db,origin)).status,503);assert.equal(f.calls.length,0);
  gate='true';assert.equal((await route(req({email:'own@example.invalid'}),path,db,'')).status,403);
  assert.equal((await route(req({email:'own@example.invalid',redirectTo:'https://evil.invalid'}),path,db,origin)).status,202);
  assert.ok(f.calls.find(x=>x[0]==='link')[1].options.redirectTo.startsWith(origin));assert.equal(mail[0],'partner');
  f.auth.admin.generateLink=async()=>{throw Error('private secret');};const error=await route(req({email:'own@example.invalid'}),path,db,origin);assert.equal(error.status,503);assert.ok(!JSON.stringify(error).includes('secret'));
});
test('Self-service UI uses existing base path, safe catalog and no premature Basic licence/payment',()=>{
  assert.equal(isSelfServicePath('/eigenheimverwalter-pilot-frontend/partner-onboarding/'),true);assert.equal(isSelfServicePath('/partner-onboarding/invalid'),false);
  assert.equal(isPublicPath('/api/onboarding-self-service/session'),true);assert.equal(isPublicPath('/api/onboarding-self-service/activate'),false);
  const html=selfServicePlanMarkup('<script>',[{id:'"bad',name:'<script>'}]);assert.ok(!html.includes('<script>'));assert.match(html,/kein PLZ-Lizenzgebiet/);
  assert.equal(validSelfServicePassword('Secure!Password123','Secure!Password123'),true);assert.equal(validSelfServicePassword('short','short'),false);
});
