import test from 'node:test';
import {assertNewCustomerEmail} from '../supabase/functions/_shared/customer-invitations.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {canRecommend,isReferralOnly,referralOverview} from '../supabase/functions/_shared/partner-referrals.mjs';
import {recommendationForm} from '../public/assets/partner-referrals.js';
import {EQUIPMENT_FORM_MATRIX} from '../supabase/functions/_shared/equipment-form-matrix.mjs';
import {portalRootPath} from '../public/assets/portal-navigation.mjs';

const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const array = value => Array.isArray(value)?value:[];
function fixture(role='referral_partner', {trade='ROOF', failMail=false, plan, status='active'}={}) {
  const partner={id:'p-own',userId:'source-own',company:'Testbetrieb',primaryTradeId:role==='referral_partner'?null:trade,referralOnly:role==='referral_partner',plan:plan||(role==='partner_basic'||role==='referral_partner'?'basic':'premium'),postalCodes:role==='partner_basic'||role==='referral_partner'?[]:['22043'],status,lifecycle:status};
  const state={partners:[partner],users:[],trades:[{id:trade,name:trade}],partnerReferralInvitations:[],referralLeads:[],assignments:[],properties:[],customers:[]};
  const snapshot={state,revision:1}; let sends=0,commits=0,lastMail;
  const deps={assertNewCustomerEmail,commitCustomerInvitation:async()=>{commits++;snapshot.revision++},array,clean:(v,n)=>String(v??'').trim().slice(0,n),identifier:p=>p+'-'+crypto.randomUUID(),isAdmin:p=>['super_admin','admin_light'].includes(p.role),sourcePartner:(s,id)=>s.partners.find(p=>p.userId===id),scopedProperties:()=>[],canRecommend,isReferralOnly,replaceRuntime:async()=>{commits++;snapshot.revision++},sendPortalMail:async(...args)=>{sends++;lastMail=args;if(failMail)throw Error('Mailversand fehlgeschlagen');return{status:'sent',sender:'registrierung@eigenheimverwalter.de'}}};
  const code=stripTypeScriptTypes(read('../supabase/functions/_shared/write-routes.ts').replace(/^import .*\r?\n/gm,'').replace('export async function writeRoute','async function writeRoute'),{mode:'strip'});
  const write=new Function(...Object.keys(deps),code+';return writeRoute')(...Object.values(deps));
  const body={name:'Kunde Test',email:'kunde@example.invalid',address:'Teststraße 1',postalCode:'22043',city:'Hamburg',consentConfirmed:true,siteUrl:'https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend'};
  return{state,snapshot,partner,body,sends:()=>sends,commits:()=>commits,mail:()=>lastMail,post:(overrides={})=>write('POST','/referral/invitations',{snapshot,profile:{id:'auth-own',role},sourceUserId:'source-own',service:{},body:{...body,...overrides}})};
}

for(const role of ['referral_partner','partner_basic','crafts_partner','broker_partner']) {
  test(`${role}: invitation is owned, audited, mailed from registration and duplicate-safe`,async()=>{
    const f=fixture(role,{trade:role==='broker_partner'?'BROKER':'ROOF'}), r=await f.post({partnerId:'p-foreign',tradeId:'FAKE'});
    assert.equal(r.status,201);assert.equal(r.body.delivery.status,'sent');assert.equal(f.commits(),1);assert.equal(f.sends(),1);
    const item=f.state.partnerReferralInvitations[0];assert.equal(item.partnerId,'p-own');assert.equal(item.referralOnly,role==='referral_partner');assert.equal(item.tradeId,role==='referral_partner'?null:f.partner.primaryTradeId);assert.ok(item.tokenHash);assert.ok(!JSON.stringify(r).includes(item.tokenHash));
    assert.equal(f.mail()[0],'registration');assert.equal(f.mail()[1],'kunde@example.invalid');assert.match(f.mail()[3],/eigenheimverwalter-pilot-frontend\/empfehlung\//);
    assert.match(f.mail()[3],/Teststraße 1/);await assert.rejects(f.post(),error=>error.status===409);assert.equal(f.sends(),1);
  });
}
test('internal roles, inactive partners, invalid contact data and external redirects cannot send',async()=>{
  for(const role of ['super_admin','admin_light','support_staff','partner_manager','customer']){const f=fixture(role);await assert.rejects(f.post(),e=>e.status===403);assert.equal(f.sends(),0)}
  for(const status of ['invited','suspended','paused','archived','contract_ended']){const f=fixture('partner_basic',{status});await assert.rejects(f.post(),e=>e.status===403);assert.equal(f.sends(),0)}
  for(const invalid of [{name:''},{email:'invalid@'},{postalCode:'22a043'},{consentConfirmed:false},{siteUrl:'https://attacker.invalid'},{siteUrl:'https://eigenheimverwalter.github.io/other'}]){const f=fixture();await assert.rejects(f.post(invalid),e=>e.status===422);assert.equal(f.commits(),0);assert.equal(f.sends(),0)}
});
test('Basic has no territory restriction; licensed partners retain their territory check',async()=>{
  for(const role of ['referral_partner','partner_basic'])assert.equal((await fixture(role).post({postalCode:'80331'})).status,201);
  for(const role of ['crafts_partner','broker_partner'])await assert.rejects(fixture(role).post({postalCode:'80331'}),e=>e.status===422);
});
test('all 16 equipment types retain their own trade for Basic and licensed craft referrals',async()=>{
  const trades=Object.keys(EQUIPMENT_FORM_MATRIX);assert.equal(trades.length,16);
  for(const trade of trades)for(const role of ['partner_basic','crafts_partner']){const f=fixture(role,{trade});await f.post();assert.equal(f.state.partnerReferralInvitations[0].tradeId,trade)}
});
test('actual form submit sends once, reports delivery and support mode performs no request',async()=>{
  for(const supportView of [null,{readOnly:true}]){
    let calls=0,posts=0;const html=[],status={},close={},finish={},button={},form={reportValidity:()=>true,querySelector:()=>button};
    const window={ehvPortalContext:{supportView},ehvSupabaseBridge:{handles:()=>true,request:async(path,options={})=>{calls++;if(options.method==='POST'){posts++;await new Promise(r=>setImmediate(r));return{delivery:{status:'sent'}}}return{partner:{referralOnly:true,canRecommend:true}}}}};
    const document={querySelector:s=>({'#customer-recommendation-form':form,'#customer-recommendation-status':status,'.referral-modal .close':close,'#recommendation-finish':finish}[s]||null),body:{insertAdjacentHTML:(_,s)=>html.push(s)}};
    class Fields extends Array{constructor(){super(['name','Test'],['email','test@example.invalid'],['address','Test 1'],['postalCode','22043'],['city','Hamburg'],['consentConfirmed','on'])}has(key){return this.some(([k])=>k===key)}}
    const code=read('../public/assets/partner-referrals.js').replace(/^import .*\r?\n/gm,'').replace(/^export /gm,'');
    const open=new Function('window','document','FormData','portalRootPath',code+';return openCustomerRecommendation')(window,document,Fields,portalRootPath);
    await open();
    if(supportView){assert.equal(calls,0);assert.match(html.at(-1),/ausschließlich lesend/);continue;}
    await Promise.all([form.onsubmit({preventDefault(){}}),form.onsubmit({preventDefault(){}})]);assert.equal(posts,1);assert.match(html.at(-1),/Empfehlung versendet/);assert.match(html.at(-1),/registrierung@eigenheimverwalter.de/);
  }
});
test('ambiguous SMTP failure keeps the saved invitation and blocks duplicate mail retries',async()=>{
  const f=fixture('referral_partner',{failMail:true});await assert.rejects(f.post(),/Mailversand/);assert.equal(f.state.partnerReferralInvitations.length,1);await assert.rejects(f.post(),e=>e.status===409);assert.equal(f.sends(),1);
});
test('overview scopes every contact, masks email and does not double-count accepted invitations',()=>{
  const f=fixture();f.state.partnerReferralInvitations=[{id:'i',partnerId:'p-own',name:'Kunde',email:'kunde@example.de',address:'Straße',status:'accepted',createdAt:'2026-09-08',tokenHash:'private'},{id:'foreign',partnerId:'other',email:'secret@example.com'}];f.state.referralLeads=[{id:'l',sourceInvitationId:'i',partnerId:'p-own',customerId:'customer',status:'won'}];
  const d=referralOverview(f.state,f.partner,'referral_partner');assert.equal(d.invitations.length,1);assert.equal(d.stats.referred,1);assert.equal(d.invitations[0].email,'ku***@***.de');assert.ok(!JSON.stringify(d).includes('tokenHash'));assert.ok(!JSON.stringify(d).includes('secret@'));assert.ok(d.partner.referralOnly);
});
test('no-trade referral form requires the customer name but no trade/license fields',()=>{
  const html=recommendationForm({referralOnly:true});assert.match(html,/name="name"[^>]*required/);assert.doesNotMatch(html,/name="tradeId"|Lizenz|undefined|null/);assert.match(html,/name="email"[^>]*required/);
});
test('new navigation uses one customer action; obsolete top-right entry and interceptors are removed',()=>{
  const app=read('../public/assets/app.js'),basic=read('../public/assets/partner-basic.js'),v2=read('../public/assets/partner-basic-v2.js'),broker=read('../public/assets/partner-basic-broker.js');
  assert.doesNotMatch(app,/data-menu="referral"|d\.leads\.slice/);assert.match(app,/if\(b\?\.dataset\.page\)/);assert.match(app,/mountReferralActions\(\)/);assert.match(basic,/id="basic-customers-nav"/);assert.doesNotMatch(basic,/#quick-create'\)\.onclick=openRecommendation/);assert.match(v2,/const call=portalRequest/);assert.match(broker,/const get=portalRequest/);assert.doesNotMatch(v2,/stopImmediatePropagation|setInterval/);
});

test('public customer acceptance works once, confirms all fields and never grants a tipster property access',async()=>{
  for(const role of ['referral_partner','partner_basic','crafts_partner','broker_partner']){
    const f=fixture(role,{trade:role==='broker_partner'?'BROKER':'ROOF'});await f.post();const token=f.mail()[3].match(/empfehlung\/([^\s]+)/)[1];let handler;
    const service={rpc:async()=>({error:null})},deps={array,clean:(v,n)=>String(v??'').trim().slice(0,n),identifier:p=>p+'-'+crypto.randomUUID(),loadRuntime:async()=>f.snapshot,serviceClient:()=>service,corsHeaders:()=>({})};
    const code=stripTypeScriptTypes(read('../supabase/functions/portal-public/index.ts').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
    new Function('Deno',...Object.keys(deps),code)({serve:fn=>handler=fn,env:{get:()=>''}},...Object.values(deps));
    const url='https://example.invalid/functions/v1/portal-public/referral-invitations/'+token;
    assert.equal((await handler(new Request(url))).status,200);
    assert.equal((await handler(new Request(url,{method:'POST',body:JSON.stringify({accepted:true})}))).status,422);
    assert.equal((await handler(new Request(url,{method:'POST',body:JSON.stringify({accepted:true,emailConfirmed:true,addressConfirmed:true})}))).status,200);
    assert.equal(f.state.partnerReferralInvitations[0].status,'accepted');assert.equal(f.state.referralLeads.length,1);assert.equal(f.state.assignments.length,role==='referral_partner'?0:1);assert.equal((await handler(new Request(url))).status,410);
  }
});
