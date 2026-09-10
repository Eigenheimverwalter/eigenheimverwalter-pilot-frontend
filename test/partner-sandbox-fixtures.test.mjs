import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPartnerSandbox,planSandboxCleanup} from '../scripts/partner-sandbox-fixtures.mjs';
import {basicPropertyAllowance} from '../supabase/functions/_shared/partner-onboarding.mjs';
import {confirmPartnerReferral} from '../supabase/functions/_shared/referral-confirmation.mjs';
test('sandbox has two- and three-property Basic scenarios; fourth queues through real domain flow',()=>{
  const {state,scenarios,manifest}=buildPartnerSandbox();
  assert.deepEqual(scenarios.map(s=>s.confirmedProperties),[2,3,3]);
  for(const scenario of scenarios){
    const partner=state.partners.find(p=>p.id===scenario.partnerId),item=state.partnerReferralInvitations.find(i=>i.id===scenario.nextInvitationId);
    assert.equal(basicPropertyAllowance(state,partner).confirmedProperties,scenario.confirmedProperties);
    const result=confirmPartnerReferral(state,{partner,item,trade:state.trades.find(t=>t.id===partner.primaryTradeId),body:{accepted:true,emailConfirmed:true,addressConfirmed:true},identifier:()=>crypto.randomUUID(),onboardingEnabled:true});
    assert.equal(result.upgradeRequired,scenario.confirmedProperties===3);
  }
  assert.equal(manifest.authUserIds.length,0);assert.equal(manifest.stripeObjects.length,0);
  assert.ok(planSandboxCleanup(state,manifest).blockers.length>0,'New test activity requires renewed inventory, never broad deletion');
});
test('cleanup only plans exact marked records and never mutates state',()=>{
  const {state,manifest}=buildPartnerSandbox();state.customers.push({id:'real',email:'real@example.invalid'});
  const before=JSON.stringify(state),plan=planSandboxCleanup(state,manifest);
  assert.equal(plan.canDeleteRuntime,true);assert.equal(plan.dryRun,true);assert.ok(!plan.targets.some(t=>t.id==='real'));assert.equal(JSON.stringify(state),before);
});
test('changed markers and mixed real references block cleanup',()=>{
  const {state,manifest}=buildPartnerSandbox();
  state.properties.push({id:'real-property',customerId:state.customers[0].id});
  assert.equal(planSandboxCleanup(state,manifest).canDeleteRuntime,false);
  state.partners[0].dataClass='production';assert.throws(()=>planSandboxCleanup(state,manifest),/OWNERSHIP/);
});
test('separate sandbox runs have disjoint IDs and no live payments or legal evidence',()=>{
  const a=buildPartnerSandbox(),b=buildPartnerSandbox();
  assert.ok(a.manifest.records.every(r=>!b.manifest.records.some(s=>s.id===r.id)));
  assert.ok(a.state.partners.every(p=>p.plan==='basic'&&p.email.endsWith('@example.invalid')));
  assert.equal(a.state.legalAcceptances,undefined);assert.equal(a.state.subscriptions,undefined);
});
