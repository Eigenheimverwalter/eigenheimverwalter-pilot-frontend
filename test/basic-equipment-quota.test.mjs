import {test} from 'node:test';
import assert from 'node:assert/strict';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
test('fourth craft file requires premium, referrals and foreign trades never count',()=>{
 const partner={id:'p',plan:'basic',primaryTradeId:'HEATING'};
 const state={assignments:[1,2,3,4].map(n=>({partnerId:'p',propertyId:String(n),status:'active'})),equipmentRecords:[],referralLeads:Array.from({length:50},(_,n)=>({partnerId:'p',propertyId:String(n),status:'won',sourceInvitationId:String(n)}))};
 assert.equal(basicPropertyAllowance(state,partner,'4').allowed,true);
 state.equipmentRecords=[1,2,3].map(n=>({propertyId:String(n),tradeId:'HEATING',status:'draft'}));
 assert.equal(basicPropertyAllowance(state,partner,'4').allowed,false);
 assert.equal(basicPropertyAllowance(state,partner,'1').allowed,true);
 state.equipmentRecords.push({propertyId:'4',tradeId:'ROOF'},{propertyId:'foreign',tradeId:'HEATING'});
 assert.equal(basicPropertyAllowance(state,partner,'4').confirmedProperties,3);
 assert.equal(basicPropertyAllowance(state,{...partner,plan:'premium'},'4').allowed,true);
});
