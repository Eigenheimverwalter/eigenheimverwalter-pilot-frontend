import {assertCheckoutAllowed, INCLUDED_POSTAL_CODES, onboardingError} from './partner-onboarding.mjs';

const rows=value=>Array.isArray(value)?value:[];
const fail=(code,status=409)=>{
  const error=onboardingError(code,status);
  error.message=({INVALID_POSTAL_CODES:'Bitte gültige Postleitzahlen auswählen.',POSTAL_CODE_NOT_IN_CATALOG:'Die Postleitzahl fehlt im hinterlegten Katalog.',POSTAL_REGION_UNAVAILABLE:'Mindestens eine Region ist für dieses Gewerk bereits vergeben oder reserviert.',TWO_POSTAL_CODES_REQUIRED:'Bitte genau zwei unterschiedliche Postleitzahlen auswählen.',REGIONS_ALREADY_ACTIVE:'Diese Regionen sind bereits aktiviert.',RESERVATION_CHANGE_REQUIRES_RELEASE:'Bitte die bestehende Reservierung zuerst sicher aufheben.',CHECKOUT_RECONCILIATION_REQUIRED:'Der Zahlungsstatus muss vor einer Änderung der Reservierung geprüft werden.'})[code]||code;
  throw error;
};
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const scopeOf=flow=>flow.partner_type==='BROKER_PARTNER'?'BROKER':flow.equipment_type;
const held=(r,now)=>r.status==='ACTIVE'||(r.status==='RESERVED'&&Date.parse(r.expires_at)>now);

// All callers persist this SAME runtime snapshot with replaceRuntime/CAS.
// A conflict requires reloading and re-running validation, never blind overwrite.
export function assertPartnerRegionsAvailable(state,{scope,postalCodes,partnerId=null,onboardingId=null,now=Date.now()}){
  if(!scope||!Array.isArray(postalCodes)||!postalCodes.length||postalCodes.some(c=>typeof c!=='string'||!/^\d{5}$/.test(c)))fail('INVALID_POSTAL_CODES',422);
  if(postalCodes.some(code=>!rows(state.postalDirectory).some(r=>r.postalCode===code)))fail('POSTAL_CODE_NOT_IN_CATALOG',422);
  const occupied=postalCodes.some(code=>rows(state.partners).some(p=>p.id!==partnerId&&p.status==='active'
    &&(p.primaryTradeId===scope||rows(p.tradeIds).includes(scope))&&rows(p.postalCodes).includes(code))
    ||rows(state.partnerRegionReservations).some(r=>r.onboarding_id!==onboardingId&&r.scope===scope&&r.postal_code===code&&held(r,now)));
  if(occupied)fail('POSTAL_REGION_UNAVAILABLE');
}

// Internal checkout preparation only: flow/legal/identity are loaded by the
// trusted onboarding adapter, never taken from a browser body. No activation.
export function reservePartnerRegions(state,{onboarding,legalState,postalCodes,now=Date.now()}){
  assertCheckoutAllowed(onboarding,legalState);
  if(!onboarding.id||!Number.isFinite(now)||!Array.isArray(postalCodes)||postalCodes.length!==INCLUDED_POSTAL_CODES
    ||new Set(postalCodes).size!==INCLUDED_POSTAL_CODES)fail('TWO_POSTAL_CODES_REQUIRED',422);
  const scope=scopeOf(onboarding);
  const codes=[...postalCodes].sort();
  const existing=rows(state.partnerRegionReservations).filter(r=>r.onboarding_id===onboarding.id&&held(r,now));
  if(existing.some(r=>r.status==='ACTIVE'))fail('REGIONS_ALREADY_ACTIVE');
  assertPartnerRegionsAvailable(state,{scope,postalCodes:codes,partnerId:onboarding.existing_partner_id||null,onboardingId:onboarding.id,now});
  if(existing.length){
    if(existing.length!==INCLUDED_POSTAL_CODES||existing.some(r=>r.scope!==scope)||!same(existing.map(r=>r.postal_code).sort(),codes))fail('RESERVATION_CHANGE_REQUIRES_RELEASE');
    return existing; // retries must not silently extend the expiry
  }
  if(onboarding.checkout_id)fail('CHECKOUT_RECONCILIATION_REQUIRED');
  const reservations=codes.map(postal_code=>({onboarding_id:onboarding.id,scope,postal_code,status:'RESERVED',
    created_at:new Date(now).toISOString(),expires_at:new Date(now+30*60*1000).toISOString()}));
  state.partnerRegionReservations=[...rows(state.partnerRegionReservations).map(r=>r.status==='RESERVED'&&!held(r,now)?{...r,status:'EXPIRED'}:r),...reservations];
  return reservations;
}

// Never release on a browser cancel redirect: an attached checkout might still
// be payable. The future Stripe adapter must reconcile/expire it first.
export function releaseUnboundPartnerRegions(state,onboardingId,now=Date.now()){
  const selected=rows(state.partnerRegionReservations).filter(r=>r.onboarding_id===onboardingId&&r.status==='RESERVED');
  if(selected.some(r=>r.checkout_id))fail('CHECKOUT_RECONCILIATION_REQUIRED');
  for(const r of selected){r.status='RELEASED';r.released_at=new Date(now).toISOString();}
  return selected.length;
}
