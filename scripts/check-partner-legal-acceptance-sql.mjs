import assert from 'node:assert/strict';
// All fixture identities/documents exist only in the caller's in-memory database.
export async function checkPartnerLegalAcceptance(db,change,admin,light){
  const owner=crypto.randomUUID(),other=crypto.randomUUID(),data={company:'Test GmbH',contact_name:'SQL Fixture',email:'owner@example.invalid',phone:'0000',address:'Teststraße 1',postal_code:'22043',city:'Hamburg'};
  await db.query("insert into auth.users values($1,$2,now()),($3,'other@example.invalid',now())",[owner,data.email,other]);
  await db.query("insert into public.portal_users values($1,'partner_basic','active'),($2,'partner_basic','active')",[owner,other]);
  const create=async({actor=owner,values=data,expires='2999-01-01',status='LEGAL_PENDING',existing=null,partner='test-existing',plan='BASIC',types=['TERMS','PRIVACY']}={})=>{
    const id=crypto.randomUUID();await db.query(`insert into public.partner_onboardings(id,source,requested_plan,partner_type,prefilled_data,identity_verified,status,auth_user_id,expires_at,existing_partner_id,partner_id,required_document_types)
      values($1,'SELF_SERVICE_BASIC',$2,'REFERRAL',$3,true,$4,$5,$6,$7,$8,$9)`,[id,plan,JSON.stringify(values),status,actor,expires,existing,partner,types]);return id;
  };
  const step=async(id,action='READ',documents=[],actor=owner,document=null)=>(await db.query('select public.partner_legal_step($1,$2,$3,$4,$5,null,$6) as result',[action,id,actor,JSON.stringify(documents),document,'SQL test agent'])).rows[0].result;
  const confirmations=result=>result.documents.map(d=>({id:d.id,version:d.version,accepted:true}));
  const count=async(id)=>(await db.query('select count(*)::int as n from public.legal_acceptances where onboarding_id=$1',[id])).rows[0].n;
  const publish=async(type)=>{const id=crypto.randomUUID(),draft=await change('UPLOAD',id,null,{document_type:type,title:type+' test',file_name:'fixture.pdf',storage_path:id+'/test.pdf',file_size:20,sha256:'b'.repeat(64),acceptance_text:'SQL fixture consent'});
    const approved=await change('APPROVE',id,draft.revision);return change('ACTIVATE',id,approved.revision,{effective_from:'2026-01-01'});};
  const id=await create();
  assert.deepEqual((await step(id)).missingDocumentTypes,['PRIVACY']);
  await assert.rejects(step(id,'ACCEPT'),/LEGAL_ACCEPTANCE_REQUIRED/);
  const privacy=await publish('PRIVACY');let manifest=await step(id);
  assert.equal(manifest.documents.length,2);assert.equal(manifest.accepted,false);
  await assert.rejects(step(id,'READ',[],other),/ONBOARDING_NOT_FOUND/);
  await assert.rejects(step(crypto.randomUUID()),/ONBOARDING_NOT_FOUND/);
  await assert.rejects(step(id,'READ',[],admin),/ONBOARDING_NOT_FOUND/);
  const expired=await create({expires:'2000-01-01'});await assert.rejects(step(expired),/ONBOARDING_EXPIRED/);
  const unverified=await create({values:{...data,email:'forged@example.invalid'}});await assert.rejects(step(unverified),/ACCEPTANCE_IDENTITY_MISMATCH/);
  const incomplete=await create({values:{...data,phone:''}});await assert.rejects(step(incomplete,'ACCEPT',confirmations(manifest)),/ONBOARDING_DATA_REQUIRED/);
  const missingAdditional=await create({types:['TERMS','PRIVACY','PREMIUM_TERMS']});assert.deepEqual((await step(missingAdditional)).missingDocumentTypes,['PREMIUM_TERMS']);
  await assert.rejects(step(missingAdditional,'ACCEPT',[...confirmations(manifest),{id:crypto.randomUUID(),version:1,accepted:true}]),/LEGAL_DOCUMENTS_UNAVAILABLE/);
  assert.equal(await count(missingAdditional),0);
  await assert.rejects(step(id,'VIEW',[],owner,crypto.randomUUID()),/LEGAL_DOCUMENT_NOT_FOUND/);
  await step(id,'VIEW',[],owner,privacy.id);
  await assert.rejects(step(id,'ACCEPT',confirmations(manifest).map((d,i)=>({...d,accepted:i!==1}))),/LEGAL_ACCEPTANCE_REQUIRED/);
  assert.equal(await count(id),0,'Failed full-set acceptance must roll back all inserts');
  const old=confirmations(manifest);await publish('TERMS');
  await assert.rejects(step(id,'ACCEPT',old),/LEGAL_VERSION_CONFLICT/);assert.equal(await count(id),0);
  manifest=await step(id);const accepted=await step(id,'ACCEPT',confirmations(manifest));
  assert.equal(accepted.onboardingStatus,'LEGAL_ACCEPTED');assert.equal(accepted.accepted,true);assert.equal(await count(id),2);
  await step(id,'ACCEPT',confirmations(manifest));assert.equal(await count(id),2,'Double click must not create duplicate evidence');
  assert.equal((await db.query("select count(*)::int as n from public.audit_events where action='legal_document_accepted' and metadata->>'onboardingId'=$1",[id])).rows[0].n,2);
  // Same IDs/identity and exact versions may be reused on upgrade, with no fake
  // new acceptance time and no new evidence. A changed version is not reused.
  await db.query("update public.partner_onboardings set status='ACTIVE' where id=$1",[id]);
  const upgrade=await create({existing:'test-existing',plan:'PREMIUM'});const reuse=await step(upgrade);
  assert.equal(reuse.accepted,true);await step(upgrade,'ACCEPT',confirmations(reuse));assert.equal(await count(upgrade),0);
  await publish('TERMS');const changed=await step(upgrade);assert.equal(changed.accepted,false);
  assert.equal(changed.documents.filter(d=>d.accepted).length,1);await step(upgrade,'ACCEPT',confirmations(changed));assert.equal(await count(upgrade),1);
  assert.equal((await step(upgrade)).onboardingStatus,'LEGAL_ACCEPTED','No SQL legal call may activate a premium partner');
  await assert.rejects(db.query('delete from public.legal_acceptances where onboarding_id=$1',[id]),/LEGAL_ACCEPTANCE_IMMUTABLE/);
  await assert.rejects(db.query('select public.audit_legal_preview($1,$2)',[privacy.id,owner]),/LEGAL_PERMISSION_DENIED/);
  await db.query('select public.audit_legal_preview($1,$2)',[privacy.id,admin]);
  const audit=(await db.query("select metadata from public.audit_events where action in ('legal_document_accepted','legal_document_viewed')")).rows;
  assert.ok(audit.length>=5);assert.ok(audit.every(x=>!JSON.stringify(x).includes('@')&&!JSON.stringify(x).includes('SQL test agent')));
  await db.exec('set role authenticated');
  await assert.rejects(step(upgrade),/permission denied/);await assert.rejects(db.query('select * from public.legal_acceptances'),/permission denied/);
  await db.exec('reset role');
}
