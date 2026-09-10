import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export async function checkSandboxLegal(db){
  await db.exec(readFileSync(new URL('../supabase/migrations/202609100002_scoped_sandbox_legal.sql',import.meta.url),'utf8'));
  const id=crypto.randomUUID();
  const insert=`insert into public.partner_onboardings(id,source,requested_plan,partner_type,equipment_type,prefilled_data,sandbox_only) values($1,'SELF_SERVICE_PREMIUM','PREMIUM','EQUIPMENT_PARTNER','EQUIP_HEIZUNG',$2,true)`;
  await assert.rejects(db.query(insert,[id,JSON.stringify({email:'info@eigenheimverwalter.de'})]),/SANDBOX_ACCOUNT_NOT_ALLOWED/);
  await db.query(insert,[id,JSON.stringify({email:'basic.heizung@ehv.test'})]);
  await assert.rejects(db.query('update public.partner_onboardings set sandbox_only=false where id=$1',[id]),/SANDBOX_SCOPE_IMMUTABLE/);
  const actor=(await db.query("select id from public.portal_users where role='super_admin' limit 1")).rows[0].id;
  const docId=crypto.randomUUID(),existing=(await db.query("select id from public.legal_documents where document_type='TERMS' and status='ACTIVE'")).rows[0]?.id;
  await db.query(`insert into public.legal_documents(id,document_type,title,file_name,storage_path,file_size,sha256,version,acceptance_text,sandbox_onboarding_id)
    values($1,'TERMS','TEST Bedingungen','test.pdf',$2,100,$3,9000,'Nur Testlauf',$4)`,[docId,docId+'/test.pdf','a'.repeat(64),id]);
  await assert.rejects(db.query('update public.legal_documents set sandbox_onboarding_id=null where id=$1',[docId]),/SANDBOX_SCOPE_IMMUTABLE/);
  const approved=(await db.query("select public.change_legal_document('APPROVE',$1,$2,1,'{}') as doc",[docId,actor])).rows[0].doc;
  await db.query("select public.change_legal_document('ACTIVATE',$1,$2,$3,$4)",[docId,actor,approved.revision,JSON.stringify({effective_from:'2020-01-01'})]);
  if(existing)assert.equal((await db.query('select status from public.legal_documents where id=$1',[existing])).rows[0].status,'ACTIVE');
  const def=(await db.query("select pg_get_functiondef('public.partner_legal_step(text,uuid,uuid,jsonb,uuid,inet,text)'::regprocedure) as body")).rows[0].body;
  assert.match(def,/flow.sandbox_only and sandbox_onboarding_id=flow.id/);
  assert.match(def,/not flow.sandbox_only and sandbox_onboarding_id is null/);
  const protection=(await db.query("select pg_get_functiondef('public.protect_legal_acceptance()'::regprocedure) as body")).rows[0].body;
  assert.match(protection,/LEGAL_SCOPE_MISMATCH/);
  console.log(JSON.stringify({sandboxLegalIsolation:true,restrictedHeatingIdentity:true,immutableScope:true,noRemoteWrites:true}));
}
