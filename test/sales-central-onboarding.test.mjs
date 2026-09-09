import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {salesOnboardingInput,salesOnboardingStatus,salesInvitationToken} from '../supabase/functions/_shared/sales-onboarding-adapter.mjs';
const job={id:crypto.randomUUID(),partnerId:crypto.randomUUID(),leadId:'fixture',cooperationLevel:'BASIC',onboardingPartnerType:'REFERRAL',company:'Fixture',email:'fixture@example.invalid'};
test('Sales adapter requires explicit plan/type and maps equipment only through existing catalog',()=>{
 assert.equal(salesOnboardingInput(job,[]).partner_type,'REFERRAL');
 assert.throws(()=>salesOnboardingInput({...job,cooperationLevel:'PREMIUM'},[]),/PARTNER_TYPE_REQUIRED/);
 assert.throws(()=>salesOnboardingInput({...job,id:'wrong'},[]),/ONBOARDING_INPUT_INVALID/);
 assert.throws(()=>salesOnboardingInput({...job,onboardingPartnerType:'EQUIPMENT_PARTNER',equipmentType:'guess'},[]),/EQUIPMENT_TYPE_REQUIRED/);
 assert.equal(salesOnboardingInput({...job,onboardingPartnerType:'EQUIPMENT_PARTNER',equipmentType:'Dach'},[{id:'EQUIP_DACH',name:'Dach'}]).equipment_type,'EQUIP_DACH');
});
test('Confirmed invitation/identity is not a payment, active account or licence',()=>{
 for(const status of ['CREATED','INVITED','STARTED','LEGAL_ACCEPTED','PAYMENT_PENDING']){const s=salesOnboardingStatus({id:crypto.randomUUID(),status,requested_plan:'PREMIUM',invitation_delivery_status:'sent',token_claimed_at:new Date().toISOString()});assert.equal(s.partnerStatus,'ONBOARDING');assert.equal(s.paymentStatus,'UNCONFIRMED');assert.equal(s.status,'sent')}
});
test('Outbox token is stable per job, distinct across jobs and separate from legacy signatures',async()=>{
 const secret='fixture-secret'.repeat(8),token=await salesInvitationToken(secret,job.id);
 assert.match(token,/^[a-f0-9]{64}$/);assert.equal(await salesInvitationToken(secret,job.id),token);assert.notEqual(await salesInvitationToken(secret,crypto.randomUUID()),token);
});
test('Actual HTTP bridge rejects central entries while rollout is closed without legacy side effects',async()=>{
 let handler;const secret='fixture-secret'.repeat(8);
 const source=readFileSync(new URL('../supabase/functions/portal-sales-onboarding/index.ts',import.meta.url),'utf8').replace(/^import .*?;\r?\n/gm,'');
 new Function('Deno','serviceClient','loadRuntime',stripTypeScriptTypes(source,{mode:'strip'}))({env:{get:k=>k==='BASIC_PARTNER_BRIDGE_TOKEN'?secret:undefined},serve:fn=>{handler=fn}},()=>({}),async()=>({state:{}}));
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-basic-partner-token':secret},body:JSON.stringify({action:'invite',job:{...job,organizationId:'00000000-0000-4000-8000-000000000001',onboardingVersion:3}})}));
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ONBOARDING_NOT_RELEASED');
});
