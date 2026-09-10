import {partnerOnboardingRequest, onboardingServiceErrors} from './partner-onboarding-service.mjs';
import {createSupabaseOnboardingService} from './partner-onboarding-store.mjs';
import {loadRuntime, array} from './runtime.ts';
import {onboardingSummary} from './partner-onboarding-service.mjs';

export async function partnerOnboardingRoute(req:Request,path:string,db:any,profile:any,user:any){
  // Enable only during the coordinated entry-source cutover, never by a browser
  // flag. Existing partner activation sites are still retained in this phase.
  const sandbox=user.email==='basic.heizung@ehv.test'&&profile.status==='active'&&profile.role==='partner_basic'&&!req.headers.get('x-ehv-support-user');
  if(Deno.env.get('PILOT_PARTNER_ONBOARDING_ENABLED')!=='true'&&!sandbox)
    return{status:503,body:{code:'ONBOARDING_NOT_RELEASED',error:'Der neue Partnerprozess wird vorbereitet und ist noch nicht freigegeben.'}};
  let body:any={};
  if(['POST','PATCH'].includes(req.method)){
    const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>8192){await reader.cancel();throw Object.assign(new Error('Zu viele Onboardingdaten.'),{status:413});}chunks.push(value);}}
      finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('Ungültige Onboardingdaten.'),{status:400});}
  }
  if(path==='/partner-onboarding'&&req.method==='GET'){
    if(req.headers.get('x-ehv-support-user')||!user.email_confirmed_at||user.id!==profile.id)throw Object.assign(new Error('Keine Berechtigung'),{status:403});
    const {data,error}=await db.from('partner_onboardings').select('*').eq('auth_user_id',user.id).eq('requested_plan','PREMIUM').not('status','in','(ACTIVE,CANCELLED,EXPIRED)').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw Object.assign(new Error('Registrierungsstand konnte nicht geladen werden'),{status:503});
    return {status:200,body:{onboarding:data?onboardingSummary(data):null}};
  }
  if(sandbox&&Deno.env.get('PILOT_PARTNER_ONBOARDING_ENABLED')!=='true'&&path==='/partner-onboarding'&&req.method==='POST'&&body.requested_plan!=='PREMIUM')throw Object.assign(new Error('Dieser Test ist für das Premium-Upgrade vorgesehen.'),{status:403});
  const trades=path==='/partner-onboarding'&&req.method==='POST'?array((await loadRuntime(db)).state.trades):[];
  try{return await partnerOnboardingRequest({method:req.method,path,body,profile,user,supportView:Boolean(req.headers.get('x-ehv-support-user')),
    service:createSupabaseOnboardingService(db,trades)});}
  catch(error){const code=(error as {code?:string}).code;
    if(code&&onboardingServiceErrors[code]){const [message,status]=onboardingServiceErrors[code];throw Object.assign(new Error(message),{status,code});}
    throw error;
  }
}
