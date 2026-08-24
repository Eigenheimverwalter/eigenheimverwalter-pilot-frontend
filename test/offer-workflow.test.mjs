import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptPartnerOffer} from '../lib/offer-workflow.mjs';

const state=()=>({
  partnerOffers:[{id:'offer-1',propertyId:'property-1',partnerId:'partner-1',name:'Angebot Heizung.pdf',status:'submitted'}],
  properties:[{id:'property-1',customerId:'customer-1'}],
  partners:[{id:'partner-1',userId:'partner-user-1',email:'partner@example.test',status:'active'}],
  emailOutbox:[],notifications:[]
});

test('Kundenannahme setzt verbindlichen Status und benachrichtigt die Partneradresse',()=>{
  const data=state(),result=acceptPartnerOffer(data,{offerId:'offer-1',customerId:'customer-1',now:'2026-08-23T12:00:00.000Z',id:prefix=>`${prefix}-1`});
  assert.equal(result.error,undefined);
  assert.equal(result.offer.status,'accepted');
  assert.equal(result.offer.acceptedAt,'2026-08-23T12:00:00.000Z');
  assert.equal(data.emailOutbox[0].to,'partner@example.test');
  assert.equal(data.emailOutbox[0].status,'queued');
  assert.equal(data.notifications[0].userId,'partner-user-1');
});

test('Wiederholte Kundenannahme ist idempotent und erzeugt keine zweite E-Mail',()=>{
  const data=state(),args={offerId:'offer-1',customerId:'customer-1',id:prefix=>`${prefix}-1`};
  acceptPartnerOffer(data,args);const result=acceptPartnerOffer(data,args);
  assert.equal(result.idempotent,true);
  assert.equal(data.emailOutbox.length,1);
});

test('Fremder Kunde darf ein Angebot nicht annehmen',()=>{
  const data=state(),result=acceptPartnerOffer(data,{offerId:'offer-1',customerId:'customer-2'});
  assert.equal(result.error,'customer_mismatch');
  assert.equal(data.emailOutbox.length,0);
});
