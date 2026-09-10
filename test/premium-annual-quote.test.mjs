import test from 'node:test';
import assert from 'node:assert/strict';
import {premiumAnnualQuote} from '../supabase/functions/_shared/partner-onboarding.mjs';
import {reservePartnerRegions} from '../supabase/functions/_shared/partner-region-reservations.mjs';
const codes=Array.from({length:11},(_,i)=>String(22000+i));
test('annual prices: two included, eight extras maximum, exclusive 19 percent VAT',()=>{
  const heating=premiumAnnualQuote('EQUIPMENT_PARTNER',codes.slice(0,2));
  assert.equal(heating.netCents,49900);assert.equal(heating.grossCents,59381);
  const brokerBase=premiumAnnualQuote('BROKER_PARTNER',codes.slice(0,2));
  assert.equal(brokerBase.netCents,97900);assert.equal(brokerBase.taxCents,18601);assert.equal(brokerBase.grossCents,116501);
  const brokerExtra=premiumAnnualQuote('BROKER_PARTNER',codes.slice(0,3));
  assert.equal(brokerExtra.netCents,110899);assert.equal(brokerExtra.additionalQuantity,1);assert.equal(brokerExtra.grossCents,131970);
  const broker=premiumAnnualQuote('BROKER_PARTNER',codes.slice(0,10));
  assert.equal(broker.additionalQuantity,8);assert.equal(broker.netCents,201892);assert.equal(broker.grossCents,240251);
});
test('invalid quantity, duplicate, malformed PLZ and referral premium rejected',()=>{
  for(const selection of [codes,codes.slice(0,1),['22000','22000'],['22000',22001],['22000','abcde']])
    assert.throws(()=>premiumAnnualQuote('EQUIPMENT_PARTNER',selection));
  assert.throws(()=>premiumAnnualQuote('REFERRAL',codes.slice(0,2)));
});
test('reservation supports ten total, rejects eleven atomically, retries keep expiry',()=>{
  const state={postalDirectory:codes.map(postalCode=>({postalCode})),partners:[]};
  const onboarding={id:'test-flow',status:'LEGAL_ACCEPTED',requested_plan:'PREMIUM',identity_verified:true,
    partner_type:'EQUIPMENT_PARTNER',equipment_type:'HEATING',prefilled_data:{company:'Test',contact_name:'Test',email:'test@example.invalid',phone:'123',address:'Test 1',postal_code:'22000',city:'Test'}};
  const input={onboarding,legalState:{accepted:true},postalCodes:codes,now:Date.parse('2026-09-10T12:00:00Z')};
  assert.throws(()=>reservePartnerRegions(state,input));assert.equal(state.partnerRegionReservations,undefined);
  input.postalCodes=codes.slice(0,10);
  const result=reservePartnerRegions(state,input);assert.equal(result.length,10);
  assert.deepEqual(reservePartnerRegions(state,{...input,now:input.now+60000}),result);
});
