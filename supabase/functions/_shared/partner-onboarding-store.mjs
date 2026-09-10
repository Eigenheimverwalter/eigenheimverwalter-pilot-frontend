import {PartnerOnboardingService,onboardingServiceErrors} from './partner-onboarding-service.mjs';

// Shared by the portal and authenticated Sales/import/invitation adapters. The
// database client must be server-side; no service credential leaves this layer.
export function createSupabaseOnboardingService(db,trades=[]){
  const call=async(name,input)=>{
    const {data,error}=await db.rpc(name,input);
    if(error){
      const code=Object.keys(onboardingServiceErrors).find(k=>String(error.message).includes(k));
      const [message,status]=code?onboardingServiceErrors[code]:['Die Partnerregistrierung konnte nicht gespeichert werden. Bitte den Status neu laden.',503];
      throw Object.assign(new Error(message),{status,code});
    }
    return data;
  };
  return new PartnerOnboardingService({trades,store:{
    entry:({id,tokenHash,actorId,action})=>call('partner_onboarding_entry',{p_action:action,p_id:id,p_token_hash:tokenHash,p_actor:actorId}),
    create:({actorId,input,tokenHash})=>call('create_partner_onboarding',{p_actor:actorId,p_input:input,p_token_hash:tokenHash}),
    step:({action,id,actorId,tokenHash,version,data})=>call('partner_onboarding_step',{p_action:action,p_id:id,p_actor:actorId,p_token_hash:tokenHash,p_version:version,p_data:data}),
    invited:({id,actorId,deliveryReference})=>call('partner_onboarding_invited',{p_id:id,p_actor:actorId,p_delivery_reference:deliveryReference}),
  }});
}
