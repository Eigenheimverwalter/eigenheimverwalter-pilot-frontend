import crypto from 'node:crypto';

export const ROLES = {
  super_admin: ['*'],
  admin_light: ['dashboard.read','partners.read','customers.read','properties.read','service.read','service.write','audit.read','exports.read'],
  partner_manager: ['dashboard.read','partners.read','partners.write','customers.read','properties.read','assignments.write','service.read','service.write','exports.read'],
  crafts_partner: ['dashboard.read','customers.read','properties.read','service.read','service.write'],
  broker_partner: ['dashboard.read','customers.read','properties.read','sales.read','sales.write','valuations.read','valuations.write','exports.read']
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
export const hasPermission = (user, permission) => (ROLES[user?.role] || []).includes('*') || (ROLES[user?.role] || []).includes(permission);

export function canAccessProperty(user, property, store, write = false) {
  if (!user || !property) return false;
  if (user.role === 'super_admin' || user.role === 'admin_light' || user.role === 'partner_manager') return !write || user.role !== 'admin_light';
  const partner = store.partners.find(p => p.userId === user.id && p.status === 'active');
  if (!partner) return false;
  const explicit = store.assignments.find(a => a.partnerId === partner.id && a.propertyId === property.id && a.status === 'active');
  if (!explicit) return false;
  if (explicit.accessEnd && new Date(explicit.accessEnd) < new Date()) return false;
  if (explicit.overrideRegion) return true;
  const regionOk = partner.postalCodes.includes(property.postalCode);
  const tradeOk = !explicit.tradeId || partner.tradeIds.includes(explicit.tradeId);
  return regionOk && tradeOk;
}

export const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c');
export const cleanText = (value, max = 500) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
