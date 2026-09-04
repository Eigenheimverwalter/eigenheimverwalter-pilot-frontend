import { sendPortalMail, portalMailConfiguration } from './smtp-mail.mjs';
const sender='partner@eigenheimverwalter.de';
export function partnerMailConfiguration(env=process.env){const config=portalMailConfiguration('partner',env);return{sender,provider:config.provider,configured:config.configured}}
export async function sendPartnerMail({partner,subject,message,env=process.env,transport}){return sendPortalMail({to:partner?.email,subject,text:message,channel:'partner',env,transport})}
