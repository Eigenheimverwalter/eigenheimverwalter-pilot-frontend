import {hashOnboardingToken} from './partner-onboarding-service.mjs';
import {onboardingError} from './partner-onboarding.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function salesOnboardingInput(job,trades){
  if(!uuid.test(job.id||'')||!uuid.test(job.partnerId||'')||typeof job.leadId!=='string'||!job.leadId.trim()||job.leadId.length>160)throw onboardingError('ONBOARDING_INPUT_INVALID');
  if(!['BASIC','PREMIUM'].includes(job.cooperationLevel))throw onboardingError('COOPERATION_LEVEL_REQUIRED');
  if(!['EQUIPMENT_PARTNER','BROKER_PARTNER','REFERRAL'].includes(job.onboardingPartnerType)||job.onboardingPartnerType==='REFERRAL'&&job.cooperationLevel==='PREMIUM')throw onboardingError('PARTNER_TYPE_REQUIRED');
  let equipment=null;
  if(job.onboardingPartnerType==='EQUIPMENT_PARTNER'){
    // Match only the existing Pilot catalog. Never guess a licence scope.
    const matches=trades.filter(t=>t.onboarding!==false&&t.tier!=='legacy'&&(t.id===job.equipmentType||t.name===job.equipmentType));
    if(matches.length!==1)throw onboardingError('EQUIPMENT_TYPE_REQUIRED');
    equipment=matches[0].id;
  }
  return{source:'SALES_OS',request_key:job.id,sales_lead_id:job.leadId,invite_id:job.id,
    requested_plan:job.cooperationLevel,partner_type:job.onboardingPartnerType,equipment_type:equipment,
    prefilled_data:{company:job.company,contact_name:job.contact,email:job.email,phone:job.phone,address:job.address,postal_code:job.postalCode,city:job.city}};
}
export function salesOnboardingStatus(flow){
  if(!flow)return{status:'missing'};
  const s=flow.status;
  return{status:flow.invitation_delivery_status==='sent'?'sent':flow.invitation_delivery_status?'uncertain':'pending',
    sentAt:flow.invitation_sent_at||null,acceptedAt:flow.token_claimed_at||null,
    onboardingId:flow.id,onboardingStatus:s,partnerId:flow.partner_id||null,
    legalStatus:['LEGAL_ACCEPTED','CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED','READY_FOR_ACTIVATION','ACTIVE'].includes(s)?'ACCEPTED':'PENDING',
    checkoutStatus:['CHECKOUT_PENDING','PAYMENT_PENDING','PAYMENT_FAILED'].includes(s)?s:flow.requested_plan==='BASIC'?'NOT_REQUIRED':'NOT_STARTED',
    // ACTIVE is authoritative only after the later verified activation service.
    paymentStatus:flow.requested_plan==='BASIC'?'NOT_REQUIRED':s==='ACTIVE'?'CONFIRMED':s==='PAYMENT_FAILED'?'FAILED':'UNCONFIRMED',
    partnerStatus:s==='ACTIVE'?'ACTIVE':['CANCELLED','EXPIRED'].includes(s)?s:'ONBOARDING'};
}
export async function salesInvitationToken(secret,jobId){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`sales-central-onboarding:v1:${jobId}`))),x=>x.toString(16).padStart(2,'0')).join('');
}
// Authenticated bridge only; reuse central orchestration and existing portal-mail.
export async function handleSalesOnboarding({action,job,secret,service,db,trades,sendMail,portalUrl}){
  if(!uuid.test(job.id||'')||typeof job.leadId!=='string'||!job.leadId)throw onboardingError('ONBOARDING_INPUT_INVALID');
  const read=async()=>{
    const {data,error}=await db.from('partner_onboardings').select('id,status,partner_id,requested_plan,invitation_delivery_status,invitation_sent_at,token_claimed_at,invitation_delivery_ref')
      .eq('source','SALES_OS').eq('invite_id',job.id).eq('sales_lead_id',job.leadId).maybeSingle();
    if(error)throw error;return data;
  };
  // Repair a lost central acknowledgement without sending again.
  const status=async()=>{let flow=await read();if(flow?.invitation_delivery_status==='sent'&&!flow.invitation_delivery_ref){await service.confirmInvitation(flow.id,{deliveryReference:`sales:${job.id}`});flow=await read();}return salesOnboardingStatus(flow);};
  if(action==='status')return status();
  if(action!=='invite')throw onboardingError('ONBOARDING_INPUT_INVALID');
  const input=salesOnboardingInput(job,trades),token=await salesInvitationToken(secret,job.id);
  const created=await service.create(input,{source:'SALES_OS',invitationToken:token});
  // Use the server-normalized contact snapshot, including lowercase email.
  input.prefilled_data=created.prefilled_data;
  const receipt=async act=>{const {data,error}=await db.rpc('sales_onboarding_delivery',{p_id:created.onboarding_id,p_job_id:job.id,p_token_hash:await hashOnboardingToken(token),p_action:act});if(error)throw error;return data;};
  const claim=await receipt('CLAIM');
  if(!claim.claimed)return status();
  let delivered=false;
  try{delivered=await sendMail({channel:'partner',recipientEmail:input.prefilled_data.email,
    subject:'Willkommen bei eigenheimverwalter – Partnerregistrierung abschließen',
    message:`Hallo ${input.prefilled_data.contact_name||input.prefilled_data.company},\n\nbitte prüfen und vervollständigen Sie Ihre bereits übernommenen Angaben:\n${portalUrl}/partner-onboarding/${created.onboarding_id}#token=${token}\n\nDer Link ist 7 Tage gültig. Anschließend bestätigen Sie die Kooperationsbedingungen und Datenschutzinformationen. ${input.requested_plan==='PREMIUM'?'Bei Premium folgen Gebietsauswahl und Zahlung.':'Bei Basic ist keine Zahlung erforderlich.'}\n\nDie Kooperation wird erst nach Abschluss aller erforderlichen Schritte aktiviert.\n\nIhr eigenheimverwalter Partnerteam`})===true;}catch{/* Uncertain SMTP acknowledgement: never automatically resend. */}
  await receipt(delivered?'SENT':'UNCERTAIN');
  return status();
}
