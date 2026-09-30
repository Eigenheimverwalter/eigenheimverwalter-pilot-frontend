import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createSupabaseOnboardingService} from '../supabase/functions/_shared/partner-onboarding-store.mjs';
export async function checkPartnerSelfService(db){
  await db.exec("alter table auth.users add column encrypted_password text default 'fixture-hash'");
  await db.exec(readFileSync(new URL('../supabase/migrations/202609100001_partner_self_service.sql',import.meta.url),'utf8'));
  const runtime=(await db.query('select payload from public.portal_runtime_state')).rows[0].payload;
  const client={rpc:async(name,args)=>{try{return{data:(await db.query(`select public.${name}(${Object.values(args).map((_,i)=>'$'+(i+1))}) result`,Object.values(args).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows[0].result};}catch(error){return{error};}}};
  const service=createSupabaseOnboardingService(client),actor=crypto.randomUUID(),email='self-'+actor+'@example.invalid';
  await db.query('insert into auth.users(id,email) values($1,$2)',[actor,email]);
  await assert.rejects(service.store.selfSession({actorId:actor}),e=>e.code==='ONBOARDING_IDENTITY_MISMATCH');
  assert.equal((await db.query('select count(*)::int n from portal_users where id=$1',[actor])).rows[0].n,0);
  await db.query("update auth.users set email_confirmed_at=now(),encrypted_password='provider-random-initial-hash' where id=$1",[actor]);
  const first=await service.store.selfSession({actorId:actor});assert.equal(first.email,email);assert.equal(first.needs_password,true);
  const input={source:'SELF_SERVICE_BASIC',requested_plan:'BASIC',partner_type:'REFERRAL',request_key:crypto.randomUUID(),prefilled_data:{email}};
  const create=()=>service.create(input,{actorId:actor,source:input.source});
  await assert.rejects(create(),e=>e.code==='ONBOARDING_IDENTITY_MISMATCH');
  await db.query("update auth.users set encrypted_password='fixture-hash' where id=$1",[actor]);
  const flow=await create();assert.equal(flow.onboarding_status,'CREATED');assert.equal((await create()).created,false);
  const session=await service.store.selfSession({actorId:actor});assert.equal(session.onboarding_id,flow.onboarding_id);assert.equal(session.needs_password,false);
  assert.equal((await db.query('select role,status from portal_users where id=$1',[actor])).rows[0].status,'invited');
  assert.equal((await db.query("select count(*)::int n from audit_events where entity_id=$1 and action='partner_onboarding_identity_prepared'",[actor])).rows[0].n,1);
  await assert.rejects(service.create({...input,request_key:crypto.randomUUID()},{actorId:actor,source:input.source}),e=>e.code==='ONBOARDING_DUPLICATE');
  await assert.rejects(service.create({...input,prefilled_data:{email:'forged@example.invalid'}},{actorId:actor,source:input.source}),e=>e.code==='ONBOARDING_IDENTITY_MISMATCH');
  const started=await service.step('START',flow.onboarding_id,{actorId:actor});assert.equal(started.onboarding_status,'STARTED');
  const saved=await service.step('SAVE_DATA',flow.onboarding_id,{actorId:actor,version:started.version,data:{company:'Fixture',contact_name:'Fixture',phone:'0401234',address:'Test 1',postal_code:'22043',city:'Hamburg'}});assert.equal(saved.next_step,'LEGAL');
  const premiumActor=crypto.randomUUID(),premiumEmail='premium-'+premiumActor+'@example.invalid';
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[premiumActor,premiumEmail]);
  await service.store.selfSession({actorId:premiumActor});
  await db.query("update auth.users set encrypted_password='chosen-fixture-hash' where id=$1",[premiumActor]);
  const premium=await service.create({...input,source:'SELF_SERVICE_PREMIUM',requested_plan:'PREMIUM',partner_type:'BROKER_PARTNER',request_key:crypto.randomUUID(),prefilled_data:{email:premiumEmail}},{actorId:premiumActor,source:'SELF_SERVICE_PREMIUM'});assert.equal(premium.onboarding_status,'CREATED');
  await db.query("update portal_users set status='disabled' where id=$1",[actor]);
  await assert.rejects(service.store.selfSession({actorId:actor}),e=>e.code==='ONBOARDING_LOGIN_REQUIRED');
  await assert.rejects(create(),e=>e.code==='ONBOARDING_IDENTITY_MISMATCH');
  const invited=crypto.randomUUID(),invitedEmail='invited-'+invited+'@example.invalid';
  await service.create({...input,source:'SALES_OS',sales_lead_id:crypto.randomUUID(),request_key:crypto.randomUUID(),prefilled_data:{email:invitedEmail}},{source:'SALES_OS'});
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[invited,invitedEmail]);
  await assert.rejects(service.store.selfSession({actorId:invited}),e=>e.code==='ONBOARDING_INVITATION_REQUIRED');
  assert.equal((await db.query('select count(*)::int n from portal_users where id=$1',[invited])).rows[0].n,0,'Failed session must roll back profile insert');
  const mailEmail='mail@example.invalid',hash='a'.repeat(64),mail=()=>service.store.emailRequest({email:mailEmail,emailHash:hash});
  assert.equal(await mail(),true);assert.equal(await mail(),false);
  for(let n=0;n<2;n++){await db.query("update partner_onboarding_mail_limits set last_attempt=now()-interval '61 seconds' where bucket=$1",[hash]);assert.equal(await mail(),true);}
  await db.query("update partner_onboarding_mail_limits set last_attempt=now()-interval '61 seconds' where bucket=$1",[hash]);assert.equal(await mail(),false);
  await db.query("update partner_onboarding_mail_limits set attempts=100 where bucket='global'");
  assert.equal(await service.store.emailRequest({email:'other@example.invalid',emailHash:'b'.repeat(64)}),false);
  assert.deepEqual((await db.query('select payload from public.portal_runtime_state')).rows[0].payload,runtime);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.partner_onboarding_self_session($1)',[actor]),/permission denied/);await assert.rejects(db.query('select public.partner_onboarding_email_request($1,$2)',[email,hash]),/permission denied/);await assert.rejects(db.query('select * from partner_onboarding_mail_limits'),/permission denied/);await db.exec('reset role');}
  console.log(JSON.stringify({selfService:true,verifiedMailbox:true,passwordRequired:true,pendingOnly:true,basicAndPremium:true,reusesCentralCreate:true,duplicateSafe:true,mailRateLimits:true,noRuntimeWrites:true,noActivation:true}));
}
