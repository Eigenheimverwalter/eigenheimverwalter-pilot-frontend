import {onboardingError} from './partner-onboarding.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const unhex=value=>Uint8Array.from(value.match(/../g)||[],v=>parseInt(v,16));
async function encryptionKey(secret){
  if(!secret?.startsWith('sk_test_'))throw onboardingError('STRIPE_TEST_CONFIGURATION_REQUIRED',503);
  const material=await crypto.subtle.digest('SHA-256',encoder.encode(`pilot-stripe-webhook-v1:${secret}`));
  return crypto.subtle.importKey('raw',material,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptSigningSecret(value,key){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return {iv:hex(iv),ciphertext:hex(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('pilot:sandbox')},await encryptionKey(key),encoder.encode(value)))};
}
export async function decryptSigningSecret(value,key){
  try{return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(value.iv),additionalData:encoder.encode('pilot:sandbox')},await encryptionKey(key),unhex(value.ciphertext)));}
  catch{throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);}
}
export async function loadSigningSecret(db,key,override){
  if(override?.startsWith('whsec_'))return override;
  const {data,error}=await db.from('partner_stripe_configuration').select('encrypted_secret').eq('id','sandbox').maybeSingle();
  if(error||!data)throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);
  return decryptSigningSecret(data.encrypted_secret,key);
}
export async function ensureStripeWebhook(db,stripe,key){
  const {data,error}=await db.from('partner_stripe_configuration').select('endpoint_id,encrypted_secret').eq('id','sandbox').maybeSingle();
  if(error)throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);
  if(data){await decryptSigningSecret(data.encrypted_secret,key);return;}
  // Fixed, dedicated Pilot URL. No user-supplied destinations or other products.
  const endpoint=await stripe('webhook_endpoints',{method:'POST',key:'pilot-sandbox-webhook-v1',body:{
    url:'https://rpniwtshbwjuesoeztyt.supabase.co/functions/v1/portal-stripe',api_version:'2025-06-30.basil',
    description:'eigenheimverwalter Pilot – Premium Testzahlungen',
    'enabled_events[0]':'checkout.session.completed','enabled_events[1]':'checkout.session.expired'}});
  if(endpoint.livemode!==false||!endpoint.secret?.startsWith('whsec_'))throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);
  const encrypted=await encryptSigningSecret(endpoint.secret,key);
  const {error:writeError}=await db.from('partner_stripe_configuration').upsert({id:'sandbox',endpoint_id:endpoint.id,encrypted_secret:encrypted},{onConflict:'id',ignoreDuplicates:true});
  if(writeError)throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);
}
