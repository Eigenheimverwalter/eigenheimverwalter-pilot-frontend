import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {premiumAnnualQuote,PREMIUM_ANNUAL_PRICES,INCLUDED_POSTAL_CODES,MAX_ADDITIONAL_POSTAL_CODES,MAX_POSTAL_CODES} from '../supabase/functions/_shared/partner-onboarding.mjs';

test('eine zentrale Preisregel liefert die aktuellen Jahrespreise',()=>{
  assert.deepEqual(PREMIUM_ANNUAL_PRICES,{EQUIPMENT_PARTNER:49900,BROKER_PARTNER:97900,ADDITIONAL_POSTAL_CODE:12999,TAX_PERCENT:19});
  assert.equal(INCLUDED_POSTAL_CODES,2);assert.equal(MAX_ADDITIONAL_POSTAL_CODES,8);assert.equal(MAX_POSTAL_CODES,10);
  assert.equal(premiumAnnualQuote('EQUIPMENT_PARTNER',Array.from({length:10},(_,i)=>String(22000+i))).netCents,153892);
  assert.equal(premiumAnnualQuote('BROKER_PARTNER',Array.from({length:10},(_,i)=>String(22000+i))).netCents,201892);
});

test('Stripe-Aktivierung speichert den belastbaren Jahreswert für ARR',()=>{
  const route=readFileSync(new URL('../supabase/functions/_shared/partner-checkout-route.ts',import.meta.url),'utf8');
  for(const field of ['paymentStatus','annualNetCents','baseAnnualNetCents','additionalPostalCodeCount','additionalPostalCodeAnnualNetCents'])assert.match(route,new RegExp(field));
  assert.doesNotMatch(route,/baseNetCents:flow\.partner_type==='BROKER_PARTNER'/);
});
