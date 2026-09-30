// An isolated database only: no network, real accounts, invitations or emails.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href),db=new PGlite();
try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid,email text);
    create table public.identity_imports(email text);create table public.partners(email text);
    create table public.legacy_portal_records(collection text,source_id text,payload jsonb);
    create table public.portal_runtime_state(id text primary key,payload jsonb,updated_at timestamptz default now());
    create table public.audit_events(actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
    insert into public.portal_runtime_state(id,payload) values('primary','{}');`);
  for(const file of ['202609040001_runtime_atomic.sql','202609090004_customer_invitation_dedup.sql'])
    await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const known=async(email=' TEST@example.invalid ',skip=null)=>(await db.query('select public.customer_email_known($1,$2) as known',[email,skip])).rows[0].known;
  const state=async value=>db.query('update public.portal_runtime_state set payload=$1',[JSON.stringify(value)]);
  assert.equal(await known(),false);
  for(const collection of ['users','customers','partners','partnerReferralInvitations','customerInvitations','referralLeads']){
    await state({[collection]:[{id:'old',email:'test@EXAMPLE.invalid',partnerId:'other',status:'expired'}]});
    assert.equal(await known(),true,collection);
    if(collection.endsWith('Invitations'))assert.equal(await known(undefined,'old'),false);
  }
  for(const collection of ['users','customers']){
    await state({productionMirror:{tables:{[collection]:[{email:'test@example.invalid'}]}}});assert.equal(await known(),true);
  }
  await state({});
  for(const table of ['auth.users','public.identity_imports','public.partners']){
    await db.query(`insert into ${table}(email) values(' TEST@example.invalid ')`);assert.equal(await known(),true);
    await db.exec(`delete from ${table}`);
  }
  await db.query("insert into public.legacy_portal_records values('customers','old',$1)",[JSON.stringify({email:'test@example.invalid'})]);assert.equal(await known(),true);
  await db.exec('delete from public.legacy_portal_records');
  const commit=async(revision,email,id='invite',action='customer.invitation.created',collection='customerInvitations')=>db.query(
    'select * from public.replace_portal_runtime_with_customer_invitation($1,$2,null,$3,$4,$5,$6,$7)',
    [revision,JSON.stringify({[collection]:[{id,email}]}),action,'customer_invitation',id,'{}',email]);
  assert.equal((await commit(1,'test@example.invalid')).rows[0].revision,2);
  await assert.rejects(commit(2,' TEST@EXAMPLE.invalid ','other'),/CUSTOMER_EMAIL_ALREADY_KNOWN/);
  await assert.rejects(commit(1,'new@example.invalid'),/runtime_revision_conflict/);
  assert.equal((await db.query('select count(*)::int n from public.audit_events')).rows[0].n,1);
  for(const [action,collection] of [['referral.invitation.created','partnerReferralInvitations'],['referral.lead.created','referralLeads']]){
    await state({});const rev=(await db.query('select revision from public.portal_runtime_state')).rows[0].revision;
    await commit(rev,'test@example.invalid','invite',action,collection);
    await assert.rejects(commit(rev+1,'test@example.invalid','duplicate',action,collection),/CUSTOMER_EMAIL_ALREADY_KNOWN/);
  }
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);await assert.rejects(known(),/permission denied/);await db.exec('reset role');
  }
  console.log(JSON.stringify({isolatedPostgres:true,emailNormalization:true,allDirectories:true,atomicDuplicateGuard:true,auditExactlyOnce:true,privateRPC:true,productionWrites:false}));
}finally{await db.close()}
