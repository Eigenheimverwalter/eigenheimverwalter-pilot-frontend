import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_REGISTRATION_CONTRACT,APP_REGISTRATION_INTEGRATION_ENABLED,prepareAppRegistration,applyAppRegistrationReceipt,appRegistrationProgress} from '../lib/referral-app-registration.mjs';
const now='2026-09-09T10:00:00.000Z';
const input=()=>({invitation:{id:'inv-1',partnerId:'partner-1',status:'accepted',acceptedAt:now,referralOnly:true,name:'Kunde Test',email:'KUNDE@example.invalid',address:'Testweg 1',postalCode:'22043',city:'Hamburg',tokenHash:'private-token'},lead:{id:'lead-1',partnerId:'partner-1',sourceInvitationId:'inv-1',customerId:'customer-1',propertyId:'property-1',tradeId:'ROOF'},consent:{requested:true,version:APP_REGISTRATION_CONTRACT},now});
const receipt=intent=>({requestId:intent.requestId,eventId:'evt-1',status:'registered',appUserId:'app-user-1',appPropertyId:'app-property-1',emailVerifiedAt:now,partnerId:'partner-1',referralLinked:true,customerIdentityConfirmed:true});
test('preparation is disabled, deterministic, and never counts as an app registration',()=>{
  assert.equal(APP_REGISTRATION_INTEGRATION_ENABLED,false);const a=prepareAppRegistration(input()),b=prepareAppRegistration(input());
  assert.deepEqual(a,b);assert.equal(a.idempotencyKey,b.idempotencyKey);assert.equal(a.customer.email,'kunde@example.invalid');assert.equal(appRegistrationProgress(a).countAsAppRegistration,false);assert.equal(a.appUserId,null);
});
test('only confirmed referrals with a separate registration request can be prepared',()=>{
  for(const change of [x=>x.invitation.status='pending',x=>x.invitation.acceptedAt=null,x=>x.consent.requested=false,x=>x.consent.version='old',x=>x.invitation.email='bad',x=>x.now='bad']){const x=input();change(x);assert.throws(()=>prepareAppRegistration(x));}
});
test('customer, property and partner attribution are checked and tipsters get no trade',()=>{
  for(const change of [x=>x.lead.partnerId='foreign',x=>x.lead.sourceInvitationId='foreign',x=>x.lead.customerId='',x=>x.lead.propertyId='']){const x=input();change(x);assert.throws(()=>prepareAppRegistration(x));}
  const x=input(),tip=prepareAppRegistration(x);assert.equal(tip.referral.tradeId,null);assert.equal(tip.referral.attributionOnly,true);
  x.invitation.referralOnly=false;assert.equal(prepareAppRegistration(x).referral.tradeId,'ROOF');
});
test('registration payload excludes passwords and referral confirmation secrets',()=>{
  const x=input();x.password='never-copy';x.invitation.password='never-copy';x.lead.access_token='never-copy';
  assert.doesNotMatch(JSON.stringify(prepareAppRegistration(x)),/private-token|never-copy|password|access_token/);
});
test('sent emails and existing-account notices never count as completed registration',()=>{
  for(const status of ['email_verification_pending','existing_account_sign_in_required']){const intent=prepareAppRegistration(input()),next=applyAppRegistrationReceipt(intent,{requestId:intent.requestId,eventId:'evt-1',status},now);assert.equal(next.appUserId,null);assert.equal(appRegistrationProgress(next).appRegistered,false);}
});
test('completion requires correlated app identity, property, verification and original partner',()=>{
  const intent=prepareAppRegistration(input());for(const change of [x=>x.requestId='foreign',x=>x.appUserId='',x=>x.appPropertyId='',x=>x.emailVerifiedAt=null,x=>x.emailVerifiedAt='2099-01-01',x=>x.partnerId='foreign',x=>x.referralLinked=false,x=>x.customerIdentityConfirmed=false]){const r=receipt(intent);change(r);assert.throws(()=>applyAppRegistrationReceipt(intent,r,now));}
  const done=applyAppRegistrationReceipt(intent,receipt(intent),now);assert.equal(appRegistrationProgress(done).appRegistered,true);assert.equal(done.referral.partnerId,'partner-1');assert.equal(done.appUserId,'app-user-1');
});
test('duplicate or delayed app receipts do not duplicate or undo completion',()=>{
  const intent=prepareAppRegistration(input()),r=receipt(intent),done=applyAppRegistrationReceipt(intent,r,now);
  assert.equal(applyAppRegistrationReceipt(done,r,now),done);assert.equal(applyAppRegistrationReceipt(done,{...r,status:'email_verification_pending'},now),done);
  assert.throws(()=>applyAppRegistrationReceipt(done,{...r,appUserId:'another-user'},now));
});
