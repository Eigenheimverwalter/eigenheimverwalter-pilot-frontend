import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerMembershipLabel} from '../public/assets/partner-membership.mjs';
test('membership display uses the paid plan independently of the legacy Basic role',()=>{
 assert.equal(partnerMembershipLabel({plan:'premium',tradeId:'EQUIP_HEIZUNG',tradeName:'Heizung',role:'partner_basic'}),'Premium-Partner Heizung');
 assert.equal(partnerMembershipLabel({plan:'basic',tradeId:'EQUIP_HEIZUNG',tradeName:'Heizung'}),'Basic-Partner Heizung');
 assert.equal(partnerMembershipLabel({plan:'premium',tradeId:'BROKER'}),'Premium-Partner Makler');
 assert.equal(partnerMembershipLabel({plan:'basic',tradeId:'BROKER'}),'Basic-Partner Makler');
 assert.equal(partnerMembershipLabel({plan:'premium',referralOnly:true}),'Tippgeber');
});
