import {onboardingEntryRequest} from './partner-onboarding-entry.mjs';
import {createSupabaseOnboardingService} from './partner-onboarding-store.mjs';
import {partnerSelfServiceRequest} from './partner-self-service.mjs';
import {sendPortalMail} from './mail.ts';

export async function partnerOnboardingEntryRoute(req:Request,path:string,db:any,origin:string){
  if(Deno.env.get('PILOT_PARTNER_ONBOARDING_ENABLED')!=='true')
    return {status:503,body:{code:'ONBOARDING_NOT_RELEASED',error:'Die neue Partnerregistrierung ist noch nicht freigegeben. Ihre Einladung bleibt bis zum angegebenen Ablaufdatum gespeichert.'}};
  if(!origin)return {status:403,body:{error:'Nicht zugelassener Portal-Ursprung'}};
  if(req.method!=='POST')return {status:405,body:{error:'Methode nicht unterstützt'}};
  const match=path.match(/^\/onboarding-invitations\/([0-9a-f-]{36})\/(inspect|register|claim)$/i);
  const self=path.match(/^\/onboarding-self-service\/(email|session)$/);
  if(!match&&!self)return {status:404,body:{error:'Route nicht gefunden'}};
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>8192){await reader.cancel();return {status:413,body:{error:'Zu viele Registrierungsdaten'}};}chunks.push(value);}}
    finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return {status:400,body:{error:'Ungültige Registrierungsdaten'}};}
  try{
    const common={body,service:createSupabaseOnboardingService(db),auth:db.auth,
      authorization:req.headers.get('authorization'),supportView:Boolean(req.headers.get('x-ehv-support-user'))};
    if(self){
      const base=origin==='https://eigenheimverwalter.github.io'?origin+'/eigenheimverwalter-pilot-frontend':origin;
      return await partnerSelfServiceRequest({...common,action:self[1],redirectTo:base+'/partner-onboarding/',sendMail:sendPortalMail});
    }
    return await onboardingEntryRequest({...common,id:match![1],action:match![2]});
  }
  catch(error){const failure=error as {status?:number;code?:string;message?:string};
    const safe=typeof failure.code==='string'&&/^(ONBOARDING_|AUTH_REQUIRED$|PASSWORD_INVALID$)/.test(failure.code);
    // Never log a request body, token, password, raw Auth error or SQL detail.
    return {status:safe?Number(failure.status||400):503,body:{code:safe?failure.code:'ONBOARDING_RETRY_REQUIRED',error:safe?failure.message:'Der Vorgang konnte nicht bestätigt werden. Bitte mit Ihrem Passwort anmelden und den Status erneut laden.'}};
  }
}
