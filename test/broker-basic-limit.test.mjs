import test from 'node:test';import assert from 'node:assert/strict';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
import {assertBasicBrokerCreation,isBasicBroker} from '../supabase/functions/_shared/broker-basic.mjs';
test('Basic broker: only sales files consume capacity; fourth requested file requires Premium',()=>{
 const partner={id:'b',primaryTradeId:'BROKER',plan:'basic'},state={assignments:[1,2,3,4].map(propertyId=>({propertyId,partnerId:'b',status:'active'})),salesFiles:[1,2,3].map(propertyId=>({propertyId,partnerId:'b',status:'valuation_requested'})),partnerCases:[1,2,3,4].map(propertyId=>({propertyId,partnerId:'b',kind:'sales_mandate'}))};
 assert.equal(isBasicBroker({role:'partner_basic'},partner),true);
 assert.equal(basicPropertyAllowance(state,partner,4).confirmedProperties,3);
 assert.doesNotThrow(()=>assertBasicBrokerCreation(state,partner,1));
 assert.throws(()=>assertBasicBrokerCreation(state,partner,4),{code:'BASIC_SALES_FILE_LIMIT_REACHED'});
 assert.throws(()=>assertBasicBrokerCreation(state,partner,5),{code:'VALUATION_REQUEST_REQUIRED'});
 assert.doesNotThrow(()=>assertBasicBrokerCreation(state,{...partner,plan:'premium'},4));
 assert.equal(basicPropertyAllowance({...state,salesFiles:[]},partner,4).allowed,true);
});
