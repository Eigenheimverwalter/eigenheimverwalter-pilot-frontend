import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOnboardingInput,missingOnboardingData,requiredLegalState,assertCheckoutAllowed,assertActivationAllowed,basicPropertyAllowance,PartnerRegionRecommendationService,onboardingSources} from '../supabase/functions/_shared/partner-onboarding.mjs';
const data={company:'Dach Test',contact_name:'Test',email:'test@example.invalid',phone:'012345',address:'Teststraße 1',postal_code:'22043',city:'Hamburg'};
const flow={id:'onboard',partner_id:'partner-existing',existing_partner_id:'partner-existing',requested_plan:'PREMIUM',partner_type:'EQUIPMENT_PARTNER',equipment_type:'roof',prefilled_data:data,status:'LEGAL_ACCEPTED',identity_verified:true,checkout_id:'cs_test',price_id:'price_configured'};
const docs=['TERMS','PRIVACY'].map((t,i)=>({id:t,document_type:t,audience:'PREMIUM_EQUIPMENT',version:1,status:'ACTIVE',effective_from:'2026-01-01T00:00:00Z'}));
const acceptances=docs.map(d=>({legal_document_id:d.id,document_version:1,onboarding_id:'onboard',accepted_by_email:data.email,accepted_at:'2026-02-01T00:00:00Z'}));
const legal=()=>requiredLegalState({documents:docs,acceptances,onboarding:flow});
test('all entry sources normalize to one non-activating data contract',()=>{
  for(const source of onboardingSources){const normalized=normalizeOnboardingInput({source,requested_plan:source==='SELF_SERVICE_BASIC'?'BASIC':'PREMIUM',partner_type:'EQUIPMENT_PARTNER',equipment_type:'roof',sales_lead_id:'lead',prefilled_data:{...data,role:'super_admin',status:'ACTIVE'}},[{id:'roof'}]);assert.equal(normalized.prefilled_data.role,undefined);assert.equal(normalized.status,undefined);assert.equal(normalized.source,source);}
  assert.throws(()=>normalizeOnboardingInput({source:'SALES_OS',requested_plan:'BASIC',partner_type:'EQUIPMENT_PARTNER'},[]),/EQUIPMENT_TYPE_REQUIRED/);
  assert.throws(()=>normalizeOnboardingInput({source:'SELF_SERVICE_BASIC',requested_plan:'PREMIUM',partner_type:'REFERRAL'},[]),/ENTRY_PLAN_MISMATCH/);
});
test('required company/contact/address data are independently validated',()=>{assert.deepEqual(missingOnboardingData(data),[]);assert.ok(missingOnboardingData({...data,phone:''}).includes('phone'));assert.ok(missingOnboardingData({...data,postal_code:'2204'}).includes('postal_code'));});
test('missing, future or ambiguous active legal versions fail closed',()=>{
  assert.equal(legal().accepted,true);
  for(const documents of [[],[docs[0]],docs.map(d=>({...d,effective_from:'2999-01-01'})),[...docs,{...docs[0],id:'duplicate'}]])assert.equal(requiredLegalState({documents,acceptances,onboarding:flow}).accepted,false);
});
test('acceptance is tied to actual immutable version and exact identity',()=>{
  assert.equal(requiredLegalState({documents:docs,acceptances:acceptances.map(a=>({...a,document_version:2})),onboarding:flow}).accepted,false);
  assert.equal(requiredLegalState({documents:docs,acceptances,onboarding:{...flow,prefilled_data:{...data,email:'other@example.invalid'}}}).accepted,false);
  assert.equal(requiredLegalState({documents:docs.map(d=>({...d,version:2})),acceptances,onboarding:flow}).accepted,false);
});
test('upgrade reuses only same current versions accepted by same existing partner/email',()=>{
  const previous=acceptances.map(a=>({...a,onboarding_id:'old',partner_id:'partner-existing'}));
  assert.equal(requiredLegalState({documents:docs,acceptances:previous,onboarding:flow}).accepted,true);
  assert.equal(requiredLegalState({documents:docs,acceptances:previous,onboarding:{...flow,existing_partner_id:'other'}}).accepted,false);
  assert.equal(requiredLegalState({documents:docs,acceptances:previous,onboarding:flow,requirements:['PREMIUM_TERMS']}).accepted,false);
});
test('Checkout is blocked before legal acceptance, identity and data completion',()=>{
  assert.equal(assertCheckoutAllowed(flow,legal()),undefined);
  assert.throws(()=>assertCheckoutAllowed(flow,{accepted:false}),e=>e.code==='LEGAL_ACCEPTANCE_REQUIRED'&&e.status===403);
  assert.throws(()=>assertCheckoutAllowed({...flow,identity_verified:false},legal()),/IDENTITY_VERIFICATION_REQUIRED/);
  assert.throws(()=>assertCheckoutAllowed({...flow,requested_plan:'BASIC'},legal()),/CHECKOUT_NOT_REQUIRED/);
});
test('Premium activation needs verified matching payment, both live reservations and ready license',()=>{
  const input={onboarding:flow,legalState:legal(),payment:{verified_webhook:true,status:'PAID',onboarding_id:'onboard',checkout_id:'cs_test',price_id:'price_configured',event_id:'evt_1'},reservations:['22043','22045'].map(postal_code=>({onboarding_id:'onboard',postal_code,scope:'roof',status:'RESERVED',expires_at:'2999-01-01'})),license:{partner_id:'partner-existing',onboarding_id:'onboard',status:'READY'}};
  assert.equal(assertActivationAllowed(input),true);
  for(const payment of [{success_url:true},{...input.payment,verified_webhook:false},{...input.payment,price_id:'price_other'},{...input.payment,checkout_id:'cs_other'}])assert.throws(()=>assertActivationAllowed({...input,payment}),/PAYMENT_CONFIRMATION_REQUIRED/);
  assert.throws(()=>assertActivationAllowed({...input,reservations:input.reservations.slice(0,1)}),/POSTAL_RESERVATION_REQUIRED/);
  assert.throws(()=>assertActivationAllowed({...input,reservations:input.reservations.map(r=>({...r,expires_at:'2020-01-01'}))}),/POSTAL_RESERVATION_REQUIRED/);
  assert.throws(()=>assertActivationAllowed({...input,license:null}),/LICENSE_REQUIRED/);
});
test('Basic activation needs legal consent but no payment or territory',()=>{assert.equal(assertActivationAllowed({onboarding:{...flow,requested_plan:'BASIC'},legalState:legal()}),true);assert.throws(()=>assertActivationAllowed({onboarding:{...flow,requested_plan:'BASIC'},legalState:{accepted:false}}),/LEGAL_ACCEPTANCE_REQUIRED/);});
test('Basic property limit counts unique own confirmed properties and does not delete referrals',()=>{
  const state={assignments:[1,2,3].map(n=>({partnerId:'p',propertyId:'p'+n,status:'active',source:'basic_partner_referral'}))};state.assignments.push({...state.assignments[0],tradeId:'other'});state.equipmentRecords=[1,2,3].map(n=>({propertyId:'p'+n}));const before=JSON.stringify(state);
  assert.equal(basicPropertyAllowance(state,{id:'p',plan:'basic'},'p4').allowed,false);
  assert.equal(basicPropertyAllowance(state,{id:'p',plan:'basic'},'p1').allowed,true);
  assert.equal(basicPropertyAllowance(state,{id:'p',plan:'premium'},'p4').allowed,true);assert.equal(JSON.stringify(state),before);
  assert.equal(basicPropertyAllowance({referralLeads:[1,2,3].map(n=>({partnerId:'p',propertyId:'p'+n,sourceInvitationId:'i'+n,status:'won'}))},{id:'p',plan:'basic'},'p4').allowed,true);
});
test('region recommendations use existing catalog and disclose missing distance data',()=>{
  const result=new PartnerRegionRecommendationService().recommend({directory:[{postalCode:'22043',city:'Hamburg'},{postalCode:'22045',city:'Hamburg'},{postalCode:'22047',city:'Hamburg'}],partner:{id:'p',postalCode:'22043'},occupied:[{postal_code:'22043',scope:'roof',partner_id:'other'}],scope:'roof',ownProperties:[{postalCode:'22047'}]});
  assert.equal(result[0].postalCode,'22047');assert.equal(result[0].distanceKm,null);assert.equal(result.some(r=>r.postalCode==='22043'),false);assert.ok(result.every(r=>r.availability==='SNAPSHOT_REQUIRES_RESERVATION'));
});
