import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutParameters,verifyStripeSignature,verifyPaidCheckout,stripeClient,TEST_STRIPE_PRICES} from '../supabase/functions/_shared/partner-stripe.mjs';
import {encryptSigningSecret,decryptSigningSecret} from '../supabase/functions/_shared/partner-stripe-configuration.mjs';
const flow={id:'flow',partner_type:'EQUIPMENT_PARTNER',prefilled_data:{email:'test@example.invalid'}};
const attempt={id:'attempt',checkout_id:'cs_test_123',postal_codes:Array.from({length:10},(_,i)=>String(22000+i)),stripe_expires_at:2000000000};
test('webhook signing material is authenticated ciphertext bound to the test key',async()=>{
  const key='sk_test_unit_fixture',secret='whsec_unit_fixture',value=await encryptSigningSecret(secret,key);
  assert.equal(JSON.stringify(value).includes(secret),false);assert.equal(await decryptSigningSecret(value,key),secret);
  await assert.rejects(decryptSigningSecret(value,'sk_test_wrong'));
  await assert.rejects(decryptSigningSecret({...value,ciphertext:'00'+value.ciphertext.slice(2)},key));
});
test('checkout uses fixed annual prices, exact extras, test-only client and stable metadata',()=>{
  const params=checkoutParameters(flow,attempt,'https://eigenheimverwalter.github.io/eigenheimverwalter-pilot-frontend');
  assert.equal(params['line_items[1][quantity]'],'8');assert.equal(params['line_items[0][price]'],TEST_STRIPE_PRICES.EQUIPMENT_PARTNER);
  assert.equal(params['line_items[1][tax_rates][0]'],TEST_STRIPE_PRICES.tax);assert.equal(params.mode,'subscription');
  assert.equal(params['subscription_data[metadata][attempt_id]'],'attempt');assert.equal(params['automatic_tax[enabled]'],undefined);
  assert.throws(()=>stripeClient('sk_live_NOT_A_REAL_SECRET'));
  assert.throws(()=>checkoutParameters(flow,attempt,'https://attacker.invalid'));
  assert.equal(checkoutParameters(flow,{...attempt,postal_codes:['22000','22001']},'https://eigenheimverwalter-pilot.de')['line_items[1][quantity]'],undefined);
});
test('signature verifies raw body; rejects altered payload, old timestamp and missing secret',async()=>{
  const raw='{"type":"checkout.session.completed"}',secret='whsec_unit_test_only',now=Date.now(),timestamp=String(Math.floor(now/1000));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`))).toString('hex');
  const header=`t=${timestamp},v1=${signature}`;
  assert.equal(await verifyStripeSignature(raw,header,secret,now),true);
  await assert.rejects(verifyStripeSignature(raw+' ',header,secret,now));
  await assert.rejects(verifyStripeSignature(raw,header,secret,now+301000));
  await assert.rejects(verifyStripeSignature(raw,header,null,now));
});
test('payment requires paid invoice, exact amount, quantity, owner and test subscription',()=>{
  const session={id:attempt.checkout_id,livemode:false,mode:'subscription',status:'complete',payment_status:'paid',client_reference_id:attempt.id,
    metadata:{onboarding_id:flow.id,attempt_id:attempt.id},currency:'eur',amount_subtotal:153892,amount_total:183131,subscription:'sub_test',customer:'cus_test'};
  const lines={has_more:false,data:[{price:{id:TEST_STRIPE_PRICES.EQUIPMENT_PARTNER},quantity:1},{price:{id:TEST_STRIPE_PRICES.additional},quantity:8}]};
  const subscription={id:'sub_test',livemode:false,status:'active',metadata:{attempt_id:attempt.id},latest_invoice:{status:'paid',amount_paid:183131},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]}};
  assert.equal(verifyPaidCheckout(flow,attempt,session,lines,subscription).quote.additionalQuantity,8);
  for(const patch of [{livemode:true},{amount_total:1},{payment_status:'unpaid'},{client_reference_id:'other'},{subscription:'sub_other'}])assert.throws(()=>verifyPaidCheckout(flow,attempt,{...session,...patch},lines,subscription));
  assert.throws(()=>verifyPaidCheckout(flow,attempt,session,{...lines,data:[lines.data[0]]},subscription));
  assert.throws(()=>verifyPaidCheckout(flow,attempt,session,lines,{...subscription,latest_invoice:{status:'open',amount_paid:0}}));
});
