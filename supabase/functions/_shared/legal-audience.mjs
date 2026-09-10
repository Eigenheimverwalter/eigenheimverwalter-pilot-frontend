export const legalAudiences=Object.freeze({BASIC:'Basic (inkl. Tippgeber)',PREMIUM_EQUIPMENT:'Premium Handwerk',PREMIUM_BROKER:'Premium Makler'});
export const onboardingLegalAudience=flow=>flow.requested_plan==='BASIC'?'BASIC':flow.requested_plan==='PREMIUM'?({EQUIPMENT_PARTNER:'PREMIUM_EQUIPMENT',BROKER_PARTNER:'PREMIUM_BROKER'}[flow.partner_type]||null):null;
export function accountLegalAudience(partner){
  if(!partner)return null;
  if(partner.referralOnly===true)return 'BASIC';
  const plan=String(partner.plan||partner.cooperationLevel||'').toUpperCase();
  if(plan==='BASIC')return 'BASIC';
  if(plan==='PREMIUM')return partner.primaryTradeId==='BROKER'?'PREMIUM_BROKER':partner.primaryTradeId?'PREMIUM_EQUIPMENT':null;
  return null;
}
