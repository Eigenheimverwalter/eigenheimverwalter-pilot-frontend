export const referralPartnerRoles = ['partner_basic', 'referral_partner', 'crafts_partner', 'broker_partner'];
export function canRecommend(partner, role) {
  return Boolean(partner && referralPartnerRoles.includes(role) && partner.status === 'active' && !['suspended','paused','contract_ended','archived','invited'].includes(partner.lifecycle));
}
export const isReferralOnly = (partner, role) => role === 'referral_partner' || partner.referralOnly === true;
export function maskReferralEmail(value) {
  const [local, domain = ''] = String(value || '').split('@');
  return local.slice(0, 2) + '***@***.' + (domain.split('.').at(-1) || '').slice(-2);
}
export function referralOverview(state, partner, role, {onboardingEnabled=false}={}) {
  const list = key => Array.isArray(state[key]) ? state[key] : [];
  const invitations = list('partnerReferralInvitations').filter(row => row.partnerId === partner.id);
  const leads = list('referralLeads').filter(row => row.partnerId === partner.id);
  const invitationIds = new Set(invitations.map(row => row.id));
  const rows = [...invitations, ...leads.filter(row => !invitationIds.has(row.sourceInvitationId))]
    .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(row => ({id:row.id, name:row.name || '', email:maskReferralEmail(row.email), address:row.address || '', postalCode:row.postalCode || '', city:row.city || '', status:row.status, createdAt:row.createdAt,
      ...(onboardingEnabled?{activationStatus:row.activationStatus||leads.find(l=>l.sourceInvitationId===row.id)?.activationStatus||null}:{} )}));
  const trade = list('trades').find(row => row.id === partner.primaryTradeId);
  const allowance=onboardingEnabled?basicPropertyAllowance(state,partner,null):null;
  return {
    partner:{id:partner.id, company:partner.company, tradeId:trade?.id || null, tradeName:trade?.name || 'Allgemeine Empfehlung', referralOnly:isReferralOnly(partner,role), canRecommend:canRecommend(partner,role)},
    link:`/ref/${encodeURIComponent(partner.referralCode || partner.id)}`,
    ...(onboardingEnabled?{capacity:{confirmedProperties:allowance.confirmedProperties,
      limit:allowance.limit,
      pendingProperties:new Set(leads.filter(l=>l.activationStatus==='upgrade_required'&&l.propertyId).map(l=>l.propertyId)).size,
      upgradeRequired:partner.plan==='basic'&&!allowance.allowed}}:{}),
    invitations:rows,
    stats:{referred:rows.length, registered:rows.filter(row => ['accepted','won','successful','brokerage_in_progress'].includes(row.status)).length,
      assigned:onboardingEnabled?new Set(leads.filter(row=>row.propertyId&&row.activationStatus!=='upgrade_required').map(row=>row.propertyId)).size:leads.filter(row=>row.customerId||row.propertyId).length},
    // Compatibility for any older clients, still scoped and free of tokens/contact details.
    recent:rows.slice(0,10), leads:rows,
  };
}
import {basicPropertyAllowance} from './partner-onboarding.mjs';
