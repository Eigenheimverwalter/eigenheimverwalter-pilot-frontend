import {loadRuntime,array} from './runtime.ts';
import {assertPartnerLegalIdentity} from './partner-legal.mjs';
import {assertCheckoutAllowed,premiumAnnualQuote,onboardingError,PartnerRegionRecommendationService,assertActivationAllowed} from './partner-onboarding.mjs';
import {reservePartnerRegions,assertPartnerRegionsAvailable} from './partner-region-reservations.mjs';
import {stripeClient,verifyStripeConfiguration,checkoutParameters,verifyPaidCheckout,TEST_STRIPE_PRICES} from './partner-stripe.mjs';
import {applyPartnerLicenseChange} from './partner-license.mjs';
import {ensureStripeWebhook} from './partner-stripe-configuration.mjs';

const base='https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend';
const config=()=>({key:Deno.env.get('PILOT_STRIPE_SECRET_KEY')?.trim(),webhook:Deno.env.get('PILOT_STRIPE_WEBHOOK_SECRET')?.trim()});
const enabled=()=>Boolean(config().key?.startsWith('sk_test_'));
const messages:Record<string,string>={STRIPE_TEST_CONFIGURATION_REQUIRED:'Der Stripe-Testzugang wird noch eingerichtet. Ihre Auswahl bleibt erhalten.',STRIPE_REQUEST_FAILED:'Stripe ist gerade nicht erreichbar. Bitte erneut versuchen; es wird kein zweites Abo angelegt.',STRIPE_PRICE_CONFIGURATION_MISMATCH:'Die Stripe-Preise müssen vor der Zahlung geprüft werden.',CHECKOUT_CHANGED:'Der Zahlungsstand wurde geändert. Bitte neu laden.',CHECKOUT_PENDING_RECONCILIATION:'Der bestehende Checkout wird geprüft. Bitte keinen neuen Kauf starten.'};
const fail=(code:string,status=409)=>{throw Object.assign(onboardingError(code,status),{message:messages[code]||code});};
async function call(db:any,name:string,input:any){const {data,error}=await db.rpc(name,input);if(error){const code=['LEGAL_ACCEPTANCE_REQUIRED','ONBOARDING_CHANGED','runtime_revision_conflict','CHECKOUT_CHANGED','CHECKOUT_ALREADY_EXISTS'].find(c=>error.message.includes(c));fail(code||'CHECKOUT_CHANGED');}return data;}
async function ownFlow(db:any,id:string,actor:string){
  const flow=await call(db,'partner_onboarding_step',{p_action:'READ',p_id:id,p_actor:actor});
  if(flow.auth_user_id!==actor||flow.sandbox_only!==true||!['basic.heizung@ehv.test','makler_basic@ehv.test'].includes(flow.prefilled_data?.email)||flow.requested_plan!=='PREMIUM')fail('CHECKOUT_TEST_ACCOUNT_REQUIRED',403);
  return flow;
}
async function legalState(db:any,flow:any){return call(db,'partner_legal_step',{p_action:'READ',p_onboarding:flow.id,p_actor:flow.auth_user_id});}
async function currentAttempt(db:any,id:string){const {data,error}=await db.from('partner_checkout_attempts').select('*').eq('onboarding_id',id).neq('status','EXPIRED').maybeSingle();if(error)fail('CHECKOUT_CHANGED',503);return data;}
async function commit(db:any,action:string,flow:any,snapshot:any,attempt:any,event:string|null=null){return call(db,'commit_partner_checkout',{p_action:action,p_flow:flow.id,p_actor:flow.auth_user_id,p_flow_version:flow.version,p_revision:snapshot.revision,p_payload:snapshot.state,p_attempt:attempt,p_event:event});}
async function readBody(req:Request){
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail('REQUEST_TOO_LARGE',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_REQUEST',400);}
}
export async function partnerCheckoutRoute(req:Request,path:string,db:any,profile:any,user:any){
  assertPartnerLegalIdentity(profile,user,Boolean(req.headers.get('x-ehv-support-user')));
  const match=path.match(/^\/partner-onboarding\/([0-9a-f-]{36})\/(premium|quote|checkout|checkout-cancel)$/i);
  if(!match)fail('NOT_FOUND',404);
  const [,id,action]=match,flow=await ownFlow(db,id,user.id),snapshot=await loadRuntime(db);
  const partner=array(snapshot.state.partners).find(p=>p.id===flow.existing_partner_id);
  if(!partner||partner.referralOnly===true||partner.primaryTradeId!==(flow.partner_type==='BROKER_PARTNER'?'BROKER':flow.equipment_type))fail('CHECKOUT_PARTNER_MISMATCH',403);
  if(action==='premium'&&req.method==='GET'){
    const attempt=await currentAttempt(db,id);
    const recommendations=new PartnerRegionRecommendationService().recommend({directory:array(snapshot.state.postalDirectory),partner:{...partner,...flow.prefilled_data,postalCode:flow.prefilled_data.postal_code},scope:flow.partner_type==='BROKER_PARTNER'?'BROKER':flow.equipment_type,limit:6});
    return {status:200,body:{sandbox:true,configured:enabled(),maxPostalCodes:10,includedPostalCodes:2,attempt:attempt?{status:attempt.status,postalCodes:attempt.postal_codes,quote:attempt.quote,expiresAt:attempt.stripe_expires_at}:null,
      recommendations:recommendations.filter(r=>{try{assertPartnerRegionsAvailable(snapshot.state,{scope:flow.partner_type==='BROKER_PARTNER'?'BROKER':flow.equipment_type,postalCodes:[r.postalCode],partnerId:partner.id as string,onboardingId:id});return true;}catch{return false;}}),
      prices:{baseNetCents:flow.partner_type==='BROKER_PARTNER'?97900:49900,additionalUnitNetCents:12999,taxPercent:19}}};
  }
  if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  const body=await readBody(req);
  if(action==='quote'){
    const quote=premiumAnnualQuote(flow.partner_type,body.postalCodes);
    assertPartnerRegionsAvailable(snapshot.state,{scope:flow.partner_type==='BROKER_PARTNER'?'BROKER':flow.equipment_type,postalCodes:body.postalCodes,partnerId:partner.id as string,onboardingId:id});
    return {status:200,body:{quote,postalCodes:body.postalCodes,availability:'AVAILABLE_AT_CHECK',reserved:false}};
  }
  if(!enabled())fail('STRIPE_TEST_CONFIGURATION_REQUIRED',503);
  const stripe=stripeClient(config().key);
  let attempt=await currentAttempt(db,id);
  if(action==='checkout-cancel'){
    if(!attempt||attempt.status==='PAID')fail('CHECKOUT_PENDING_RECONCILIATION');
    if(!attempt.checkout_id)fail('CHECKOUT_PENDING_RECONCILIATION');
    let session=await stripe(`checkout/sessions/${attempt.checkout_id}`);
    if(session.status==='open')session=await stripe(`checkout/sessions/${attempt.checkout_id}/expire`,{method:'POST',key:`expire-${attempt.id}`});
    if(session.status!=='expired')fail('CHECKOUT_PENDING_RECONCILIATION');
    for(const r of array(snapshot.state.partnerRegionReservations).filter(r=>r.checkout_attempt_id===attempt.id)){r.status='RELEASED';r.released_at=new Date().toISOString();}
    await commit(db,'EXPIRED',flow,snapshot,attempt,`cancel_${attempt.id}`);
    return {status:200,body:{released:true}};
  }
  if(action!=='checkout')fail('NOT_FOUND',404);
  const legal=await legalState(db,flow);assertCheckoutAllowed(flow,legal);
  const quote=premiumAnnualQuote(flow.partner_type,body.postalCodes);
  if(attempt&&JSON.stringify([...body.postalCodes].sort())!==JSON.stringify(attempt.postal_codes))fail('RESERVATION_CHANGE_REQUIRES_RELEASE');
  if(attempt?.status==='PAID')return {status:200,body:{active:true}};
  await verifyStripeConfiguration(stripe,flow.partner_type);
  if(!config().webhook?.startsWith('whsec_'))await ensureStripeWebhook(db,stripe,config().key);
  if(!attempt){
    const reservations=reservePartnerRegions(snapshot.state,{onboarding:flow,legalState:legal,postalCodes:body.postalCodes});
    attempt={id:crypto.randomUUID(),postal_codes:[...body.postalCodes].sort(),quote,stripe_expires_at:Math.floor(Date.now()/1000)+35*60};
    for(const r of reservations){r.checkout_attempt_id=attempt.id;r.expires_at=new Date((attempt.stripe_expires_at+300)*1000).toISOString();}
    attempt=await commit(db,'PREPARE',flow,snapshot,attempt);
  }
  if(attempt.status==='OPEN'){
    const session=await stripe(`checkout/sessions/${attempt.checkout_id}`);
    if(session.status==='open')return {status:200,body:{url:session.url}};
    fail('CHECKOUT_PENDING_RECONCILIATION');
  }
  // Persisted attempt provides stable params/idempotency after timeouts. Never
  // make a new attempt just because Stripe's response was lost.
  const session=await stripe('checkout/sessions',{method:'POST',key:`pilot-checkout-${attempt.id}`,body:checkoutParameters(flow,attempt,base)});
  if(!session.id?.startsWith('cs_test_')||session.livemode!==false||!session.url?.startsWith('https://checkout.stripe.com/'))fail('CHECKOUT_SESSION_INVALID',503);
  const freshFlow=await ownFlow(db,id,user.id),freshSnapshot=await loadRuntime(db);
  for(const r of array(freshSnapshot.state.partnerRegionReservations).filter(r=>r.checkout_attempt_id===attempt.id))r.checkout_id=session.id;
  await commit(db,'OPEN',freshFlow,freshSnapshot,{...attempt,checkout_id:session.id,checkout_url:session.url});
  return {status:200,body:{url:session.url}};
}

// Only the separate raw-body/signature-verifying webhook calls this adapter.
export async function applyPartnerStripeEvent(db:any,event:any){
  if(event.livemode!==false)fail('LIVE_PAYMENT_NOT_ENABLED',400);
  if(!['checkout.session.completed','checkout.session.expired'].includes(event.type))return {ignored:true};
  const attemptId=event.data?.object?.metadata?.attempt_id;
  if(!attemptId||event.data.object.metadata.application!=='eigenheimverwalter-pilot')return {ignored:true};
  const {data:attempt,error}=await db.from('partner_checkout_attempts').select('*').eq('id',attemptId).maybeSingle();
  if(error||!attempt)fail('CHECKOUT_CHANGED',503);
  if(attempt.status==='PAID'||attempt.status==='EXPIRED')return {duplicate:true};
  if(attempt.status!=='OPEN'||attempt.checkout_id!==event.data.object.id)fail('CHECKOUT_PENDING_RECONCILIATION',503);
  const {data:flow,error:flowError}=await db.from('partner_onboardings').select('*').eq('id',attempt.onboarding_id).single();
  if(flowError||!flow||!flow.sandbox_only)fail('CHECKOUT_CHANGED',503);
  const stripe=stripeClient(config().key),session=await stripe(`checkout/sessions/${attempt.checkout_id}`),snapshot=await loadRuntime(db);
  const held=array(snapshot.state.partnerRegionReservations).filter(r=>r.checkout_attempt_id===attempt.id);
  if(event.type==='checkout.session.expired'){
    if(session.status!=='expired')fail('CHECKOUT_PENDING_RECONCILIATION',503);
    for(const r of held){r.status='RELEASED';r.released_at=new Date().toISOString();}
    await commit(db,'EXPIRED',flow,snapshot,attempt,event.id);return {released:true};
  }
  const [lines,subscription]=await Promise.all([stripe(`checkout/sessions/${attempt.checkout_id}/line_items?limit=100`),stripe(`subscriptions/${session.subscription}?expand[]=latest_invoice`)]);
  const payment=verifyPaidCheckout(flow,attempt,session,lines,subscription),legal=await legalState(db,flow);
  if(held.length!==attempt.postal_codes.length||held.some(r=>r.status!=='RESERVED'||r.checkout_id!==attempt.checkout_id))fail('POSTAL_RESERVATION_REQUIRED',503);
  // Reservations bound to this checkout remain held until this transaction.
  for(const r of held){r.status='ACTIVE';r.activated_at=new Date().toISOString();}
  assertActivationAllowed({onboarding:{...flow,checkout_id:attempt.checkout_id,price_id:TEST_STRIPE_PRICES[flow.partner_type],postal_codes:attempt.postal_codes},legalState:legal,
    payment:{verified_webhook:true,status:'PAID',onboarding_id:flow.id,checkout_id:attempt.checkout_id,price_id:TEST_STRIPE_PRICES[flow.partner_type],event_id:event.id,additional_quantity:payment.quote.additionalQuantity},
    reservations:held,license:{partner_id:flow.partner_id,onboarding_id:flow.id,status:'READY'}});
  const partner=array(snapshot.state.partners).find(p=>p.id===flow.existing_partner_id);if(!partner)fail('LICENSE_REQUIRED',503);
  const today=new Date().toISOString().slice(0,10),end=new Date(payment.paidThrough*1000).toISOString().slice(0,10);
  const result=applyPartnerLicenseChange(partner,{postalCodes:attempt.postal_codes,cooperationStart:today,contractEnd:end,reservationDate:today});
  if(result.error)fail('LICENSE_REQUIRED',503);
  Object.assign(partner,{plan:'premium',cooperationLevel:'PREMIUM',status:'active'});
  Object.assign(partner.license as object,{contractEnd:end,stripeSubscriptionId:payment.subscriptionId,paymentMode:'test',onboardingId:flow.id,cancelNoticeMonths:3,autoRenewMonths:12});
  await commit(db,'PAID',flow,snapshot,{...attempt,subscription_id:payment.subscriptionId,paid_through:payment.paidThrough},event.id);
  return {activated:true};
}
