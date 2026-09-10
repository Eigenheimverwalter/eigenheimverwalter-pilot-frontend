import {premiumAnnualQuote,onboardingError} from './partner-onboarding.mjs';
export const TEST_STRIPE_ACCOUNT='acct_1Qx4rTFtfWWlBemh';
export const TEST_STRIPE_PRICES=Object.freeze({EQUIPMENT_PARTNER:'price_1UDpQHFtfWWlBemhgdbf5sBw',BROKER_PARTNER:'price_1UDpRQFtfWWlBemhkrS5jXvi',additional:'price_1UDpS6FtfWWlBemh8fF6H94H',tax:'txr_1UDpT1FtfWWlBemhqncKvQLk'});
export function stripeClient(secret,fetcher=fetch){
  if(typeof secret!=='string'||!secret.startsWith('sk_test_'))throw onboardingError('STRIPE_TEST_CONFIGURATION_REQUIRED',503);
  return async(path,{method='GET',body,key}={})=>{
    const response=await fetcher(`https://api.stripe.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${secret}`,
      'Stripe-Version':'2025-06-30.basil',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},
      ...(body?{body:new URLSearchParams(body).toString()}:{}),signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    // Do not leak API responses, billing details or credentials into logs/errors.
    if(!response.ok)throw onboardingError('STRIPE_REQUEST_FAILED',503);
    return data;
  };
}
export async function verifyStripeConfiguration(stripe,partnerType){
  const [account,price,extra,tax]=await Promise.all([stripe('account'),stripe(`prices/${TEST_STRIPE_PRICES[partnerType]}`),stripe(`prices/${TEST_STRIPE_PRICES.additional}`),stripe(`tax_rates/${TEST_STRIPE_PRICES.tax}`)]);
  const expected=partnerType==='BROKER_PARTNER'?97900:49900;
  const valid=(p,amount)=>p.active===true&&p.livemode===false&&p.currency==='eur'&&p.unit_amount===amount&&p.recurring?.interval==='year'&&p.recurring?.interval_count===1&&p.tax_behavior==='exclusive';
  if(account.id!==TEST_STRIPE_ACCOUNT||!valid(price,expected)||!valid(extra,12999)||tax.active!==true||tax.livemode!==false||tax.inclusive!==false||tax.percentage!==19)
    throw onboardingError('STRIPE_PRICE_CONFIGURATION_MISMATCH',503);
  const productId=partnerType==='BROKER_PARTNER'?'prod_VEI1nTISmpoUbU':'prod_VEI0OauAjSvkzf';
  if(price.product!==productId||extra.product!=='prod_VEI2Q0jLzPHeVp')throw onboardingError('STRIPE_PRICE_CONFIGURATION_MISMATCH',503);
  // Keep the established test prices, but never show the internal abbreviation
  // as a customer-facing product name on the Stripe checkout.
  await Promise.all([stripe(`products/${productId}`,{method:'POST',key:`pilot-name-${productId}-v1`,body:{name:partnerType==='BROKER_PARTNER'?'eigenheimverwalter – Premium Maklerpartner':'eigenheimverwalter – Premium Handwerkspartner'}}),
    stripe('products/prod_VEI2Q0jLzPHeVp',{method:'POST',key:'pilot-name-additional-postal-v1',body:{name:'eigenheimverwalter – zusätzliches PLZ-Lizenzgebiet'}})]);
}
export function checkoutParameters(flow,attempt,baseUrl){
  const quote=premiumAnnualQuote(flow.partner_type,attempt.postal_codes);
  const url=new URL(baseUrl);
  if(url.protocol!=='https:'||!['eigenheimverwalter.github.io','eigenheimverwalter-pilot.de'].includes(url.hostname))throw onboardingError('CHECKOUT_RETURN_URL_INVALID');
  const returnUrl=`${baseUrl.replace(/\/$/,'')}/partner-onboarding/${flow.id}/`;
  const params={mode:'subscription',locale:'de',client_reference_id:attempt.id,customer_email:flow.prefilled_data.email,
    success_url:`${returnUrl}?payment=returned`,cancel_url:`${returnUrl}?payment=cancelled`,
    expires_at:String(attempt.stripe_expires_at),'payment_method_types[0]':'card',billing_address_collection:'required',
    'metadata[onboarding_id]':flow.id,'metadata[attempt_id]':attempt.id,'metadata[application]':'eigenheimverwalter-pilot',
    'subscription_data[metadata][onboarding_id]':flow.id,'subscription_data[metadata][attempt_id]':attempt.id,
    'subscription_data[metadata][application]':'eigenheimverwalter-pilot',
    'line_items[0][price]':TEST_STRIPE_PRICES[flow.partner_type],'line_items[0][quantity]':'1',
    'line_items[0][tax_rates][0]':TEST_STRIPE_PRICES.tax};
  if(quote.additionalQuantity)Object.assign(params,{'line_items[1][price]':TEST_STRIPE_PRICES.additional,
    'line_items[1][quantity]':String(quote.additionalQuantity),'line_items[1][tax_rates][0]':TEST_STRIPE_PRICES.tax});
  return params;
}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()){
  if(!secret?.startsWith('whsec_'))throw onboardingError('STRIPE_WEBHOOK_CONFIGURATION_REQUIRED',503);
  const fields=String(header||'').split(',').map(x=>x.split('='));
  const times=fields.filter(x=>x[0]==='t'),signatures=fields.filter(x=>x[0]==='v1').map(x=>x[1]);
  if(times.length!==1||!/^\d+$/.test(times[0][1])||Math.abs(now/1000-Number(times[0][1]))>300)throw onboardingError('STRIPE_SIGNATURE_INVALID',400);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  for(const signature of signatures){
    if(!/^[a-f0-9]{64}$/.test(signature))continue;
    const bytes=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
    if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${times[0][1]}.${raw}`)))return true;
  }
  throw onboardingError('STRIPE_SIGNATURE_INVALID',400);
}
export function verifyPaidCheckout(flow,attempt,session,lines,subscription){
  const quote=premiumAnnualQuote(flow.partner_type,attempt.postal_codes);
  const wanted=[[TEST_STRIPE_PRICES[flow.partner_type],1],...(quote.additionalQuantity?[[TEST_STRIPE_PRICES.additional,quote.additionalQuantity]]:[])];
  const validLines=Array.isArray(lines.data)&&lines.has_more===false&&lines.data.length===wanted.length&&wanted.every(([id,quantity])=>lines.data.some(l=>l.price?.id===id&&l.quantity===quantity));
  if(session.id!==attempt.checkout_id||session.livemode!==false||session.mode!=='subscription'||session.status!=='complete'||session.payment_status!=='paid'
    ||session.client_reference_id!==attempt.id||session.metadata?.onboarding_id!==flow.id||session.metadata?.attempt_id!==attempt.id
    ||session.currency!=='eur'||session.amount_subtotal!==quote.netCents||session.amount_total!==quote.grossCents||!validLines
    ||subscription.id!==session.subscription||subscription.livemode!==false||subscription.status!=='active'||subscription.metadata?.attempt_id!==attempt.id
    ||!subscription.latest_invoice||subscription.latest_invoice.status!=='paid'||subscription.latest_invoice.amount_paid!==quote.grossCents)
    throw onboardingError('PAYMENT_CONFIRMATION_REQUIRED',409);
  const periods=subscription.items?.data?.map(item=>item.current_period_end)||[];
  if(!periods.length||periods.some(value=>!Number.isSafeInteger(value)||value<=Date.now()/1000))throw onboardingError('SUBSCRIPTION_PERIOD_INVALID',409);
  return {quote,subscriptionId:subscription.id,customerId:session.customer,paidThrough:Math.min(...periods)};
}
