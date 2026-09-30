export const normalizeCustomerEmail=value=>String(value??'').trim().toLowerCase();
export const duplicateCustomerMessage='Für diese E-Mail-Adresse besteht bereits ein Eintrag oder eine Einladung. Eine erneute Einladung ist nicht möglich. Es wurde keine weitere E-Mail versendet.';
const rows=value=>Array.isArray(value)?value:[];
export function customerEmailKnown(state,email,skipInvitationId=null){
  const normalized=normalizeCustomerEmail(email);if(!normalized)return false;
  const collections=['users','customers','partners','partnerReferralInvitations','customerInvitations','referralLeads'];
  return collections.some(key=>rows(state[key]).some(item=>!(skipInvitationId&&['partnerReferralInvitations','customerInvitations'].includes(key)&&item.id===skipInvitationId)&&normalizeCustomerEmail(item.email)===normalized))
    ||['users','customers'].some(key=>rows(state.productionMirror?.tables?.[key]).some(item=>normalizeCustomerEmail(item.email)===normalized));
}
export function assertNewCustomerEmail(state,email){
  if(customerEmailKnown(state,email))throw Object.assign(new Error(duplicateCustomerMessage),{status:409,code:'CUSTOMER_EMAIL_ALREADY_KNOWN'});
}
export async function commitCustomerInvitation(service,snapshot,actor,action,entityType,entityId,email,metadata={}){
  const {data,error}=await service.rpc('replace_portal_runtime_with_customer_invitation',{
    expected_revision:snapshot.revision,next_payload:snapshot.state,audit_actor:actor,
    audit_action:action,audit_entity_type:entityType,audit_entity_id:entityId,audit_metadata:metadata,
    invitation_email:normalizeCustomerEmail(email),
  });
  if(error){const duplicate=String(error.message).includes('CUSTOMER_EMAIL_ALREADY_KNOWN'),conflict=String(error.message).includes('runtime_revision_conflict');
    throw Object.assign(new Error(duplicate?duplicateCustomerMessage:conflict?'Der Datenbestand wurde zwischenzeitlich geändert. Bitte neu laden; es wurde keine weitere E-Mail versendet.':'Die Einladung konnte nicht sicher geprüft und gespeichert werden. Bitte später erneut versuchen.'),{status:duplicate||conflict?409:503,code:duplicate?'CUSTOMER_EMAIL_ALREADY_KNOWN':undefined});}
  return data;
}
export async function assertRegistrationEmailAvailable(service,email,invitationId){
  const {data,error}=await service.rpc('customer_email_known',{p_email:normalizeCustomerEmail(email),p_skip_invitation_id:invitationId});
  if(error||typeof data!=='boolean')throw Object.assign(new Error('Der bestehende Kundenbestand konnte nicht sicher geprüft werden.'),{status:503});
  if(data)throw Object.assign(new Error('Für diese E-Mail-Adresse besteht bereits ein Eintrag. Bitte den vorhandenen Zugang verwenden oder den Support kontaktieren.'),{status:409});
}
