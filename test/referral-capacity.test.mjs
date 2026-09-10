import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {confirmPartnerReferral} from '../supabase/functions/_shared/referral-confirmation.mjs';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
import {referralOverview} from '../supabase/functions/_shared/partner-referrals.mjs';
const now='2026-09-10T10:00:00.000Z';
const body={accepted:true,emailConfirmed:true,addressConfirmed:true};
function fixture({plan='basic',referralOnly=false}={}){
  const partner={id:'p',userId:'u',status:'active',lifecycle:'active',company:'Fixture',plan,postalCodes:['22043'],primaryTradeId:'ROOF',referralOnly};
  const state={partners:[partner],trades:[{id:'ROOF',name:'Dach'}],customers:[],properties:[],assignments:[],referralLeads:[],partnerReferralInvitations:[]};
  const invite=n=>{const item={id:'i'+n,partnerId:'p',name:'Customer '+n,email:'customer'+n+'@example.invalid',address:'Example '+n,postalCode:'80331',city:'Munich',tradeId:referralOnly?null:'ROOF',referralOnly,status:'pending',createdAt:now,expiresAt:'2026-09-11T10:00:00.000Z'};state.partnerReferralInvitations.push(item);return item;};
  const confirm=(item,enabled=true)=>confirmPartnerReferral(state,{item,partner,trade:referralOnly?null:{id:'ROOF',name:'Dach'},body,identifier:p=>p+'-'+crypto.randomUUID(),now,onboardingEnabled:enabled});
  return{state,partner,invite,confirm};
}
for(const referralOnly of [false])test(`Basic referrals remain unlimited; equipment alone consumes quota`,()=>{
  const f=fixture({referralOnly});for(let i=1;i<=3;i++)assert.equal(f.confirm(f.invite(i)).upgradeRequired,false);
  const before=f.state.assignments.map(a=>structuredClone(a));
  const fourth=f.confirm(f.invite(4));assert.equal(fourth.upgradeRequired,false);assert.equal(fourth.result.registered,true);
  assert.equal(f.state.customers.length,4);assert.equal(f.state.properties.length,4);assert.equal(f.state.referralLeads.length,4);
  assert.equal(f.state.partnerReferralInvitations.at(-1).status,'accepted');assert.equal(fourth.lead.activationStatus,'active');
  assert.equal(f.state.assignments.filter(a=>a.status==='active').length,referralOnly?0:4);
  assert.deepEqual(f.state.assignments.slice(0,before.length),before);
  assert.equal(basicPropertyAllowance(f.state,f.partner,null).confirmedProperties,0);
  const fifth=f.confirm(f.invite(5));assert.equal(fifth.upgradeRequired,false);
  const view=referralOverview(f.state,f.partner,referralOnly?'referral_partner':'partner_basic',{onboardingEnabled:true});
  assert.deepEqual(view.capacity,{confirmedProperties:0,limit:3,pendingProperties:0,upgradeRequired:false});assert.equal(view.stats.registered,5);assert.equal(view.stats.assigned,5);
  assert.equal(view.invitations.filter(r=>r.activationStatus==='upgrade_required').length,0);assert.ok(!JSON.stringify(view).includes('@example.invalid'));
  if(!referralOnly){const queued=f.state.assignments.filter(a=>a.status==='pending_upgrade');assert.equal(queued.length,0);assert.ok(queued.every(a=>a.accessStart===null));}
});

test('Tipsters can continue recommending without upsell or property access',()=>{
  const f=fixture({referralOnly:true});
  for(let n=1;n<=5;n++)assert.equal(f.confirm(f.invite(n)).upgradeRequired,false);
  assert.equal(f.state.assignments.length,0);
  const view=referralOverview(f.state,f.partner,'referral_partner',{onboardingEnabled:true});
  assert.equal(view.capacity.limit,null);assert.equal(view.capacity.upgradeRequired,false);
  const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/_shared/runtime.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'}).replace(/export /g,'');
  const scoped=new Function(source+';return scopedProperties')();
  f.state.assignments.push({partnerId:'p',propertyId:f.state.properties[0].id,status:'active'});
  assert.deepEqual(scoped(f.state,{role:'referral_partner'},'u'),[]);
});
test('Premium owns unlimited referred properties outside its protected regions',()=>{
  const f=fixture({plan:'premium'});for(let i=1;i<=5;i++)assert.equal(f.confirm(f.invite(i)).upgradeRequired,false);
  assert.equal(f.state.assignments.filter(a=>a.status==='active').length,5);assert.ok(f.state.assignments.every(a=>a.source==='partner_referral'));
  assert.equal(referralOverview(f.state,f.partner,'crafts_partner',{onboardingEnabled:true}).capacity.limit,null);
});
test('Closed rollout preserves Basic unlimited legacy behaviour and Premium territory checks',()=>{
  const basic=fixture();for(let i=1;i<=4;i++)assert.equal(basic.confirm(basic.invite(i),false).upgradeRequired,false);
  assert.equal(basic.state.assignments.filter(a=>a.status==='active').length,4);assert.equal(basic.state.referralLeads[0].activationStatus,undefined);
  assert.equal(referralOverview(basic.state,basic.partner,'partner_basic').capacity,undefined);
  const premium=fixture({plan:'premium'});premium.confirm(premium.invite(1),false);assert.equal(premium.state.assignments.length,0);
});
test('Repeated, expired, wrong-owner and incomplete acceptance do not mutate any customer',()=>{
  const f=fixture(),item=f.invite(1),before=JSON.stringify(f.state),args={item,partner:f.partner,trade:{id:'ROOF'},body,identifier:()=>assert.fail(),now,onboardingEnabled:true};
  for(const change of [{body:{accepted:true}},{partner:{...f.partner,id:'foreign'}},{item:{...item,expiresAt:'2020-01-01'}},{partner:{...f.partner,lifecycle:'paused'}}])assert.throws(()=>confirmPartnerReferral(f.state,{...args,...change}));
  assert.equal(JSON.stringify(f.state),before);f.confirm(item);const saved=JSON.stringify(f.state);assert.throws(()=>f.confirm(item),e=>e.status===410);assert.equal(JSON.stringify(f.state),saved);
});
test('Counting is by unique property, excludes pending and foreign assignments, preserves IDs',()=>{
  const f=fixture();for(let i=1;i<=3;i++)f.confirm(f.invite(i));const property=f.state.properties[0],customer=f.state.customers[0],ids=f.state.properties.map(p=>p.id);
  const item=f.invite(7);Object.assign(item,{email:customer.email,address:property.address,postalCode:property.postalCode});
  assert.equal(f.confirm(item).upgradeRequired,false);assert.deepEqual(f.state.properties.map(p=>p.id),ids);
  f.state.assignments.push({partnerId:'foreign',propertyId:'foreign-property',status:'active',source:'partner_referral'});
  assert.equal(basicPropertyAllowance(f.state,f.partner,null).confirmedProperties,0);
});
test('Existing ACL never includes queued property assignments',()=>{
  const f=fixture();for(let i=1;i<=4;i++)f.confirm(f.invite(i));
  const text=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/_shared/runtime.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'}).replace(/export /g,'');
  const scoped=new Function(text+';return scopedProperties')();
  f.state.assignments[3].status='pending_upgrade';const accessible=scoped(f.state,{role:'partner_basic'},'u');assert.equal(accessible.length,3);assert.ok(!accessible.some(p=>p.id===f.state.properties[3].id));
});
test('Actual public route uses revision conflict to prevent two simultaneous fourth activations',async()=>{
  const f=fixture();f.confirm(f.invite(1));f.confirm(f.invite(2));
  const tokens=['concurrent-proof-a','concurrent-proof-b'];
  for(let i=0;i<2;i++){const item=f.invite(i+3);item.tokenHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tokens[i]))).toString('hex');item.expiresAt='2099-01-01';}
  let persisted=structuredClone(f.state),revision=1,handler;
  const service={rpc:async(name,args)=>{assert.equal(name,'replace_portal_runtime_state');
    if(args.expected_revision!==revision)return{error:{message:'runtime_revision_conflict'}};
    persisted=structuredClone(args.next_payload);revision++;return{error:null};}};
  const deps={confirmPartnerReferral,array:v=>Array.isArray(v)?v:[],identifier:p=>p+'-'+crypto.randomUUID(),loadRuntime:async()=>({state:structuredClone(persisted),revision}),serviceClient:()=>service,corsHeaders:()=>({})};
  const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/portal-public/index.ts',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
  new Function('Deno',...Object.keys(deps),code)({serve:fn=>handler=fn,env:{get:()=> 'true'}},...Object.values(deps));
  const confirm=token=>handler(new Request('https://example.invalid/functions/v1/portal-public/referral-invitations/'+token,{method:'POST',body:JSON.stringify({...body,plan:'premium',onboardingEnabled:false})}));
  const replies=await Promise.all(tokens.map(confirm));assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal(persisted.assignments.filter(a=>a.status==='active').length,3);
  const retry=tokens[replies.findIndex(r=>r.status===409)];assert.equal((await confirm(retry)).status,200);
  assert.equal(persisted.assignments.filter(a=>a.status==='active').length,4);assert.equal(persisted.assignments.filter(a=>a.status==='pending_upgrade').length,0);
  assert.equal(persisted.referralLeads.length,4);assert.equal(persisted.customers.length,4);
});
