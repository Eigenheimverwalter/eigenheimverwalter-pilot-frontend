// Preparation only. No production route imports this module and no outbound
// request, Supabase auth account or app account is created here.
export const APP_REGISTRATION_CONTRACT = 'ehv-referral-registration-v1';
export const APP_REGISTRATION_INTEGRATION_ENABLED = false;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160;

// Inputs must come from the committed, validated referral confirmation, not
// partnerId/customerId fields submitted by a public browser.
export function prepareAppRegistration({invitation, lead, consent, now}) {
  requireValue(validDate(now), 'A valid server timestamp is required');
  requireValue(invitation?.status === 'accepted' && validDate(invitation.acceptedAt), 'Referral must be confirmed first');
  requireValue(Date.parse(invitation.acceptedAt) <= Date.parse(now), 'Referral confirmation cannot be in the future');
  requireValue(id(invitation.id) && id(invitation.partnerId), 'Stable referral identity required');
  requireValue(lead?.sourceInvitationId === invitation.id && lead.partnerId === invitation.partnerId, 'Referral attribution mismatch');
  requireValue(id(lead.id) && id(lead.customerId) && id(lead.propertyId), 'Committed customer and property mapping required');
  requireValue(consent?.requested === true && consent.version === APP_REGISTRATION_CONTRACT, 'Separate app registration request required');
  const email = String(invitation.email || '').trim().toLowerCase();
  requireValue(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254, 'Confirmed email required');
  // No password, referral confirmation token, partner auth token or extra
  // browser-submitted fields are copied into the integration payload.
  return {
    contract: APP_REGISTRATION_CONTRACT,
    requestId: `app-registration:${invitation.id}`,
    idempotencyKey: `app-registration:${invitation.id}`,
    status: 'prepared',
    createdAt: now,
    updatedAt: now,
    referral: {invitationId: invitation.id, leadId: lead.id, partnerId: invitation.partnerId,
      customerId: lead.customerId, propertyId: lead.propertyId,
      tradeId: invitation.referralOnly ? null : (lead.tradeId || null),
      attributionOnly: Boolean(invitation.referralOnly)},
    customer: {name: String(invitation.name || ''), email,
      address: String(invitation.address || ''), postalCode: String(invitation.postalCode || ''), city: String(invitation.city || '')},
    requestConsent: {version: APP_REGISTRATION_CONTRACT, requestedAt: now},
    appUserId: null,
    appPropertyId: null,
    completedAt: null,
  };
}

// This function is not an HTTP/webhook handler. A future authenticated adapter
// must verify the source/signature and match the app identity before calling it.
// A browser JSON value saying "verified" is never a trusted app receipt.
export function applyAppRegistrationReceipt(intent, receipt, now) {
  requireValue(intent?.contract === APP_REGISTRATION_CONTRACT && validDate(now), 'Valid intent and server time required');
  requireValue(receipt?.requestId === intent.requestId && id(receipt.eventId), 'App receipt does not belong to this request');
  requireValue(['email_verification_pending', 'existing_account_sign_in_required', 'registered'].includes(receipt.status), 'Unknown app registration state');
  if (intent.status === 'registered') {
    requireValue(receipt.status !== 'registered' || receipt.appUserId === intent.appUserId, 'Completed app identity cannot be replaced');
    return intent; // duplicate or delayed receipts cannot undo completion
  }
  if (receipt.status !== 'registered') return {...intent, status: receipt.status, updatedAt: now, lastEventId: receipt.eventId};
  requireValue(id(receipt.appUserId) && id(receipt.appPropertyId), 'Verified app customer and property IDs required');
  requireValue(validDate(receipt.emailVerifiedAt) && Date.parse(receipt.emailVerifiedAt) <= Date.parse(now), 'App email verification required');
  requireValue(receipt.partnerId === intent.referral.partnerId && receipt.referralLinked === true, 'App must confirm the original partner attribution');
  requireValue(receipt.customerIdentityConfirmed === true, 'Existing or new app identity must be authenticated');
  return {...intent, status: 'registered', updatedAt: now, completedAt: now,
    appUserId: receipt.appUserId, appPropertyId: receipt.appPropertyId, lastEventId: receipt.eventId};
}

export function appRegistrationProgress(intent) {
  const status = intent?.status || 'not_requested';
  const labels = {
    not_requested: 'App-Registrierung noch nicht angefordert',
    prepared: 'App-Registrierung vorbereitet – App-Anbindung noch nicht aktiv',
    email_verification_pending: 'App-Registrierung gestartet – Bestätigung ausstehend',
    existing_account_sign_in_required: 'Bestehendes App-Konto – Anmeldung erforderlich',
    registered: 'App-Registrierung und Partnerzuordnung bestätigt',
  };
  requireValue(Object.hasOwn(labels, status), 'Unknown app registration state');
  return {status, label: labels[status], appRegistered: status === 'registered',
    countAsAppRegistration: status === 'registered'};
}
