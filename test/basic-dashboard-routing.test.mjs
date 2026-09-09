import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {referralOverview,referralPartnerRoles} from '../supabase/functions/_shared/partner-referrals.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const strip=source=>stripTypeScriptTypes(source.replace(/^import [\s\S]*?;\r?\n/gm,''),{mode:'strip'});
const array=value=>Array.isArray(value)?value:[];
function handlerFor(role,linked=true){
  const partner={id:'partner-own',userId:'source-own',status:'active',company:'Basic Test',referralOnly:role==='referral_partner',primaryTradeId:'ROOF',plan:'basic'};
  const state={partners:linked?[partner]:[],partnerReferralInvitations:[{id:'own',partnerId:'partner-own',name:'Eigene Empfehlung',email:'own@example.invalid',postalCode:'22043',status:'pending'},{id:'foreign',partnerId:'partner-other',name:'Fremd',email:'private@example.invalid',postalCode:'10115',status:'pending'}]};
  const deps={array,isAdmin:p=>['super_admin','admin_light'].includes(p.role),sourcePartner:(s,id)=>array(s.partners).find(p=>p.userId===id),scopedProperties:()=>[],referralOverview,referralPartnerRoles};
  const readRoute=new Function(...Object.keys(deps),strip(read('../supabase/functions/_shared/read-routes.ts')).replace('export function readRoute','function readRoute')+';return readRoute')(...Object.values(deps));
  let handler;
  const routes={...deps,readRoute,authenticate:async()=>({user:{email:'test@example.invalid'},profile:{id:'auth-own',role,status:'active'},sourceUserId:'source-own',service:{}}),loadRuntime:async()=>({state,revision:1}),corsHeaders:()=>({}),identifier:()=>'',replaceRuntime:()=>{throw Error('No writes allowed')},writeRoute:()=>{throw Error('No writes allowed')}};
  new Function('Deno',...Object.keys(routes),strip(read('../supabase/functions/portal-api/index.ts')))({serve:fn=>handler=fn},...Object.values(routes));
  return path=>handler(new Request('https://pilot.invalid/functions/v1/portal-api'+path,{headers:{Authorization:'Bearer test'}}));
}
for(const role of ['partner_basic','referral_partner'])test(`${role}: real HTTP dispatcher returns scoped Basic dashboard, not generic dashboard`,async()=>{
  const request=handlerFor(role),response=await request('/partner-basic/dashboard'),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.partner.id,'partner-own');assert.equal(body.kpis.recommended,1);assert.equal(body.recent.length,1);assert.equal(body.recent[0].name,'Eigene Empfehlung');assert.ok(!JSON.stringify(body).includes('private@example.invalid'));assert.ok(!body.properties);assert.ok(!body.source);
  assert.equal((await request('/production/customers')).status,403);
  const generic=await(await request('/dashboard')).json();assert.equal(generic.source,'supabase');
});
test('missing Basic partner linkage remains forbidden without widening permissions',async()=>{
  assert.equal((await handlerFor('partner_basic',false)('/partner-basic/dashboard')).status,403);
  assert.equal((await handlerFor('admin_light')('/partner-basic/dashboard')).status,403);
});
test('Basic dashboard navigation awaits its own renderer and never requests admin pages',async()=>{
  const source=read('../public/assets/app.js'),line=source.split('\n').find(x=>x.startsWith('async function render('));
  for(const role of ['partner_basic','referral_partner']){
    let rendered=0;const nodes={},state={user:{role,name:'Antonio Test'}};
    const deps={state,document:{querySelectorAll:()=>[]},$:s=>nodes[s]??={},navs:[],renderBasicDashboard:async()=>{rendered++},pages:{dashboard:()=>{throw Error('Admin page must not run')}},esc:x=>x};
    const render=new Function(...Object.keys(deps),line+';return render')(...Object.values(deps));await render('dashboard');assert.equal(rendered,1);assert.ok(!nodes['#content'].innerHTML.includes('card error'));
    deps.renderBasicDashboard=async()=>{throw Error('Test: fehlende Zuordnung')};const failing=new Function(...Object.keys(deps),line+';return render')(...Object.values(deps));await failing('dashboard');assert.match(nodes['#content'].innerHTML,/Test: fehlende Zuordnung/);
  }
});
