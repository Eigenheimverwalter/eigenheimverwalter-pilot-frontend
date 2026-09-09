import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PartnerOnboardingService,hashOnboardingToken} from '../supabase/functions/_shared/partner-onboarding-service.mjs';

// Fixture-only integration checks against the caller's isolated PostgreSQL engine.
export async function checkPartnerOnboardingService(db,admin,light){
  await db.exec('create table public.identity_imports(source_user_id text primary key,auth_user_id uuid);');
  await db.exec(readFileSync(new URL('../supabase/migrations/202609090005_partner_onboarding_service.sql',import.meta.url),'utf8'));
  const owner=crypto.randomUUID(),other=crypto.randomUUID(),unconfirmed=crypto.randomUUID();
  await db.query("insert into auth.users values($1,'admin@example.invalid',now()),($2,'light@example.invalid',now()),($3,'flow-owner@example.invalid',now()),($4,'flow-other@example.invalid',now()),($5,'unconfirmed@example.invalid',null)",[admin,light,owner,other,unconfirmed]);
  await db.query("insert into public.portal_users values($1,'partner_basic','active'),($2,'partner_basic','active'),($3,'partner_basic','active')",[owner,other,unconfirmed]);
  const trades=[{id:'EQUIP_HEATING',onboarding:true},{id:'BROKER'},{id:'OLD',tier:'legacy'}];
  const runtime={partners:[],trades,roleProfiles:[{role:'admin_light',permissions:['partners.read']}]};
  await db.query('update public.portal_runtime_state set payload=$1',[JSON.stringify(runtime)]);
  const store={
    create:async({actorId,input,tokenHash})=>(await db.query('select public.create_partner_onboarding($1,$2,$3) as result',[actorId,JSON.stringify(input),tokenHash])).rows[0].result,
    step:async({action,id,actorId,tokenHash,version,data})=>(await db.query('select public.partner_onboarding_step($1,$2,$3,$4,$5,$6) as result',[action,id,actorId,tokenHash,version,JSON.stringify(data)])).rows[0].result,
    invited:async({id,actorId,deliveryReference})=>(await db.query('select public.partner_onboarding_invited($1,$2,$3) as result',[id,actorId,deliveryReference])).rows[0].result,
  };
  const service=new PartnerOnboardingService({store,trades});
  const input=(overrides={})=>({source:'ADMIN_INVITE',request_key:crypto.randomUUID(),requested_plan:'BASIC',partner_type:'REFERRAL',
    prefilled_data:{company:'Example GmbH',contact_name:'Example Partner',email:'flow-owner@example.invalid',phone:'0000',address:'Test 1',postal_code:'22043',city:'Hamburg'},...overrides});
  const create=(v,actorId=admin)=>service.create(v,{actorId,source:v.source});
  const step=(action,flow,extra={})=>service.step(action,flow.onboarding_id,{actorId:owner,...extra});
  const request=input();
  await assert.rejects(create(request,light),/ONBOARDING_PERMISSION_DENIED/);
  await assert.rejects(create(request,owner),/ONBOARDING_PERMISSION_DENIED/);
  await assert.rejects(create(input({requested_plan:'PREMIUM'})),/ONBOARDING_INPUT_INVALID/);
  const flow=await create(request);assert.equal(flow.onboarding_status,'CREATED');assert.equal(flow.next_step,'START');assert.match(flow.secure_onboarding_token,/^[a-f0-9]{64}$/);
  const again=await create(request);assert.equal(again.onboarding_id,flow.onboarding_id);assert.equal(again.created,false);assert.equal(again.secure_onboarding_token,null);
  const saved=(await db.query('select * from public.partner_onboardings where id=$1',[flow.onboarding_id])).rows[0];
  assert.equal(saved.token_hash,await hashOnboardingToken(flow.secure_onboarding_token));assert.notEqual(saved.token_hash,flow.secure_onboarding_token);
  await assert.rejects(service.confirmInvitation(flow.onboarding_id,{actorId:owner,deliveryReference:'mail-test-1'}),/ONBOARDING_PERMISSION_DENIED/);
  const invited=await service.confirmInvitation(flow.onboarding_id,{actorId:admin,deliveryReference:'mail-test-1'});assert.equal(invited.onboarding_status,'INVITED');
  assert.equal((await service.confirmInvitation(flow.onboarding_id,{actorId:admin,deliveryReference:'mail-test-1'})).version,invited.version);
  await assert.rejects(service.confirmInvitation(flow.onboarding_id,{actorId:admin,deliveryReference:'mail-test-2'}),/ONBOARDING_NOT_OPEN/);
  await assert.rejects(create(input()),/ONBOARDING_DUPLICATE/);
  await assert.rejects(create({...request,requested_plan:'PREMIUM',partner_type:'BROKER_PARTNER'}),/ONBOARDING_SOURCE_CONFLICT/);
  await assert.rejects(step('READ',flow,{actorId:other}),/ONBOARDING_NOT_FOUND/);
  assert.equal((await step('READ',flow,{actorId:admin})).onboarding_id,flow.onboarding_id);
  assert.equal((await step('READ',flow,{actorId:light})).onboarding_id,flow.onboarding_id);
  await assert.rejects(step('START',flow,{actorId:admin,token:flow.secure_onboarding_token}),/ONBOARDING_PERMISSION_DENIED/);
  await assert.rejects(step('START',flow,{actorId:other,token:flow.secure_onboarding_token}),/ONBOARDING_IDENTITY_MISMATCH/);
  await assert.rejects(step('START',flow,{token:'a'.repeat(64)}),/ONBOARDING_NOT_FOUND/);
  let started=await step('START',flow,{token:flow.secure_onboarding_token});assert.equal(started.onboarding_status,'STARTED');
  assert.equal((await step('START',flow)).version,started.version,'Idempotent start');
  await assert.rejects(step('START',flow,{actorId:other,token:flow.secure_onboarding_token}),/ONBOARDING_NOT_FOUND/);
  const data={...request.prefilled_data};delete data.email;
  await assert.rejects(step('SAVE_DATA',flow,{version:1,data}),/ONBOARDING_CHANGED/);
  let changed=await step('SAVE_DATA',flow,{version:started.version,data:{...data,phone:''}});assert.equal(changed.onboarding_status,'DATA_INCOMPLETE');assert.ok(changed.missing_fields.includes('phone'));
  changed=await step('SAVE_DATA',flow,{version:changed.version,data});assert.equal(changed.onboarding_status,'DATA_COMPLETE');assert.equal(changed.next_step,'LEGAL');
  await assert.rejects(store.step({action:'SAVE_DATA',id:flow.onboarding_id,actorId:owner,version:changed.version,tokenHash:null,data:{...data,email:'stolen@example.invalid'}}),/ONBOARDING_INPUT_INVALID/);
  const legal=async(action,documents=[])=>(await db.query('select public.partner_legal_step($1,$2,$3,$4) as result',[action,flow.onboarding_id,owner,JSON.stringify(documents)])).rows[0].result;
  const manifest=await legal('READ');assert.equal(manifest.missingDocumentTypes.length,0);
  await legal('ACCEPT',manifest.documents.map(d=>({id:d.id,version:d.version,accepted:true})));
  const accepted=await step('READ',flow);assert.equal(accepted.onboarding_status,'LEGAL_ACCEPTED');assert.equal(accepted.next_step,'ACTIVATION_PENDING');
  await assert.rejects(step('SAVE_DATA',flow,{version:accepted.version,data:{...data,company:'Changed legal entity'}}),/ONBOARDING_DATA_LOCKED/);
  await step('CANCEL',flow,{version:accepted.version});
  await assert.rejects(step('START',flow),/ONBOARDING_NOT_OPEN/);
  assert.equal((await db.query('select count(*)::int n from public.legal_acceptances where onboarding_id=$1',[flow.onboarding_id])).rows[0].n,2);
  assert.deepEqual((await db.query("select payload from public.portal_runtime_state where id='primary'")).rows[0].payload,runtime,'Service must not activate/rewrite partners or licences');
  // Existing identity/partner retained on upgrade, with strict owner matching.
  runtime.partners.push({id:'legacy-partner-id',userId:'legacy-user-id',email:'flow-owner@example.invalid',plan:'basic',status:'active'});
  await db.query('update public.portal_runtime_state set payload=$1',[JSON.stringify(runtime)]);
  await db.query('insert into public.identity_imports values($1,$2)',['legacy-user-id',owner]);
  const ownInput=input({source:'SELF_SERVICE_PREMIUM',requested_plan:'PREMIUM',partner_type:'EQUIPMENT_PARTNER',equipment_type:'EQUIP_HEATING',existing_partner_id:'legacy-partner-id'});
  await assert.rejects(create({...ownInput,existing_partner_id:null},owner),/ONBOARDING_PARTNER_LINK_REQUIRED/);
  await assert.rejects(create(ownInput,other),/ONBOARDING_IDENTITY_MISMATCH/);
  const upgrade=await create(ownInput,owner);assert.equal(upgrade.partner_id,'legacy-partner-id');
  const upgradeStart=await step('START',upgrade);assert.equal(upgradeStart.onboarding_status,'STARTED');
  await assert.rejects(create({...ownInput,request_key:crypto.randomUUID()},owner),/ONBOARDING_DUPLICATE/);
  // Expired token cannot be used, but historical state remains readable by owner.
  await db.query("update public.partner_onboardings set expires_at=now()-interval '1 minute' where id=$1",[upgrade.onboarding_id]);
  await assert.rejects(step('START',upgrade),/ONBOARDING_EXPIRED/);
  const renewal=await create({...ownInput,request_key:crypto.randomUUID()},owner);assert.notEqual(renewal.onboarding_id,upgrade.onboarding_id);
  assert.equal((await step('READ',upgrade)).onboarding_status,'EXPIRED');
  // Server Sales source shares the same service and retains source idempotency.
  const sales=input({source:'SALES_OS',sales_lead_id:'sales-lead-test-1',requested_plan:'PREMIUM',partner_type:'BROKER_PARTNER',prefilled_data:{...request.prefilled_data,email:'sales@example.invalid'}});
  await assert.rejects(create(sales,admin),/ONBOARDING_PERMISSION_DENIED/);
  const salesFlow=await create(sales,null);assert.equal(salesFlow.onboarding_status,'CREATED');
  assert.equal((await create({...sales,request_key:crypto.randomUUID()},null)).onboarding_id,salesFlow.onboarding_id);
  await assert.rejects(create({...sales,prefilled_data:{...sales.prefilled_data,email:'different@example.invalid'}},null),/ONBOARDING_SOURCE_CONFLICT/);
  // Race-shaped repeated calls leave exactly one durable entry/evidence event.
  const repeated=await Promise.all([create(sales,null),create(sales,null)]);assert.ok(repeated.every(x=>!x.created));
  assert.equal((await db.query("select count(*)::int n from public.audit_events where action='partner_onboarding_created' and entity_id=$1",[salesFlow.onboarding_id])).rows[0].n,1);
  // Delivery acknowledgement can arrive after the receiver already started.
  const raceInput=input({prefilled_data:{...request.prefilled_data,email:'flow-other@example.invalid'}}),race=await create(raceInput);
  await service.step('START',race.onboarding_id,{actorId:other,token:race.secure_onboarding_token});
  assert.equal((await service.confirmInvitation(race.onboarding_id,{actorId:admin,deliveryReference:'mail-race-1'})).onboarding_status,'STARTED');
  const audit=(await db.query("select metadata from public.audit_events where action like 'partner_onboarding_%'")).rows;
  assert.ok(audit.every(x=>!JSON.stringify(x).includes('@')&&!JSON.stringify(x).includes('token')));
  await db.exec('set role authenticated');
  await assert.rejects(create(input()),/permission denied/);await assert.rejects(step('READ',renewal),/permission denied/);
  await assert.rejects(db.query('select * from public.partner_onboardings'),/permission denied/);
  await db.exec('reset role');
}
