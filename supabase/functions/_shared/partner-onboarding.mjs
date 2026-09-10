// Shared domain rules. Transport/identity/storage adapters must call these rules;
import {onboardingLegalAudience} from './legal-audience.mjs';
// never infer activation from a Sales WON, email verification or success URL.
export const BASIC_PROPERTY_LIMIT = 3;
export const INCLUDED_POSTAL_CODES = 2;
export const MAX_POSTAL_CODES = 10;
export function premiumAnnualQuote(partnerType, postalCodes) {
  const base = {EQUIPMENT_PARTNER:49900, BROKER_PARTNER:97900}[partnerType];
  if (!base) throw onboardingError('PREMIUM_PARTNER_TYPE_REQUIRED');
  if (!Array.isArray(postalCodes) || postalCodes.length < INCLUDED_POSTAL_CODES || postalCodes.length > MAX_POSTAL_CODES
    || new Set(postalCodes).size !== postalCodes.length || postalCodes.some(code => typeof code !== 'string' || !/^\d{5}$/.test(code))) {
    throw onboardingError('POSTAL_CODE_SELECTION_INVALID');
  }
  const additionalQuantity = postalCodes.length - INCLUDED_POSTAL_CODES;
  const net = base + additionalQuantity * 12999;
  const tax = Math.round(net * 19 / 100);
  // Quote only: availability, legal acceptance and verified payment remain mandatory.
  return {currency:'EUR', interval:'year', includedPostalCodes:INCLUDED_POSTAL_CODES,
    totalPostalCodes:postalCodes.length, additionalQuantity, baseNetCents:base,
    additionalUnitNetCents:12999, netCents:net, taxPercent:19, taxCents:tax, grossCents:net+tax};
}
export const onboardingSources = Object.freeze(['SELF_SERVICE_BASIC','SELF_SERVICE_PREMIUM','SALES_OS','ADMIN_INVITE','CRM_IMPORT']);
export const onboardingStatuses = Object.freeze(['CREATED','INVITED','STARTED','DATA_INCOMPLETE','DATA_COMPLETE','LEGAL_PENDING','LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED','READY_FOR_ACTIVATION','ACTIVE','CANCELLED','EXPIRED']);
export const partnerTypes = Object.freeze(['EQUIPMENT_PARTNER','BROKER_PARTNER','REFERRAL']);
export const onboardingError = (code,status=422) => Object.assign(new Error(code),{code,status});
const demand=(condition,code,status=422)=>{if(!condition)throw onboardingError(code,status)};
const text=(value,max)=>String(value??'').normalize('NFKC').trim().slice(0,max);
export function normalizeOnboardingInput(input,trades){
  demand(onboardingSources.includes(input.source),'INVALID_ENTRY_SOURCE');
  demand(['BASIC','PREMIUM'].includes(input.requested_plan),'COOPERATION_LEVEL_REQUIRED');
  demand(partnerTypes.includes(input.partner_type),'PARTNER_TYPE_REQUIRED');
  demand(!(input.source==='SELF_SERVICE_BASIC'&&input.requested_plan!=='BASIC')&&!(input.source==='SELF_SERVICE_PREMIUM'&&input.requested_plan!=='PREMIUM'),'ENTRY_PLAN_MISMATCH');
  demand(!(input.partner_type==='REFERRAL'&&input.requested_plan==='PREMIUM'),'REFERRAL_PREMIUM_NOT_AVAILABLE');
  const equipment=input.partner_type==='EQUIPMENT_PARTNER'?text(input.equipment_type,100):null;
  if(equipment!==null)demand(trades.some(t=>t.id===equipment&&t.onboarding!==false&&t.tier!=='legacy'&&!['BROKER','broker','whitelabel'].includes(t.id)),'EQUIPMENT_TYPE_REQUIRED');
  if(input.source==='SALES_OS')demand(text(input.sales_lead_id,160),'SALES_LEAD_REQUIRED');
  const data=input.prefilled_data||{},prefilled_data={};
  for(const [key,max] of Object.entries({company:180,contact_name:120,email:254,phone:50,address:180,postal_code:5,city:100}))prefilled_data[key]=text(data[key],max);
  prefilled_data.email=prefilled_data.email.toLowerCase();
  return{source:input.source,requested_plan:input.requested_plan,partner_type:input.partner_type,equipment_type:equipment,
    existing_partner_id:input.existing_partner_id?text(input.existing_partner_id,160):null,
    sales_lead_id:input.sales_lead_id?text(input.sales_lead_id,160):null,invite_id:input.invite_id?text(input.invite_id,160):null,prefilled_data};
}
export function missingOnboardingData(data){
  const missing=['company','contact_name','email','phone','address','postal_code','city'].filter(k=>!text(data?.[k],254));
  if(data?.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))missing.push('email');
  if(data?.postal_code&&!/^\d{5}$/.test(data.postal_code))missing.push('postal_code');
  return [...new Set(missing)];
}
export function requiredLegalState({documents,acceptances,onboarding,requirements=['TERMS','PRIVACY'],now=new Date().toISOString()}){
  const audience=onboardingLegalAudience(onboarding);
  documents=documents.filter(d=>d.audience===audience||(onboarding.sandbox_only===true&&(d.audience||'LEGACY')==='LEGACY'));
  const commercial=documents.filter(d=>['PRICE_SHEET','CONDITIONS'].includes(d.document_type)&&d.status==='ACTIVE'&&!d.deletion_requested_at&&d.effective_from&&Date.parse(d.effective_from)<=Date.parse(now)&&(onboarding.sandbox_only===true?d.sandbox_onboarding_id===onboarding.id:!d.sandbox_onboarding_id)).map(d=>d.document_type);
  const selected=[],missingTypes=[];
  for(const type of [...new Set(['TERMS','PRIVACY',...requirements,...commercial])]){
    const active=documents.filter(d=>d.document_type===type&&d.status==='ACTIVE'&&!d.deletion_requested_at&&d.effective_from&&Date.parse(d.effective_from)<=Date.parse(now)
      &&(onboarding.sandbox_only===true?d.sandbox_onboarding_id===onboarding.id:!d.sandbox_onboarding_id));
    // Fail closed for both missing and ambiguous active versions.
    if(active.length!==1){missingTypes.push(type);continue;}selected.push(active[0]);
  }
  const accepted=doc=>acceptances.some(a=>a.legal_document_id===doc.id&&a.document_version===doc.version&&
    a.accepted_by_email===onboarding.prefilled_data.email&&Boolean(a.accepted_at)&&
    (a.onboarding_id===onboarding.id||Boolean(onboarding.existing_partner_id&&a.partner_id===onboarding.existing_partner_id)));
  const pending=selected.filter(doc=>!accepted(doc));
  return{documents:selected,pending,missingTypes,accepted:!missingTypes.length&&!pending.length};
}
export function assertCheckoutAllowed(onboarding,legalState){
  demand(!['ACTIVE','CANCELLED','EXPIRED'].includes(onboarding.status),'ONBOARDING_NOT_OPEN',409);
  demand(!missingOnboardingData(onboarding.prefilled_data).length,'DATA_INCOMPLETE');
  demand(onboarding.identity_verified===true,'IDENTITY_VERIFICATION_REQUIRED',403);
  demand(legalState.accepted,'LEGAL_ACCEPTANCE_REQUIRED',403);
  demand(onboarding.requested_plan==='PREMIUM','CHECKOUT_NOT_REQUIRED',409);
}
export function assertActivationAllowed({onboarding,legalState,payment,reservations,license,now=new Date().toISOString()}){
  demand(!['CANCELLED','EXPIRED'].includes(onboarding.status),'ONBOARDING_NOT_OPEN',409);
  demand(!missingOnboardingData(onboarding.prefilled_data).length,'DATA_INCOMPLETE');
  demand(onboarding.identity_verified===true,'IDENTITY_VERIFICATION_REQUIRED',403);
  demand(legalState.accepted,'LEGAL_ACCEPTANCE_REQUIRED',403);
  demand(['BASIC','PREMIUM'].includes(onboarding.requested_plan),'COOPERATION_LEVEL_REQUIRED');
  if(onboarding.requested_plan==='PREMIUM'){
    demand(payment?.verified_webhook===true&&payment.status==='PAID'&&payment.onboarding_id===onboarding.id&&payment.checkout_id===onboarding.checkout_id&&payment.price_id===onboarding.price_id&&Boolean(payment.event_id),'PAYMENT_CONFIRMATION_REQUIRED',403);
    const scope=onboarding.partner_type==='BROKER_PARTNER'?'BROKER':onboarding.equipment_type;
    demand(Boolean(scope),'PREMIUM_REGION_SCOPE_REQUIRED');
    const held=(reservations||[]).filter(r=>r.onboarding_id===onboarding.id&&r.scope===scope&&/^\d{5}$/.test(r.postal_code)&&((r.status==='RESERVED'&&Date.parse(r.expires_at)>Date.parse(now))||r.status==='ACTIVE'));
    const selected=onboarding.postal_codes;
    if(selected){
      premiumAnnualQuote(onboarding.partner_type,selected);
      demand(payment.additional_quantity===selected.length-INCLUDED_POSTAL_CODES,'PAYMENT_CONFIRMATION_REQUIRED',403);
      demand(held.length===selected.length&&selected.every(code=>held.some(r=>r.postal_code===code)),'POSTAL_RESERVATION_REQUIRED',409);
    }else demand(new Set(held.map(r=>r.postal_code)).size===INCLUDED_POSTAL_CODES,'POSTAL_RESERVATION_REQUIRED',409);
    demand(license?.partner_id===onboarding.partner_id&&license?.onboarding_id===onboarding.id&&license?.status==='READY','LICENSE_REQUIRED',409);
  }
  return true;
}
export function basicPropertyAllowance(state,partner,propertyId){
  if(partner.referralOnly===true||partner.role==='referral_partner'||partner.partner_type==='REFERRAL')return{allowed:true,confirmedProperties:0,limit:null};
  const assignments=Array.isArray(state.assignments)?state.assignments:[];
  const accessible=new Set(assignments.filter(a=>a.partnerId===partner.id&&a.status==='active').map(a=>a.propertyId));
  // Recommendations and customer acceptance do not consume capacity. A created
  // trade file does, including drafts; repeated work on that file stays allowed.
  const owned=new Set((partner.primaryTradeId==='BROKER'?(state.salesFiles||[]).filter(f=>f.partnerId===partner.id):(state.equipmentRecords||[]).filter(e=>e.tradeId===partner.primaryTradeId)).filter(e=>accessible.has(e.propertyId)&&e.status!=='deleted').map(e=>e.propertyId));
  return{allowed:partner.plan==='premium'||owned.has(propertyId)||owned.size<BASIC_PROPERTY_LIMIT,confirmedProperties:owned.size,limit:partner.plan==='premium'?null:BASIC_PROPERTY_LIMIT};
}
export class PartnerRegionRecommendationService {
  // Works with the existing catalog only. No invented coordinates/availability.
  recommend({directory,partner,ownProperties=[],occupied=[],scope,limit=6}){
    const blocked=new Set(occupied.filter(r=>r.scope===scope&&r.partner_id!==partner.id).map(r=>r.postal_code));
    const counts=new Map();for(const p of ownProperties)counts.set(p.postalCode,(counts.get(p.postalCode)||0)+1);
    const distance=row=>{const a=Number(partner.latitude),b=Number(partner.longitude),c=Number(row.latitude),d=Number(row.longitude);if([partner.latitude,partner.longitude,row.latitude,row.longitude].some(x=>x==null)||![a,b,c,d].every(Number.isFinite))return null;const rad=x=>x*Math.PI/180;const h=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));};
    const unique=new Map(directory.filter(r=>/^\d{5}$/.test(r.postalCode)&&!blocked.has(r.postalCode)).map(r=>[r.postalCode,r]));
    return [...unique.values()].map(r=>({postalCode:r.postalCode,city:r.city,ownCustomers:counts.get(r.postalCode)||0,businessAddress:r.postalCode===partner.postalCode,distanceKm:distance(r),availability:'SNAPSHOT_REQUIRES_RESERVATION'})).sort((a,b)=>Number(b.businessAddress)-Number(a.businessAddress)||b.ownCustomers-a.ownCustomers||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||a.postalCode.localeCompare(b.postalCode)).slice(0,Math.max(1,Math.min(50,limit)));
  }
}
