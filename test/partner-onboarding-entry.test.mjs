import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {onboardingEntryRequest} from '../supabase/functions/_shared/partner-onboarding-entry.mjs';
import {PartnerOnboardingService,hashOnboardingToken} from '../supabase/functions/_shared/partner-onboarding-service.mjs';
import {createSupabaseOnboardingService} from '../supabase/functions/_shared/partner-onboarding-store.mjs';
import {onboardingLocation,onboardingAuthMarkup,onboardingDataMarkup} from '../public/assets/partner-onboarding-entry.mjs';
import {isPublicPath,supportsPath} from '../public/assets/supabase-routes.mjs';
const id='12345678-1234-4234-8234-123456789abc',actor='87654321-1234-4234-8234-123456789abc',token='a'.repeat(64);
const password='Secure!Fixture2026';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const strip=s=>stripTypeScriptTypes(s.replace(/^import [\s\S]*?;\r?\n/gm,''),{mode:'strip'});
function fixture(overrides={}){
  const calls=[];const invitation={registered:false,login_required:false,email:'invited@example.invalid',company:'Fixture',requested_plan:'BASIC',...overrides};
  const service={invitation:async(i,t,options)=>{calls.push({kind:'invitation',i,t,options});return options?.actorId?{onboarding_status:'STARTED'}:invitation;}};
  const auth={admin:{createUser:async input=>{calls.push({kind:'create',input});return{data:{user:{id:actor}}};}},getUser:async access=>{calls.push({kind:'auth',access});return{data:{user:{id:actor,email_confirmed_at:'2026-09-09'}}};}};
  return{calls,auth,service,request:(action,extra={})=>onboardingEntryRequest({action,id,body:{token,password,passwordConfirmation:password},service,auth,...extra})};
}
test('Invitation registration reuses Auth, fixed recipient and central CLAIM, without role/password updates',async()=>{
  const f=fixture(),r=await f.request('register',{body:{token,password,passwordConfirmation:password,email:'forged@example.invalid',role:'super_admin',status:'ACTIVE'}});
  assert.equal(r.status,201);assert.equal(r.body.email,'invited@example.invalid');assert.match(r.body.message,/noch nicht aktiv/);
  const create=f.calls.find(c=>c.kind==='create').input;
  assert.equal(create.email,'invited@example.invalid');assert.equal(create.email_confirm,true);assert.equal(create.role,undefined);
  assert.equal(f.calls.at(-1).options.actorId,actor);assert.ok(!JSON.stringify(r).includes(password));
});
test('Existing or already claimed accounts are never recreated or reset',async()=>{
  for(const options of [{registered:true},{login_required:true}]){const f=fixture(options);await assert.rejects(f.request('register'),e=>e.code==='ONBOARDING_LOGIN_REQUIRED');assert.equal(f.calls.filter(c=>c.kind==='create').length,0);}
});
test('Password validation, repeated registration failures and Support are safe',async()=>{
  const f=fixture();for(const pass of ['short','A'.repeat(130),'Password12345','password123!'])await assert.rejects(f.request('register',{body:{token,password:pass,passwordConfirmation:pass}}),e=>e.status===422);
  await assert.rejects(f.request('register',{body:{token,password,passwordConfirmation:'different'}}),e=>e.status===422);
  await assert.rejects(f.request('register',{supportView:true}),e=>e.status===403);
  assert.ok(!f.calls.some(c=>c.kind==='create'));
  f.auth.admin.createUser=async()=>({error:{message:'private Auth detail'}});
  await assert.rejects(f.request('register'),e=>e.status===409&&!e.message.includes('private'));
});
test('Claim derives actor only from validated bearer session, never browser actor',async()=>{
  const f=fixture();await f.request('claim',{authorization:'Bearer session',body:{token,actorId:id}});
  assert.equal(f.calls[0].access,'session');assert.equal(f.calls.at(-1).options.actorId,actor);
  await assert.rejects(f.request('claim'),e=>e.status===401);
  f.auth.getUser=async()=>({data:{user:{id:actor}},error:null});await assert.rejects(f.request('claim',{authorization:'Bearer session'}),e=>e.status===401);
});
test('Central entry hashes invitation proof and whitelists inspection metadata',async()=>{
  let input;const service=new PartnerOnboardingService({store:{entry:async v=>{input=v;return{registered:false,email:'a@example.invalid',token_hash:'secret',auth_user_id:actor};}}});
  const result=await service.invitation(id,token);assert.equal(input.tokenHash,await hashOnboardingToken(token));assert.equal(input.action,'INSPECT');
  assert.equal(result.token_hash,undefined);assert.equal(result.auth_user_id,undefined);
  await assert.rejects(service.invitation(id,'bad'),e=>e.status===404);
});
function routeFixture(gate='true'){
  const deps={onboardingEntryRequest,createSupabaseOnboardingService,Deno:{env:{get:()=>gate}}};
  const handler=new Function(...Object.keys(deps),strip(read('../supabase/functions/_shared/partner-onboarding-entry-route.ts')).replace('export async function','async function')+';return partnerOnboardingEntryRoute')(...Object.values(deps));
  let calls=0;const db={rpc:async()=>{calls++;return{data:{registered:false,email:'a@example.invalid'}}},auth:{}};
  return{db,count:()=>calls,request:({method='POST',body=JSON.stringify({token}),origin='https://eigenheimverwalter.github.io'}={})=>handler(new Request('https://example.invalid',{method,...(method==='GET'?{}:{body})}),`/onboarding-invitations/${id}/inspect`,db,origin)};
}
test('Actual HTTP entry fails closed, enforces origin/method/body and masks infrastructure errors',async()=>{
  const off=routeFixture('');assert.equal((await off.request()).status,503);assert.equal(off.count(),0);
  const f=routeFixture();assert.equal((await f.request({origin:''})).status,403);assert.equal((await f.request({method:'GET'})).status,405);
  assert.equal((await f.request({body:'{'})).status,400);assert.equal((await f.request({body:'a'.repeat(8193)})).status,413);assert.equal(f.count(),0);
  assert.equal((await f.request()).body.email,'a@example.invalid');
  f.db.rpc=async()=>({error:{message:'database secret detail'}});const r=await f.request();assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('secret'));
});
test('Pending identity authenticates only with explicit onboarding-only option',async()=>{
  let status='invited',role='partner_basic';
  const q={select:()=>q,eq:()=>q,single:async()=>({data:{id:actor,status,role},error:null})};
  const identity={select:()=>identity,eq:()=>identity,maybeSingle:async()=>({data:null})};
  const client={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},from:()=>q};
  const service={from:()=>identity};let count=0;
  const deps={createClient:()=>++count%2===1?client:service,Deno:{env:{get:()=>''}}};
  // Use the real function body with isolated SDK clients (no network).
  const source=strip(read('../supabase/functions/_shared/runtime.ts')).replace(/export /g,'');
  const authFn=new Function(...Object.keys(deps),source+';return authenticate')(...Object.values(deps));
  await assert.rejects(authFn('Bearer fixture'),e=>e.status===403);count=0;
  assert.equal((await authFn('Bearer fixture',{onboardingOnly:true})).profile.status,'invited');count=0;
  status='disabled';await assert.rejects(authFn('Bearer fixture',{onboardingOnly:true}),e=>e.status===403);count=0;
  status='invited';role='super_admin';await assert.rejects(authFn('Bearer fixture',{onboardingOnly:true}),e=>e.status===403);
});
test('Public UI handles Pages base path, immutable email, no Basic licence inputs or fake activation',()=>{
  assert.deepEqual(onboardingLocation(`/eigenheimverwalter-pilot-frontend/partner-onboarding/${id}`,`#token=${token}`),{id,token});
  assert.equal(onboardingLocation('/wrong','#token=bad').id,null);
  assert.equal(isPublicPath(`/api/onboarding-invitations/${id}/claim`),true);assert.equal(supportsPath(`/api/partner-onboarding/${id}/data`),true);
  assert.equal(isPublicPath(`/api/partner-onboarding/${id}/data`),false);
  const markup=onboardingDataMarkup({requested_plan:'BASIC',partner_type:'REFERRAL',prefilled_data:{company:'<script>',email:'a@example.invalid'}});
  assert.ok(!markup.includes('<script>'));assert.match(markup,/keine PLZ-Lizenz/);assert.ok(!markup.includes('name="email"'));
  const auth=onboardingAuthMarkup({email:'a@example.invalid'},true);assert.match(auth,/autocomplete="new-password"/);assert.ok(!auth.includes('checkbox'));
  const html=read('../public/partner-onboarding.html');assert.match(html,/noindex,nofollow/);assert.match(html,/no-referrer/);assert.ok(!html.includes('assets/app.js'));
});
