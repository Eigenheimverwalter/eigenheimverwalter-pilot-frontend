import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

function fixture({mailOk=true}={}){
 let state={partners:[],partnerInvitations:[],partnerOrganizations:[],users:[],trades:[]},revision=1,handler,mail=null,sends=0,identity=null;
 const secret='test-bridge-'.repeat(8),gateway='test-gateway-'.repeat(8);
 const service={from:()=>({insert:async row=>{identity=row;return{error:null}},delete:()=>({eq:async()=>({error:null})})}),auth:{admin:{createUser:async()=>({data:{user:{id:'auth-test'}},error:null}),deleteUser:async()=>({})}},rpc:async(name,args)=>{if(args.expected_revision!==revision)return{error:{message:'runtime_revision_conflict'}};state=structuredClone(args.next_payload);revision++;return{error:null}}};
 const deps={array:v=>Array.isArray(v)?v:[],clean:(v,n=500)=>String(v??'').replace(/[<>\u0000-\u001f]/g,' ').trim().slice(0,n),identifier:p=>p+'-test',loadRuntime:async()=>({state:structuredClone(state),revision}),replaceRuntime:async(s,snapshot)=>{if(snapshot.revision!==revision)throw Error('conflict');state=structuredClone(snapshot.state);revision++},serviceClient:()=>service,corsHeaders:()=>({}),fetch:async(url,options)=>{sends++;mail=JSON.parse(options.body);return new Response('{}',{status:mailOk?200:502})}};
 const env={BASIC_PARTNER_BRIDGE_TOKEN:secret,PILOT_MAIL_GATEWAY_TOKEN:gateway,SUPABASE_URL:'https://example.invalid'};
 function load(path){const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*?;\r?\n/gm,'');const js=stripTypeScriptTypes(source,{mode:'strip'});new Function('Deno',...Object.keys(deps),js)({env:{get:key=>env[key]},serve:fn=>{handler=fn}},...Object.values(deps));return handler}
 const bridge=load('../supabase/functions/portal-sales-onboarding/index.ts');
 const job={id:'test',partnerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',organizationId:'00000000-0000-4000-8000-000000000001',leadId:'lead-test',partnerType:'Basic Partner',company:'Testbetrieb',contact:'Test Kontakt',email:'test@example.invalid',category:'Handwerker',specialization:'Dach'};
 return{job,secret,bridge,load,state:()=>state,mail:()=>mail,sends:()=>sends,identity:()=>identity,request:(action='invite',overrides={})=>new Request('https://example.invalid',{method:'POST',headers:{'x-basic-partner-token':secret,'Content-Type':'application/json'},body:JSON.stringify({action,job:{...job,...overrides}})})};
}
test('Bridge rejects unauthorized callers without state change or email',async()=>{const f=fixture();const r=await f.bridge(new Request('https://example.invalid',{method:'POST',body:'{}'}));assert.equal(r.status,401);assert.equal(f.sends(),0);assert.equal(f.state().partners.length,0)});
test('Basic invitation is idempotent, uses partner sender and has no license or elevated trade role',async()=>{
 const f=fixture();assert.equal((await (await f.bridge(f.request())).json()).status,'sent');assert.equal(f.sends(),1);const p=f.state().partners[0];assert.equal(p.plan,'basic');assert.equal(p.referralOnly,true);assert.equal(p.role,'referral_partner');assert.deepEqual(p.postalCodes,[]);assert.deepEqual(p.tradeIds,[]);assert.equal(p.sourceSpecialization,'Dach');assert.equal(f.mail().channel,'partner');assert.equal(f.mail().recipientEmail,'test@example.invalid');
 assert.equal((await (await f.bridge(f.request())).json()).status,'sent');assert.equal(f.sends(),1);
 const token=f.mail().message.match(/partner-einladung\/([a-f0-9]+)/)[1];assert.ok(token.length>=64);assert.ok(!JSON.stringify(f.state()).includes(token));
});
test('Ambiguous mail result is not a sent KPI and cannot cause an automatic duplicate send',async()=>{const f=fixture({mailOk:false});assert.equal((await (await f.bridge(f.request())).json()).status,'uncertain');await f.bridge(f.request());assert.equal(f.sends(),1);assert.equal(f.state().partnerInvitations[0].sentAt,undefined)});
test('Legacy invitation cannot bypass the central legal onboarding',async()=>{
 const f=fixture();await f.bridge(f.request());const token=f.mail().message.match(/partner-einladung\/([a-f0-9]+)/)[1];const publicHandler=f.load('../supabase/functions/portal-public/index.ts');
 const url='https://example.invalid/functions/v1/portal-public/partner-invitations/'+token;
 assert.equal((await publicHandler(new Request(url))).status,200);assert.equal(f.state().users.length,0);
 const blocked=await publicHandler(new Request(url,{method:'POST',body:JSON.stringify({password:'Fixture-Password123?',passwordConfirmation:'Fixture-Password123?'})}));assert.equal(blocked.status,409);assert.match((await blocked.json()).error,/AGB, Datenschutz/);
 assert.equal(f.identity(),null);assert.equal(f.state().users.length,0);assert.equal(f.state().partnerInvitations[0].status,'pending');
});
