import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSupabaseOnboardingService} from '../supabase/functions/_shared/partner-onboarding-store.mjs';
import {handleSalesOnboarding,salesInvitationToken} from '../supabase/functions/_shared/sales-onboarding-adapter.mjs';
export async function checkSalesOnboarding(db){
 await db.exec(readFileSync(new URL('../supabase/migrations/202609090006_sales_onboarding_delivery.sql',import.meta.url),'utf8'));
 const trades=[{id:'EQUIP_DACH',name:'Dach',onboarding:true}];
 const old=(await db.query('select payload from public.portal_runtime_state')).rows[0].payload;
 await db.query('update public.portal_runtime_state set payload=$1',[JSON.stringify({...old,trades})]);
 const client={rpc:async(name,args)=>{
   assert.ok(['create_partner_onboarding','partner_onboarding_invited','sales_onboarding_delivery'].includes(name));
   const values=Object.values(args),slots=values.map((v,i)=>`$${i+1}`);
   try{return{data:(await db.query(`select public.${name}(${slots}) result`,values.map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows[0].result,error:null}}catch(error){return{data:null,error}}
 },from:table=>{
   assert.equal(table,'partner_onboardings');const filter=[];let columns;
   const q={select:v=>{columns=v;return q},eq:(k,v)=>{assert.ok(['source','invite_id','sales_lead_id'].includes(k));filter.push([k,v]);return q},maybeSingle:async()=>({data:(await db.query(`select ${columns} from public.partner_onboardings where ${filter.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,filter.map(([,v])=>v))).rows[0]||null,error:null})};return q;
 }};
 const service=createSupabaseOnboardingService(client,trades),secret='fixture-secret-'.repeat(8);
 const makeJob=()=>({id:crypto.randomUUID(),partnerId:crypto.randomUUID(),leadId:'central-'+crypto.randomUUID(),cooperationLevel:'PREMIUM',onboardingPartnerType:'EQUIPMENT_PARTNER',equipmentType:'Dach',company:'Fixture GmbH',contact:'Fixture Partner',email:`${crypto.randomUUID()}@example.invalid`,phone:'0401234',address:'Fixture 1',postalCode:'22043',city:'Hamburg'});
 let sends=0,mail;
 const execute=(job,extra={})=>handleSalesOnboarding({action:'invite',job,db:client,service,trades,secret,portalUrl:'https://example.invalid/pilot',sendMail:async value=>{sends++;mail=value;return true},...extra});
 const job=makeJob(),first=await execute(job);
 assert.equal(first.onboardingStatus,'INVITED');assert.equal(first.partnerStatus,'ONBOARDING');assert.equal(first.paymentStatus,'UNCONFIRMED');assert.equal(first.status,'sent');assert.equal(sends,1);
 assert.equal(mail.channel,'partner');assert.match(mail.message,/\/partner-onboarding\/[a-f0-9-]+#token=[a-f0-9]{64}/);
 assert.equal((await execute(job)).onboardingId,first.onboardingId);assert.equal(sends,1);
 assert.equal((await execute(job,{action:'status'})).onboardingStatus,'INVITED');assert.equal(sends,1);
 const stored=(await db.query('select * from public.partner_onboardings where id=$1',[first.onboardingId])).rows[0];
 assert.equal(stored.prefilled_data.phone,job.phone);assert.equal(stored.prefilled_data.email,job.email);assert.equal(stored.equipment_type,'EQUIP_DACH');assert.equal(stored.invite_id,job.id);assert.equal(stored.source,'SALES_OS');
 assert.ok(!JSON.stringify(stored).includes(await salesInvitationToken(secret,job.id)));
 const failed=makeJob();let attempts=0;assert.equal((await execute(failed,{sendMail:async()=>{attempts++;throw Error('Uncertain SMTP')}})).status,'uncertain');
 await execute(failed,{sendMail:async()=>{attempts++;return true}});assert.equal(attempts,1);
 const lost=makeJob();await execute(lost);const flow=(await execute(lost,{action:'status'}));
 await db.query('update public.partner_onboardings set invitation_delivery_ref=null where id=$1',[flow.onboardingId]);
 await execute(lost,{action:'status'});assert.ok((await db.query('select invitation_delivery_ref from public.partner_onboardings where id=$1',[flow.onboardingId])).rows[0].invitation_delivery_ref);
 assert.equal((await db.query('select count(*)::int n from public.partner_onboardings where status=\'ACTIVE\' and source=\'SALES_OS\'')).rows[0].n,0);
 assert.deepEqual((await db.query('select payload from public.portal_runtime_state')).rows[0].payload,{...old,trades});
 await db.exec('set role authenticated');await assert.rejects(db.query("select public.sales_onboarding_delivery($1,$2,$3,'CLAIM')",[first.onboardingId,job.id,'a'.repeat(64)]),/permission denied/);await db.exec('reset role');
}
