const sender='partner@eigenheimverwalter.de';
export function partnerMailConfiguration(env=process.env){return{sender,provider:'Sales OS · Google Workspace',configured:Boolean(env.SALES_OS_INTEGRATIONS_URL&&env.SALES_OS_FUNCTION_JWT)}}
export async function sendPartnerMail({partner,subject,message,fetchImpl=fetch,env=process.env}){
  const config=partnerMailConfiguration(env);if(!config.configured)return{status:'queued',sender,reason:'sales_os_mail_not_configured'};
  if(!partner?.sourceRefs?.salesOsLeadId)return{status:'queued',sender,reason:'sales_os_lead_reference_missing'};
  const response=await fetchImpl(env.SALES_OS_INTEGRATIONS_URL,{method:'POST',headers:{Authorization:`Bearer ${env.SALES_OS_FUNCTION_JWT}`,'Content-Type':'application/json'},body:JSON.stringify({action:'send_email',leadId:partner.sourceRefs.salesOsLeadId,recipientEmail:partner.email,subject,message,documents:[]})});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw Error(payload.error||`Sales-OS-Mailversand fehlgeschlagen (${response.status})`);return{status:'sent',sender,providerId:payload.email?.id||null,sentAt:payload.email?.sent_at||new Date().toISOString()};
}
