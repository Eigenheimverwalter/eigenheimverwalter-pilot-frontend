import test from 'node:test';
import assert from 'node:assert/strict';
import {cancellationTerms,assertCancellationConfirmation,assertCancellationActor} from '../supabase/functions/_shared/partner-cancellation.mjs';
const at=day=>new Date(day+'T12:00:00Z');
test('Basic: one calendar month then month end, including February',()=>{
 for(const [day,end] of [['2026-09-10','2026-10-31'],['2026-01-31','2026-02-28'],['2028-01-31','2028-02-29'],['2026-12-31','2027-01-31']])assert.equal(cancellationTerms({plan:'basic'},at(day)).effectiveDate,end);
});
test('Premium: deadline inclusive, late notice at next annual end',()=>{
 const p={plan:'premium',license:{contractEnd:'2027-09-10',cancelNoticeMonths:3,autoRenewMonths:12}};
 assert.equal(cancellationTerms(p,at('2027-06-10')).effectiveDate,'2027-09-10');
 assert.equal(cancellationTerms(p,at('2027-06-11')).effectiveDate,'2028-09-10');
 assert.throws(()=>cancellationTerms({plan:'premium'},at('2026-09-10')));
 assert.throws(()=>cancellationTerms({},at('2026-09-10')));
});
test('Berlin day and double confirmation are mandatory',()=>{
 assert.equal(cancellationTerms({plan:'basic'},new Date('2026-09-30T23:00:00Z')).effectiveDate,'2026-11-30');
 const terms={effectiveDate:'2026-10-31'},body={effectiveDate:terms.effectiveDate,confirmPartnership:true,acknowledgeDeletion:true,confirmation:'KÜNDIGEN'};
 assert.doesNotThrow(()=>assertCancellationConfirmation(body,terms));
 for(const changed of [{confirmPartnership:false},{acknowledgeDeletion:false},{confirmation:'ja'},{effectiveDate:'2026-09-30'}])assert.throws(()=>assertCancellationConfirmation({...body,...changed},terms));
});
test('Only own partner roles, never staff or impersonation',()=>{
 for(const role of ['partner_basic','referral_partner','crafts_partner','broker_partner'])assert.doesNotThrow(()=>assertCancellationActor({role,status:'active'},{id:'p'}));
 for(const role of ['super_admin','admin_light','support_staff','customer'])assert.throws(()=>assertCancellationActor({role,status:'active'},{id:'p'}));
 assert.throws(()=>assertCancellationActor({role:'partner_basic',status:'active'},{id:'p'},true));
});
