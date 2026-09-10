import {hashOnboardingToken} from './partner-onboarding-service.mjs';
const fail=(message,status,code)=>{throw Object.assign(new Error(message),{status,code})};
// Uses Supabase's own expiring mailbox proof. It is sent via the existing
// partner mail channel, never returned to a caller or saved in our database.
export async function partnerSelfServiceRequest({action,body,service,auth,authorization,supportView=false,redirectTo,sendMail}){
  if(supportView)fail('Support-Zugriffe dürfen keine Registrierung starten.',403,'ONBOARDING_PERMISSION_DENIED');
  if(!body||typeof body!=='object'||Array.isArray(body))fail('Ungültige Registrierungsdaten.',422,'ONBOARDING_INPUT_INVALID');
  if(action==='email'){
    const email=typeof body.email==='string'?body.email.normalize('NFKC').trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('Bitte eine gültige E-Mail-Adresse angeben.',422,'ONBOARDING_INPUT_INVALID');
    const generic={status:202,body:{message:'Wenn für diese Adresse eine neue Registrierung möglich ist, erhalten Sie eine Bestätigungs-E-Mail. Bei einem bestehenden Zugang melden Sie sich bitte an. Ein erneuter Versand ist nach einer Minute möglich.'}};
    if(!await service.store.emailRequest({email,emailHash:await hashOnboardingToken('self-service-mail:'+email)}))return generic;
    const {data,error}=await auth.admin.generateLink({type:'magiclink',email,options:{redirectTo}});
    if(error||!data?.properties?.action_link)fail('Die Bestätigung konnte nicht vorbereitet werden. Bitte später erneut versuchen.',503,'ONBOARDING_RETRY_REQUIRED');
    await sendMail('partner',email,'Ihre Partnerregistrierung bei eigenheimverwalter',
      `Bitte bestätigen Sie Ihre E-Mail-Adresse und setzen Sie Ihre Partnerregistrierung fort:\n\n${data.properties.action_link}\n\nDieser Link ist persönlich und zeitlich begrenzt. Die Bestätigung aktiviert noch keine Kooperation. Falls Sie keine Registrierung angefordert haben, ignorieren Sie diese E-Mail.`);
    return generic;
  }
  if(action!=='session')fail('Route nicht gefunden.',404,'ONBOARDING_NOT_FOUND');
  if(!authorization?.startsWith('Bearer '))fail('Bitte zuerst Ihre E-Mail-Adresse bestätigen und anmelden.',401,'AUTH_REQUIRED');
  const {data,error}=await auth.getUser(authorization.slice(7));
  if(error||!data?.user?.email_confirmed_at)fail('Bitte zuerst Ihre E-Mail-Adresse bestätigen.',401,'AUTH_REQUIRED');
  const state=await service.store.selfSession({actorId:data.user.id});
  return {status:200,body:{email:state.email,needs_password:state.needs_password===true,onboarding_id:state.onboarding_id||null}};
}
