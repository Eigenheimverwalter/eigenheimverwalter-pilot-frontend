import {array,clean,loadRuntime,replaceRuntime,serviceClient} from '../_shared/runtime.ts';
import {createSupabaseOnboardingService} from '../_shared/partner-onboarding-store.mjs';
import {handleSalesOnboarding} from '../_shared/sales-onboarding-adapter.mjs';
import {onboardingServiceErrors} from '../_shared/partner-onboarding-service.mjs';

const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const equal=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const collection=(state:Record<string,unknown>,key:string)=>{if(!Array.isArray(state[key]))state[key]=[];return array(state[key])};
const portal='https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend';

// Restricted server-to-server bridge: no general portal access and no account password crosses projects.
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const secret=Deno.env.get('BASIC_PARTNER_BRIDGE_TOKEN')||'';
 if(secret.length<48||!equal(req.headers.get('x-basic-partner-token')||'',secret))return json({error:'Unauthorized'},401);
 try{
  const body=await req.json(),job=body.job||{},key=String(job.partnerId||'');
  if(!/^[a-f0-9-]{36}$/i.test(key)||job.organizationId!=='00000000-0000-4000-8000-000000000001')return json({error:'Invalid source'},422);
  if(job.onboardingVersion!==undefined&&![1,3].includes(job.onboardingVersion))return json({error:'Invalid onboarding version'},422);
  const service=serviceClient(),snapshot=await loadRuntime(service),state=snapshot.state;
  if(job.onboardingVersion===3){
   // Never fall through into the legacy invitation/activation path.
   if(Deno.env.get('PILOT_PARTNER_ONBOARDING_ENABLED')!=='true')return json({error:'ONBOARDING_NOT_RELEASED'},503);
   const trades=array(state.trades);
   return json(await handleSalesOnboarding({action:body.action,job,secret,db:service,trades,
    service:createSupabaseOnboardingService(service,trades),portalUrl:portal,
    sendMail:async(mail:Record<string,unknown>)=>{
     const gateway=Deno.env.get('PILOT_MAIL_GATEWAY_TOKEN')||'';if(gateway.length<48)throw Error('Mail not configured');
     const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/portal-mail`,{method:'POST',headers:{'Content-Type':'application/json','x-pilot-mail-token':gateway},body:JSON.stringify({action:'pilot_send_email',...mail}),signal:AbortSignal.timeout(45000)});
     return response.ok;
    }}));
  }
  const partners=collection(state,'partners'),invitations=collection(state,'partnerInvitations');
  let partner=partners.find(p=>p.sourceRefs&& (p.sourceRefs as Record<string,unknown>).salesOsPartnerId===key),invitation=partner?invitations.find(i=>i.partnerId===partner!.id):undefined;
  if(partner&&(!partner.referralOnly||partner.plan!=='basic'))return json({status:'failed',error:'Vorhandenes Partnerkonto benötigt eine manuelle Zuordnung.'});
  const status=()=>({status:invitation?.status==='accepted'?'accepted':invitation?.mailStatus||'pending',sentAt:invitation?.sentAt||null,acceptedAt:invitation?.acceptedAt||null});
  if(body.action==='status')return json(partner?status():{status:'missing'});
  if(body.action!=='invite')return json({error:'Invalid action'},400);
  if(invitation?.status==='accepted'||invitation?.mailStatus==='sent')return json(status());
  if(invitation?.mailStatus==='sending')return json({status:'uncertain',error:'Versandbestätigung fehlt; kein automatischer Doppelversand.'});
  // A second delivery attempt is only accepted after SalesOS has explicitly
  // re-queued the same onboarding job. This keeps ordinary status checks and
  // worker retries idempotent while allowing a controlled manual resend.
  const explicitResend=invitation?.mailStatus==='uncertain'&&Number(job.deliveryAttempt||0)>1;
  if(invitation?.mailStatus==='uncertain'&&!explicitResend)return json({status:'uncertain',error:'Versandbestätigung fehlt; kein automatischer Doppelversand.'});
  const email=clean(job.email,254).toLowerCase(),company=clean(job.company,180),contact=clean(job.contact,120);
  if(job.partnerType!=='Basic Partner'||!company||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({status:'failed',error:'Basic-Partner oder Kontakt-E-Mail ungültig.'});
  if(partners.some(p=>p!==partner&&String(p.email).toLowerCase()===email)||collection(state,'users').some(u=>String(u.email).toLowerCase()===email)&&!partner?.userId)return json({status:'failed',error:'Diese E-Mail besitzt bereits einen Portalzugang. Bitte manuell zuordnen.'});
  const now=new Date().toISOString();
  if(!partner){
   const organizationId=`sales-basic-org-${key}`;
   collection(state,'partnerOrganizations').push({id:organizationId,name:company,type:'basic_partner',address:clean(job.address,180),postalCode:clean(job.postalCode,5),city:clean(job.city,100),createdAt:now});
   partner={id:`sales-basic-${key}`,organizationId,company,contact,email,address:clean(job.address,180),postalCode:clean(job.postalCode,5),city:clean(job.city,100),role:'referral_partner',plan:'basic',referralOnly:true,partnerCategory:'referral',tradeIds:[],primaryTradeId:null,postalCodes:[],status:'invited',lifecycle:'invited',onboarding:10,sourceCategory:clean(job.category,80),sourceSpecialization:clean(job.specialization,100),sourceRefs:{salesOsPartnerId:key,salesOsLeadId:clean(job.leadId,160)},createdAt:now};
   partners.push(partner);
  }
  if(!invitation){invitation={id:`sales-basic-invite-${key}`,partnerId:partner.id,status:'pending',createdAt:now,expiresAt:new Date(Date.now()+7*86400000).toISOString()};invitations.push(invitation)}
  if(explicitResend){invitation.createdAt=now;invitation.expiresAt=new Date(Date.now()+7*86400000).toISOString();invitation.mailStatus='pending'}
  if(Date.parse(String(invitation.expiresAt))<=Date.now())return json({status:'failed',error:'Einladung abgelaufen. Bitte über den Support erneuern.'});
  const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const token=hex(await crypto.subtle.sign('HMAC',signingKey,new TextEncoder().encode(`${invitation.id}:${invitation.createdAt}`)));
  invitation.tokenHash=await hash(token);invitation.mailStatus='sending';invitation.mailAttemptedAt=now;
  await replaceRuntime(service,snapshot,null as unknown as string,'partner.basic.sales_invitation_prepared','partner',String(partner.id),{source:'sales_os',sourcePartnerId:key});
  let result='uncertain';
  try{
   const gateway=Deno.env.get('PILOT_MAIL_GATEWAY_TOKEN')||'';
   if(gateway.length<48)result='failed';
   else{
    const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/portal-mail`,{method:'POST',headers:{'Content-Type':'application/json','x-pilot-mail-token':gateway},body:JSON.stringify({action:'pilot_send_email',channel:'partner',recipientEmail:email,subject:'Willkommen als Basic Partner – Zugang bestätigen',message:`Hallo ${contact||company},\n\nvielen Dank für das Gespräch und Ihr Interesse am eigenheimverwalter Netzwerk.\n\nBitte bestätigen Sie Ihre Einladung und vergeben Sie Ihr eigenes Passwort:\n${portal}/partner-einladung/${token}\n\nDer Link ist 7 Tage gültig und nur einmal verwendbar. Danach melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an.\n\nIhr Basic-Zugang ist für Tipps und Kundenempfehlungen vorgesehen. Er beinhaltet keine Gebietslizenz und keinen Zugriff auf fremde Kundenakten.\n\nIhr eigenheimverwalter Partnerteam`}),signal:AbortSignal.timeout(45000)});
    // A non-2xx response can follow an ambiguous SMTP acknowledgement too: do not resend automatically.
    result=response.ok?'sent':'uncertain';
   }
  }catch{result='uncertain'}
  for(let attempt=0;attempt<3;attempt++){
   const latest=await loadRuntime(service),item=array(latest.state.partnerInvitations).find(i=>i.id===invitation!.id);
   if(!item)throw Error('Invitation missing');item.mailStatus=result;if(result==='sent')item.sentAt=new Date().toISOString();
   try{await replaceRuntime(service,latest,null as unknown as string,'partner.basic.invitation_'+result,'partner',String(partner.id),{sourcePartnerId:key});return json({status:result,sentAt:item.sentAt||null})}catch(error){if(attempt===2)throw error}
  }
 }catch(error){
  const known=onboardingServiceErrors[(error as {code?:string})?.code||''];
  if(known)return json({status:'failed',error:known[0]});
  return json({error:'Partner-Übergabe konnte nicht bestätigt werden.'},503);
 }
 return json({error:'Übergabe fehlgeschlagen'},503);
});
