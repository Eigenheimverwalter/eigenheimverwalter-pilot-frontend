import {basicPropertyAllowance} from './partner-onboarding.mjs';

// The existing public acceptance route owns token/origin/expiry verification.
// This is its single mutation implementation. The caller persists the complete
// snapshot using the existing revision-checked transaction before responding.
export function confirmPartnerReferral(state,{item,partner,trade,body,identifier,now=new Date().toISOString(),onboardingEnabled=false}){
  const fail=(message,status)=>{throw Object.assign(new Error(message),{status})};
  if(!body||body.accepted!==true||body.emailConfirmed!==true||body.addressConfirmed!==true)
    fail('Bitte Empfehlung, E-Mail-Adresse und Immobilienadresse bestätigen',422);
  if(!item||item.status!=='pending'||!partner||item.partnerId!==partner.id||partner.status!=='active'
    ||['suspended','paused','contract_ended','archived','invited'].includes(partner.lifecycle)
    ||!Number.isFinite(Date.parse(item.expiresAt))||Date.parse(item.expiresAt)<=Date.parse(now)
    ||(!item.referralOnly&&(!trade||trade.id!==item.tradeId)))fail('Empfehlung ist ungültig oder abgelaufen',410);
  const list=key=>{if(!Array.isArray(state[key]))state[key]=[];return state[key];};
  let customer=list('customers').find(x=>String(x.email).toLowerCase()===String(item.email).toLowerCase());
  if(!customer){customer={id:identifier('c-ref'),name:item.name||item.email,email:item.email,phone:'',propertyIds:[],consent:true,consentAt:now,dataClass:'referral'};list('customers').push(customer);}
  let property=list('properties').find(x=>x.customerId===customer.id&&x.postalCode===item.postalCode&&String(x.address).toLowerCase()===String(item.address).toLowerCase());
  if(!property){property={id:identifier('o-ref'),ehvId:`EHV-REF-${Date.parse(now).toString().slice(-6)}`,customerId:customer.id,address:item.address,postalCode:item.postalCode,city:item.city,type:'Noch nicht erfasst',year:null,area:null,value:null};list('properties').push(property);(customer.propertyIds||=[]).push(property.id);}
  const allowance=basicPropertyAllowance(state,partner,property.id);
  const upgradeRequired=onboardingEnabled&&!item.referralOnly&&partner.plan==='basic'&&!allowance.allowed;
  let assignment=null;
  // Own Premium customers are independent of EHV's protected licence regions.
  // The old regional rule remains intact while the central rollout is closed.
  const ownRegionAllowed=partner.plan==='basic'||item.basicReferral===true
    ||(onboardingEnabled&&partner.plan==='premium')||(Array.isArray(partner.postalCodes)&&partner.postalCodes.includes(item.postalCode));
  if(trade&&!item.referralOnly&&ownRegionAllowed){
    assignment=list('assignments').find(x=>x.partnerId===partner.id&&x.propertyId===property.id&&x.tradeId===trade.id&&['active','pending_upgrade'].includes(x.status));
    if(!assignment){assignment={id:identifier('a-basic'),partnerId:partner.id,propertyId:property.id,tradeId:trade.id,
      status:upgradeRequired?'pending_upgrade':'active',overrideRegion:true,accessStart:upgradeRequired?null:now.slice(0,10),accessEnd:null,
      source:onboardingEnabled&&partner.plan==='premium'?'partner_referral':'basic_partner_referral',scope:'referred_customer_and_trade_only'};list('assignments').push(assignment);}
  }
  const lead={id:identifier('lead'),partnerId:partner.id,tradeId:trade?.id||null,customerId:customer.id,propertyId:property.id,assignmentId:assignment?.id||null,
    status:'won',postalCode:item.postalCode,createdAt:now,sourceInvitationId:item.id,attributionOnly:Boolean(item.referralOnly),
    ...(onboardingEnabled?{activationStatus:upgradeRequired?'upgrade_required':'active',confirmedAt:now}:{} )};
  list('referralLeads').unshift(lead);item.status='accepted';item.acceptedAt=now;
  if(onboardingEnabled)item.activationStatus=lead.activationStatus;
  return{lead,upgradeRequired,result:{registered:true,reference:lead.id,partner:partner.company,trade:trade?.name||'Allgemeine Empfehlung',attributionOnly:Boolean(item.referralOnly)}};
}
