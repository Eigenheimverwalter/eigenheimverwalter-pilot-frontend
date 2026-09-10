import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
export async function checkCommonLegal(db){
 await db.exec(readFileSync(new URL('../supabase/migrations/202609100009_common_legal_documents.sql',import.meta.url),'utf8'));
 const admin=(await db.query("select id from public.portal_users where role='super_admin' limit 1")).rows[0].id;
 const evidence=(await db.query('select count(*)::int n from public.legal_acceptances')).rows[0].n;
 // Reproduce a counter behind imported/test document versions.
 await db.query("update public.legal_document_versions set last_version=1 where document_type='TERMS'");
 const max=(await db.query("select max(version)::int n from public.legal_documents where document_type='TERMS'")).rows[0].n;
 const common=[];
 for(const type of ['TERMS','PRIVACY','CONDITIONS']){
  const id=crypto.randomUUID(),p={document_type:type,title:'Common '+type,file_name:'test.pdf',storage_path:id+'/test.pdf',file_size:40,sha256:'d'.repeat(64),acceptance_text:'Test consent'};
  let d=(await db.query("select public.change_legal_document('UPLOAD',$1,$2,null,$3) d",[id,admin,JSON.stringify(p)])).rows[0].d;
  assert.equal(d.audience,'COMMON');if(type==='TERMS')assert.equal(d.version,max+1);
  d=(await db.query("select public.change_legal_document('APPROVE',$1,$2,$3,'{}') d",[id,admin,d.revision])).rows[0].d;
  await db.query("select public.change_legal_document('ACTIVATE',$1,$2,$3,'{\"effective_from\":\"2020-01-01\"}')",[id,admin,d.revision]);common.push(id);
 }
 const f=(await db.query("select id,auth_user_id from public.partner_onboardings where prefilled_data->>'email'='audience@example.invalid'")).rows[0];
 await db.query('update public.partner_onboardings set existing_partner_id=null where id=$1',[f.id]);
 for(const [plan,kind,audience] of [['BASIC','REFERRAL','BASIC'],['PREMIUM','EQUIPMENT_PARTNER','PREMIUM_EQUIPMENT'],['PREMIUM','BROKER_PARTNER','PREMIUM_BROKER']]){
  await db.query("update public.partner_onboardings set requested_plan=$2,partner_type=$3,equipment_type=case when $3='EQUIPMENT_PARTNER' then 'EQUIP_HEIZUNG' else null end where id=$1",[f.id,plan,kind]);
  const r=(await db.query("select public.partner_legal_step('READ',$1,$2) d",[f.id,f.auth_user_id])).rows[0].d;
  assert.equal(r.documents.length,4);assert.deepEqual(r.documents.filter(d=>d.documentType!=='PRICE_SHEET').map(d=>d.id).sort(),common.sort());
  const price=r.documents.find(d=>d.documentType==='PRICE_SHEET');assert.equal((await db.query('select audience from public.legal_documents where id=$1',[price.id])).rows[0].audience,audience);
 }
 assert.equal((await db.query('select count(*)::int n from public.legal_acceptances')).rows[0].n,evidence);
 console.log(JSON.stringify({commonLegalSql:true,uploadCounterReconciled:true,priceOnlyAudience:true,evidencePreserved:true}));
}
