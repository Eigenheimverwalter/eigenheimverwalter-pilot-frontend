import { sendPortalMail, smtpConfiguration } from './smtp-mail.mjs';
const sender='partner@eigenheimverwalter.de';
export function partnerMailConfiguration(env=process.env){const config=smtpConfiguration('partner',env);return{sender,provider:'ALL-INKL SMTP',configured:config.configured,hostConfigured:Boolean(config.host)}}
export async function sendPartnerMail({partner,subject,message,env=process.env,transport}){return sendPortalMail({to:partner?.email,subject,text:message,channel:'partner',env,transport})}
