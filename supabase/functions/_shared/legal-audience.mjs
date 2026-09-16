export const legalAudiences=Object.freeze({BASIC:'Basic Partner',BASIC_REFERRAL:'Basic-Tippgeber',PREMIUM_EQUIPMENT:'Premium Handwerk',PREMIUM_BROKER:'Premium Makler'});
export const onboardingLegalAudience=flow=>flow.requested_plan==='BASIC'?(flow.partner_type==='REFERRAL'?'BASIC_REFERRAL':'BASIC'):flow.requested_plan==='PREMIUM'?({EQUIPMENT_PARTNER:'PREMIUM_EQUIPMENT',BROKER_PARTNER:'PREMIUM_BROKER'}[flow.partner_type]||null):null;
export function accountLegalAudience(partner){
  if(!partner)return null;
  if(partner.referralOnly===true)return 'BASIC_REFERRAL';
  const plan=String(partner.plan||partner.cooperationLevel||'').toUpperCase();
  if(plan==='BASIC')return 'BASIC';
  const markers=[partner.primaryTradeId,partner.partnerCategory,partner.type,partner.role].map(value=>String(value||'').toUpperCase());
  const isBroker=markers.some(value=>value==='BROKER'||value==='BROKER_PARTNER'||value==='MAKLER'||value.includes('IMMOBILIEN'));
  if((plan==='PREMIUM'||!plan)&&isBroker)return 'PREMIUM_BROKER';
  if((plan==='PREMIUM'||!plan)&&markers.some(Boolean))return 'PREMIUM_EQUIPMENT';
  return null;
}
