import {basicPropertyAllowance} from './partner-onboarding.mjs';
export const isBasicBroker=(profile,partner)=>profile?.role==='partner_basic'&&partner?.primaryTradeId==='BROKER'&&!partner.referralOnly;
export const hasBrokerRequest=(state,partner,propertyId)=>(state.partnerCases||[]).some(c=>c.partnerId===partner.id&&c.propertyId===propertyId&&c.kind==='sales_mandate');
export function assertBasicBrokerCreation(state,partner,propertyId){
  if(!hasBrokerRequest(state,partner,propertyId))throw Object.assign(new Error('Eine kundenseitig angefragte Verkehrswertermittlung ist erforderlich.'),{status:403,code:'VALUATION_REQUEST_REQUIRED'});
  if(!basicPropertyAllowance(state,partner,propertyId).allowed)throw Object.assign(new Error('Drei Basic-Verkaufsakten sind enthalten. Für eine vierte Verkaufsakte wechseln Sie bitte zu Premium. Empfehlungen bleiben unbegrenzt.'),{status:403,code:'BASIC_SALES_FILE_LIMIT_REACHED'});
}
