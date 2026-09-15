// Public invitation entry. The mailed 256-bit token proves mailbox possession;
// existing users must still log in. Never change an existing user's password.
const fail=(message,status,code)=>{throw Object.assign(new Error(message),{status,code})};
export async function onboardingEntryRequest({action,id,body,service,auth,authorization=null,supportView=false}){
  if(supportView)fail('Support-Zugriffe dürfen keine Registrierung bestätigen.',403,'ONBOARDING_PERMISSION_DENIED');
  if(!body||typeof body!=='object'||Array.isArray(body))fail('Ungültige Registrierungsdaten.',400,'ONBOARDING_INPUT_INVALID');
  if(!['inspect','register','claim'].includes(action))fail('Route nicht gefunden.',404,'ONBOARDING_NOT_FOUND');
  if(action==='claim'){
    if(!authorization?.startsWith('Bearer '))fail('Bitte zuerst anmelden.',401,'AUTH_REQUIRED');
    const {data,error}=await auth.getUser(authorization.slice(7));
    if(error||!data?.user?.email_confirmed_at)fail('Bitte mit dem bestätigten eingeladenen Konto anmelden.',401,'AUTH_REQUIRED');
    return {status:200,body:await service.invitation(id,body.token,{actorId:data.user.id})};
  }
  const invitation=await service.invitation(id,body.token);
  if(action==='inspect')return {status:200,body:invitation};
  if(invitation.registered||invitation.login_required)fail('Bitte mit dem vorhandenen Konto anmelden. Ein bestehendes Passwort wird hier nicht geändert.',409,'ONBOARDING_LOGIN_REQUIRED');
  const password=body.password;
  if(typeof password!=='string'||password.length<12||password.length>128||password!==body.passwordConfirmation
    ||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9\s]/.test(password))
    fail('Bitte identische Passwörter mit 12–128 Zeichen, Groß- und Kleinbuchstaben, Zahl und mindestens einem Sonderzeichen eingeben.',422,'PASSWORD_INVALID');
  const {data,error}=await auth.admin.createUser({email:invitation.email,password,email_confirm:true,
    user_metadata:{source:'pilot_central_partner_invitation'}});
  if(error||!data?.user?.id)fail('Der Zugang konnte nicht neu angelegt werden. Falls er bereits besteht, bitte anmelden oder „Passwort vergessen“ verwenden.',409,'ONBOARDING_LOGIN_REQUIRED');
  // If the response is lost, logging in and claiming resumes safely. Never
  // delete an Auth user after an ambiguous commit or reset their password.
  await service.invitation(id,body.token,{actorId:data.user.id});
  return {status:201,body:{registered:true,email:invitation.email,message:'Ihr Zugang wurde angelegt. Bitte vervollständigen Sie jetzt Ihre Partnerregistrierung. Die Kooperation ist noch nicht aktiv.'}};
}
