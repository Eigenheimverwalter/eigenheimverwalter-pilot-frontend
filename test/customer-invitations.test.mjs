import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {customerEmailKnown,assertNewCustomerEmail,commitCustomerInvitation,assertRegistrationEmailAvailable} from '../supabase/functions/_shared/customer-invitations.mjs';
import {appDownloadPanel,APP_STORES} from '../public/assets/app-downloads.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
for(const collection of ['users','customers','partners','partnerReferralInvitations','customerInvitations','referralLeads']){
  test(`global email guard: ${collection}, other partner, different address, expired`,()=>{
    const state={[collection]:[{id:'old',email:' CUSTOMER@Example.invalid ',partnerId:'other',address:'Elsewhere',status:'expired'}]};
    assert.equal(customerEmailKnown(state,'customer@example.invalid'),true);
    assert.throws(()=>assertNewCustomerEmail(state,'customer@example.invalid'),e=>e.status===409);
    assert.doesNotThrow(()=>assertNewCustomerEmail(state,'new@example.invalid'));
  });
}
test('database guard fails closed on duplicates, stale writes and database outage',async()=>{
  for(const [message,status] of [['CUSTOMER_EMAIL_ALREADY_KNOWN',409],['runtime_revision_conflict',409],['database unavailable',503]]){
    await assert.rejects(commitCustomerInvitation({rpc:async()=>({error:{message}})},{revision:1,state:{}},null,'customer.invitation.created','customer_invitation','test',' TEST@example.invalid '),e=>e.status===status);
  }
});
test('confirmation ignores only its own invitation and requires a reliable private lookup',async()=>{
  const state={customerInvitations:[{id:'own',email:'test@example.invalid'}]};assert.equal(customerEmailKnown(state,'test@example.invalid','own'),false);
  state.customers=[{email:'test@example.invalid'}];assert.equal(customerEmailKnown(state,'test@example.invalid','own'),true);
  for(const [result,status] of [[{data:true},409],[{data:null},503],[{error:{}},503]])await assert.rejects(assertRegistrationEmailAvailable({rpc:async()=>result},'test@example.invalid','own'),e=>e.status===status);
});
function publicHandler(state,{known=false,rpcFailure=false}={}){
  let handler,authCreates=0,mails=0,commits=0;
  const service={rpc:async(name)=>name==='customer_email_known'?{data:known,error:rpcFailure?{message:'down'}:null}:(commits++,{error:rpcFailure?{message:'CUSTOMER_EMAIL_ALREADY_KNOWN'}:null}),auth:{admin:{createUser:async()=>{authCreates++;return{data:{user:{id:'new-auth'}}}},deleteUser:async()=>{}}}};
  const deps={assertNewCustomerEmail,commitCustomerInvitation,assertRegistrationEmailAvailable,array:v=>Array.isArray(v)?v:[],clean:(v,n)=>String(v??'').trim().slice(0,n),identifier:p=>p+'-'+crypto.randomUUID(),loadRuntime:async()=>({state,revision:1}),serviceClient:()=>service,corsHeaders:()=>({}),fetch:async()=>{mails++;return new Response('{}')}};
  const code=stripTypeScriptTypes(read('supabase/functions/portal-public/index.ts').replace(/^import .*\r?\n/gm,''),{mode:'strip'});
  new Function('Deno',...Object.keys(deps),code)({serve:fn=>handler=fn,env:{get:()=> 'x'.repeat(60)}},...Object.values(deps));
  return {post:(path,body)=>handler(new Request('https://test.invalid/portal-public/'+path,{method:'POST',body:JSON.stringify(body)})),authCreates:()=>authCreates,mails:()=>mails,commits:()=>commits};
}
test('public QR refuses a known customer and database duplicate before sending any mail',async()=>{
  for(const rpcFailure of [false,true]){
    const state={partners:[{id:'p',status:'active'}],referralLeads:[],customers:rpcFailure?[]:[{email:'test@example.invalid'}]};
    const h=publicHandler(state,{rpcFailure}),r=await h.post('referrals/p/leads',{email:'test@example.invalid',postalCode:'22043',consent:true});
    assert.equal(r.status,409);assert.equal(h.mails(),0);
  }
});
test('customer registration rejects missing consent or another existing account; new invite succeeds once',async()=>{
  const token='fixture',hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const values={password:'FixturePass123!',passwordConfirmation:'FixturePass123!',consent:true};
  for(const [known,consent,status] of [[false,false,422],[true,true,409],[false,true,201]]){
    const state={customerInvitations:[{id:'own',tokenHash:hash,status:'pending',expiresAt:'2999-01-01',email:'test@example.invalid'}],customers:[],properties:[]};
    const h=publicHandler(state,{known}),r=await h.post('customer-registration/'+token,{...values,consent});
    assert.equal(r.status,status);assert.equal(h.authCreates(),status===201?1:0);
    if(status===201)assert.equal((await h.post('customer-registration/'+token,values)).status,410);
  }
});
test('both official stores are offered without referral tokens, fake deep links or app-login claims',()=>{
  const html=appDownloadPanel();assert.ok(html.includes(APP_STORES.apple));assert.ok(html.includes(APP_STORES.android));
  assert.match(html,/Laden im App Store/);assert.match(html,/Jetzt bei Google Play/);assert.match(html,/noreferrer/);
  assert.doesNotMatch(html,/intent:|app-argument|token=|location\.replace/);
  const reg=read('public/customer-registration.html'),code=read('public/assets/customer-registration.js');
  assert.match(reg,/apple-itunes-app" content="app-id=6449584443/);assert.match(reg,/registration-downloads/);
  assert.doesNotMatch(code,/Passwort in der App anmelden/);assert.match(code,/if\(busy\|\|!form.reportValidity\(\)\)return/);
  assert.match(read('public/assets/partner-referrals.js'),/Empfehlung bestätigt[\s\S]*appDownloadPanel\(\)/);
});
