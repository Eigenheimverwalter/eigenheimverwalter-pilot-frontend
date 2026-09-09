// Read-only deployment check. No invitation, acceptance, partner or payment is
// created. Uses only the existing short-lived smoke identity supplied by CI.
const base='https://rpniwtshbwjuesoeztyt.supabase.co',token=process.env.PILOT_SMOKE_ACCESS_TOKEN,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!token||!key)throw Error('Onboarding smoke credentials missing');
const must=(ok,message)=>{if(!ok)throw Error(message)};
const browser={Authorization:`Bearer ${token}`,Origin:'https://eigenheimverwalter.github.io'};
const admin={Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'};
const me=await fetch(base+'/functions/v1/portal-api/me',{headers:browser});must(me.ok,'Smoke identity unavailable');
const {user}=await me.json(),unknown='00000000-0000-4000-8000-000000000000';
const columns=await fetch(base+'/rest/v1/partner_onboardings?select=id,orchestration_version,creation_key,created_by,token_claimed_at,invitation_delivery_ref&limit=0',{headers:admin});
must(columns.ok,'Central onboarding schema unavailable');
const rpc=await fetch(base+'/rest/v1/rpc/partner_onboarding_step',{method:'POST',headers:admin,body:JSON.stringify({p_action:'READ',p_id:unknown,p_actor:user.id})});
must(!rpc.ok&&(await rpc.json()).message==='ONBOARDING_NOT_FOUND','Central onboarding RPC unavailable or unsafe');
const blocked=await fetch(base+'/rest/v1/rpc/partner_onboarding_step',{method:'POST',headers:{...admin,Authorization:`Bearer ${token}`},body:JSON.stringify({p_action:'READ',p_id:unknown,p_actor:user.id})});
must(blocked.status===403,'Authenticated clients must not call private orchestration RPC');
const route=await fetch(base+'/functions/v1/portal-api/partner-onboarding/'+unknown,{headers:browser});
must(route.status===503&&(await route.json()).code==='ONBOARDING_NOT_RELEASED','Phase-3 rollout gate not closed');
const anonymous=await fetch(base+'/functions/v1/portal-api/partner-onboarding/'+unknown);
must(anonymous.status===401,'Anonymous onboarding access must be denied');
console.log(JSON.stringify({centralOnboardingSchema:true,privateRpc:true,rolloutGateClosed:true,anonymousDenied:true,readOnly:true,noPartnerActivation:true,noEmail:true,noPayment:true}));
