import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export async function checkPartnerCancellation(db){
 await db.exec('alter table public.identity_imports add column if not exists active boolean default true');
 await db.exec(readFileSync(new URL('../supabase/migrations/202609100005_partner_cancellation.sql',import.meta.url),'utf8'));
 const actor=crypto.randomUUID(),admin=(await db.query("select id from public.portal_users where role='super_admin' limit 1")).rows[0].id;
 await db.query("insert into public.portal_users(id,role,status) values($1,'partner_basic','active')",[actor]);
 await db.query("insert into public.identity_imports(source_user_id,auth_user_id,email) values('cancel-fixture',$1,'cancel@example.invalid')",[actor]);
 const state={partners:[{id:'cancel-partner',userId:'cancel-fixture',plan:'basic'},{id:'untouched',userId:'other',plan:'premium'}],properties:[{id:'owner-property',customerId:'owner'}]};
 await db.query("update public.portal_runtime_state set payload=$1 where id='primary'",[JSON.stringify(state)]);
 const rev=(await db.query("select revision from public.portal_runtime_state where id='primary'")).rows[0].revision;
 const request=(id=actor,revision=rev)=>db.query("select to_jsonb(public.request_partner_cancellation($1,$2,'cancel-partner',current_date+40,'basic','test notice')) as r",[id,revision]);
 await assert.rejects(request(admin),/CANCELLATION_FORBIDDEN/);
 await assert.rejects(request(actor,99999),/CANCELLATION_CHANGED/);
 const first=(await request()).rows[0].r,again=(await request()).rows[0].r;assert.equal(first.id,again.id);
 assert.equal((await db.query('select count(*)::int as n from public.partner_cancellations')).rows[0].n,1);
 assert.equal((await db.query('select public.end_due_partner_cancellations() as n')).rows[0].n,0);
 await db.query('update public.partner_cancellations set effective_date=current_date-1 where id=$1',[first.id]);
 assert.equal((await db.query('select public.end_due_partner_cancellations() as n')).rows[0].n,1);
 assert.equal((await db.query('select public.end_due_partner_cancellations() as n')).rows[0].n,0);
 const after=(await db.query("select payload from public.portal_runtime_state where id='primary'")).rows[0].payload;
 assert.deepEqual(after.properties,state.properties);assert.deepEqual(after.partners[1],state.partners[1]);
 assert.equal((await db.query('select status from public.portal_users where id=$1',[actor])).rows[0].status,'disabled');
 assert.equal((await db.query('select status from public.portal_users where id=$1',[admin])).rows[0].status,'active');
 assert.equal((await db.query('select deletion_status from public.partner_cancellations where id=$1',[first.id])).rows[0].deletion_status,'RETENTION_REVIEW_REQUIRED');
 console.log(JSON.stringify({cancellationSql:true,idempotent:true,ownerIsolation:true,contractEndOnly:true,ownerRecordsPreserved:true,adminPreserved:true}));
}
