import { canonicalPartnerType, isEquipmentType } from './equipment-registry.mjs';

export const PARTNER_LIFECYCLES=Object.freeze(['configuration_incomplete','invited','active','paused','suspended','contract_ended','archived']);
const present=value=>String(value??'').trim().length>0;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));

export function partnerConfigurationIssues(partner){
  const primary=canonicalPartnerType(partner?.primaryTradeId),issues=[];
  if(!present(partner?.company))issues.push('company');
  if(!present(partner?.contact))issues.push('contact');
  if(!/^\S+@\S+\.\S+$/.test(String(partner?.email||'')))issues.push('email');
  if(!present(partner?.phone))issues.push('phone');
  if(!isEquipmentType(primary))issues.push('primary_equipment');
  if((partner?.tradeIds||[]).map(canonicalPartnerType).filter(isEquipmentType).length!==1)issues.push('exactly_one_equipment');
  if(!validDate(partner?.license?.cooperationStart))issues.push('cooperation_start');
  if(!(partner?.postalCodes||[]).some(code=>/^\d{5}$/.test(String(code))))issues.push('postal_codes');
  return [...new Set(issues)];
}

export function partnerRoutingEligibility(partner,{postalCode,tradeId,now=new Date()}={}){
  const issues=partnerConfigurationIssues(partner),lifecycle=partner?.lifecycle||partner?.status;
  if(partner?.status!=='active'||lifecycle!=='active')issues.push('not_active');
  if(partner?.license?.contractEnd&&new Date(`${partner.license.contractEnd}T23:59:59Z`)<now)issues.push('contract_ended');
  if(canonicalPartnerType(partner?.primaryTradeId)!==canonicalPartnerType(tradeId))issues.push('equipment_mismatch');
  if(postalCode&&!(partner?.postalCodes||[]).includes(String(postalCode)))issues.push('outside_licensed_region');
  return {eligible:issues.length===0,issues:[...new Set(issues)]};
}

export function selectRoutingPartner(partners,criteria){
  return partners.map(partner=>({partner,check:partnerRoutingEligibility(partner,criteria)})).filter(row=>row.check.eligible)
    .sort((a,b)=>Number(a.partner.routingPriority??100)-Number(b.partner.routingPriority??100)||String(a.partner.id).localeCompare(String(b.partner.id)))[0]?.partner||null;
}
