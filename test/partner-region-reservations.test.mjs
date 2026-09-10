import test from 'node:test';
import assert from 'node:assert/strict';
import {reservePartnerRegions,assertPartnerRegionsAvailable,releaseUnboundPartnerRegions} from '../supabase/functions/_shared/partner-region-reservations.mjs';
const now=Date.parse('2026-09-10T10:00:00Z');
const flow={id:'flow',status:'LEGAL_ACCEPTED',requested_plan:'PREMIUM',identity_verified:true,partner_type:'EQUIPMENT_PARTNER',equipment_type:'ROOF',prefilled_data:{company:'Test',contact_name:'Test',email:'test@example.invalid',phone:'123',address:'Test 1',postal_code:'22043',city:'Hamburg'}};
const fixture=()=>({postalDirectory:['22043','22045','22047'].map(postalCode=>({postalCode})),partners:[]});
const input={onboarding:flow,legalState:{accepted:true},postalCodes:['22043','22045'],now};
test('two regions reserved without partner/licence activation; retry keeps original expiry',()=>{
  const s=fixture(),result=reservePartnerRegions(s,input);assert.equal(result.length,2);assert.equal(s.partners.length,0);
  assert.deepEqual(reservePartnerRegions(s,{...input,now:now+60000}),result);
  assert.equal(result[0].expires_at,'2026-09-10T10:30:00.000Z');
});
test('legal, identity, Basic and region input gates leave state untouched',()=>{
  for(const patch of [{legalState:{accepted:false}},{onboarding:{...flow,identity_verified:false}},{onboarding:{...flow,requested_plan:'BASIC'}},{postalCodes:['22043']},{postalCodes:['22043','22043']},{postalCodes:['22043','99999']}]){
    const s=fixture(),before=JSON.stringify(s);assert.throws(()=>reservePartnerRegions(s,{...input,...patch}));assert.equal(JSON.stringify(s),before);
  }
});
test('existing multi-trade licences and reservations block matching scope only',()=>{
  const s=fixture();s.partners=[{id:'other',status:'active',primaryTradeId:'ELECTRIC',tradeIds:['ELECTRIC','ROOF'],postalCodes:['22043']}];
  assert.throws(()=>reservePartnerRegions(s,input),{code:'POSTAL_REGION_UNAVAILABLE'});
  s.partners=[];reservePartnerRegions(s,input);
  assert.throws(()=>assertPartnerRegionsAvailable(s,{scope:'ROOF',postalCodes:['22043'],now}),{code:'POSTAL_REGION_UNAVAILABLE'});
  assert.doesNotThrow(()=>assertPartnerRegionsAvailable(s,{scope:'BROKER',postalCodes:['22043'],now}));
});
test('competing snapshot CAS retry detects reservation; no partial second booking',()=>{
  let persisted=fixture(),revision=1;
  const first=structuredClone(persisted),second=structuredClone(persisted);
  reservePartnerRegions(first,input);reservePartnerRegions(second,{...input,onboarding:{...flow,id:'other'}});
  const commit=(state,expected)=>{if(expected!==revision)throw Error('revision_conflict');persisted=state;revision++;};
  commit(first,1);assert.throws(()=>commit(second,1));
  assert.throws(()=>reservePartnerRegions(persisted,{...input,onboarding:{...flow,id:'other'}}),{code:'POSTAL_REGION_UNAVAILABLE'});
  assert.equal(persisted.partnerRegionReservations.length,2);
});
test('unbound release, expiry and checkout reconciliation fail closed',()=>{
  const s=fixture();reservePartnerRegions(s,input);
  assert.throws(()=>reservePartnerRegions(s,{...input,postalCodes:['22043','22047']}),{code:'RESERVATION_CHANGE_REQUIRES_RELEASE'});
  s.partnerRegionReservations[0].checkout_id='cs_test';
  assert.throws(()=>releaseUnboundPartnerRegions(s,'flow',now),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});
  assert.throws(()=>reservePartnerRegions(s,{...input,onboarding:{...flow,checkout_id:'cs_test'},now:now+31*60000}),{code:'CHECKOUT_RECONCILIATION_REQUIRED'});
  delete s.partnerRegionReservations[0].checkout_id;
  assert.equal(releaseUnboundPartnerRegions(s,'flow',now),2);
  assert.equal(releaseUnboundPartnerRegions(s,'flow',now),0);
  reservePartnerRegions(s,{...input,onboarding:{...flow,id:'next'}});
  assert.equal(s.partnerRegionReservations.filter(r=>r.status==='RESERVED').length,2);
});
