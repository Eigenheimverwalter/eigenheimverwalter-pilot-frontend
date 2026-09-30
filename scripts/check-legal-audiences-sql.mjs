import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
export async function checkLegalAudiences(db){
 await db.exec(readFileSync(new URL('../supabase/migrations/202609100008_legal_audiences.sql',import.meta.url),'utf8'));
 const admin=(await db.query("select id from public.portal_users where role='super_admin' limit 1")).rows[0].id;
 const docs={};
 for(const audience of ['BASIC','PREMIUM_EQUIPMENT','PREMIUM_BROKER']){docs[audience]=[];for(const type of ['TERMS','PRIVACY','PRICE_SHEET','CONDITIONS']){
  const id=crypto.randomUUID(),payload={audience,document_type:type,title:audience+' '+type,file_name:'test.pdf',storage_path:id+'/test.pdf',file_size:40,sha256:'c'.repeat(64),acceptance_text:'Test consent'};
  let d=(await db.query("select public.change_legal_document('UPLOAD',$1,$2,null,$3) as d",[id,admin,JSON.stringify(payload)])).rows[0].d;
  d=(await db.query("select public.change_legal_document('APPROVE',$1,$2,$3,'{}') as d",[id,admin,d.revision])).rows[0].d;
  await db.query("select public.change_legal_document('ACTIVATE',$1,$2,$3,'{\"effective_from\":\"2020-01-01\"}')",[id,admin,d.revision]);docs[audience].push({id,version:d.version,accepted:true});
 }}
 assert.equal((await db.query("select count(*)::int n from public.legal_documents where status='ACTIVE' and audience<>'LEGACY'")).rows[0].n,12);
 await assert.rejects(db.query("update public.legal_documents set audience='BASIC' where id=$1",[docs.PREMIUM_BROKER[0].id]),/LEGAL_AUDIENCE_IMMUTABLE/);
 const actor=crypto.randomUUID(),flow=crypto.randomUUID();await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'audience@example.invalid',now())",[actor]);await db.query("insert into public.portal_users(id,role,status) values($1,'partner_basic','active')",[actor]);
 const prefill={company:'Test',contact_name:'Test',email:'audience@example.invalid',phone:'000',address:'Test 1',postal_code:'22043',city:'Test'};
 await db.query("insert into public.partner_onboardings(id,source,requested_plan,partner_type,auth_user_id,identity_verified,expires_at,status,prefilled_data) values($1,'SELF_SERVICE_BASIC','BASIC','REFERRAL',$2,true,now()+interval '7 days','DATA_COMPLETE',$3)",[flow,actor,JSON.stringify(prefill)]);
 const read=async()=> (await db.query("select public.partner_legal_step('READ',$1,$2) d",[flow,actor])).rows[0].d;
 assert.deepEqual((await read()).documents.map(d=>d.id).sort(),docs.BASIC.map(d=>d.id).sort());
 await assert.rejects(db.query("select public.partner_legal_step('VIEW',$1,$2,'[]',$3)",[flow,actor,docs.PREMIUM_BROKER[0].id]),/LEGAL_DOCUMENT_NOT_FOUND/);
 await assert.rejects(db.query("select public.partner_legal_step('ACCEPT',$1,$2,$3)",[flow,actor,JSON.stringify(docs.PREMIUM_BROKER)]),/LEGAL_VERSION_CONFLICT/);
 await db.query("select public.partner_legal_step('ACCEPT',$1,$2,$3)",[flow,actor,JSON.stringify(docs.BASIC)]);
 assert.equal((await read()).accepted,true);
 await db.query("update public.partner_onboardings set requested_plan='PREMIUM',partner_type='BROKER_PARTNER' where id=$1",[flow]);
 assert.deepEqual((await read()).documents.map(d=>d.id).sort(),docs.PREMIUM_BROKER.map(d=>d.id).sort());assert.equal((await read()).accepted,false);
 assert.equal((await db.query('select count(*)::int n from public.legal_acceptances where onboarding_id=$1',[flow])).rows[0].n,4);
 await db.query("update public.portal_runtime_state set payload=jsonb_set(payload,'{partners}',(payload->'partners')||$1::jsonb) where id='primary'",[JSON.stringify([{id:'audience-type-test',referralOnly:true,primaryTradeId:'BROKER'}])]);
 await db.query("update public.partner_onboardings set existing_partner_id='audience-type-test' where id=$1",[flow]);
 await assert.rejects(read(),/LEGAL_AUDIENCE_MISMATCH/);
 console.log(JSON.stringify({legalAudienceSql:true,threeIndependentAudiences:true,fourDocumentTypes:true,foreignViewDenied:true,foreignAcceptanceDenied:true,upgradeRequiresNewDocuments:true,oldEvidencePreserved:true}));
}
