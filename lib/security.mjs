import crypto from 'node:crypto';

export const ROLES = {
  super_admin: ['*'],
  admin_light: ['dashboard.read','partners.read','partners.write','customers.read','customers.write','properties.read','service.read','service.write','opportunities.read','audit.read','exports.read','sales.analytics.read','partner.analytics.read','contracts.read','referral.analytics.read','opportunity.analytics.read'],
  partner_manager: ['dashboard.read','partners.read','partners.write','customers.read','properties.read','assignments.write','service.read','service.write','exports.read'],
  crafts_partner: ['dashboard.read','customers.read','properties.read','service.read','service.write','opportunities.read'],
  broker_partner: ['dashboard.read','customers.read','properties.read','documents.write','sales.read','sales.write','valuations.read','valuations.write','opportunities.read','exports.read'],
  partner_basic: ['dashboard.read','referrals.read','referrals.write','customers.read','properties.read','equipment.read','equipment.write','service.read','service.write','documents.write'],
  referral_partner: ['dashboard.read','referrals.read','referrals.write']
};

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
export const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashPassword(password, salt).split(':')[1], 'hex'));
};
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hasPermission = (user, permission, data) => {
  if (['crafts_partner','broker_partner'].includes(user?.role) && data) {
    const partner=data.partners?.find(item=>item.userId===user.id);
    const template=data.partnerRoleTemplates?.find(item=>item.id===partner?.roleTemplateId&&item.status==='active');
    if (template) return template.permissions.includes('*')||template.permissions.includes(permission);
  }
  const configured=data?.roleProfiles?.find(profile=>profile.role===user?.role)?.permissions;
  const permissions=Array.isArray(configured)?configured:(ROLES[user?.role]||[]);
  return permissions.includes('*')||permissions.includes(permission);
};

export function canAccessProperty(user, property, store, write = false) {
  if (!user || !property) return false;
  if (user.role === 'super_admin' || user.role === 'admin_light' || user.role === 'partner_manager') return !write || user.role !== 'admin_light';
  const partner = store.partners.find(p => p.userId === user.id && p.status === 'active');
  if (!partner) return false;
  const explicit = store.assignments.find(a => a.partnerId === partner.id && a.propertyId === property.id && a.status === 'active');
  if (!explicit) return false;
  if (explicit.accessEnd && new Date(explicit.accessEnd) < new Date()) return false;
  const tradeOk = !explicit.tradeId || partner.tradeIds.includes(explicit.tradeId);
  if (!tradeOk) return false;
  if (explicit.overrideRegion) return true;
  const regionOk = partner.postalCodes.includes(property.postalCode);
  return regionOk && tradeOk;
}

export function canAccessResource(user, resource, store, write = false) {
  if (!user || !resource) return false;
  if (['super_admin','admin_light','partner_manager'].includes(user.role)) return !write || user.role !== 'admin_light';
  const partner = store.partners.find(p => p.userId === user.id && p.status === 'active' && p.lifecycle === 'active');
  if (!partner) return false;
  const property = store.properties.find(p => p.id === resource.propertyId);
  if (!canAccessProperty(user, property, store, write)) return false;
  if (resource.equipmentTypeId || resource.tradeId) return (resource.equipmentTypeId || resource.tradeId) === partner.primaryTradeId;
  return (store.resourceGrants || []).some(grant => grant.partnerId === partner.id && grant.propertyId === property.id && grant.status === 'active' && (!grant.accessEnd || new Date(grant.accessEnd) >= new Date()) && (!write || grant.write === true));
}

export const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');
export const cleanText = (value, max = 500) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
export const maskReferralEmail = value => {
  const email = String(value ?? '').trim().toLowerCase();
  const local = email.split('@')[0] || '';
  const lastDot = email.lastIndexOf('.');
  const suffix = lastDot >= 0 ? email.slice(lastDot + 1).slice(-2) : '';
  return `${local.slice(0, 2)}***${suffix ? `.${suffix}` : ''}`;
};
