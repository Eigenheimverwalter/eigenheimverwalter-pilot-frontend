import test from 'node:test';
import assert from 'node:assert/strict';
import { brokerStage, calculateBrokerValuation, salesFileCompleteness, brokerRanking } from '../lib/broker-workflow.mjs';

test('Maklerprozess trennt Bewertung, Verkaufsbereit und Mandat', () => {
  assert.equal(brokerStage({status:'review'}, null, null), 'valuation_requested');
  assert.equal(brokerStage({status:'ready'}, null, null), 'sales_ready');
  assert.equal(brokerStage({status:'ready'}, {acceptedAt:'2026-08-01'}, null), 'mandated');
});

test('Verkaufsbereit verlangt Wertermittlung, Adressprüfung und geklärte Dokumente', () => {
  const incomplete=salesFileCompleteness({file:{id:'x'},valuation:{id:'v'},addressVerified:false,checklist:[{status:'uploaded'}]});
  assert.equal(incomplete.complete,false);
  assert.equal(incomplete.percent,75);
  const complete=salesFileCompleteness({file:{id:'x'},valuation:{id:'v'},addressVerified:true,checklist:[{status:'customer_requested'},{status:'not_required'}]});
  assert.equal(complete.complete,true);
  assert.equal(complete.percent,100);
});

test('Maklerkorrektur nutzt Phase-4-Ergebnis ohne dessen Formel zu duplizieren', () => {
  const result=calculateBrokerValuation({value:500000,landArea:400},{marketAdjustmentFactor:1.05,landValuePerSqm:100});
  assert.equal(result.baseMarketValue,500000);
  assert.equal(result.landAdjustment,40000);
  assert.equal(result.adjustedMarketValue,565000);
});

test('Maklerranking priorisiert Mandatierung, Abschluss, Reaktion und Dokumentation', () => {
  const state={salesFiles:[{id:'f',partnerId:'p',completeness:100}],brokerMandates:[{partnerId:'p',acceptedAt:'2026-01-01'}],brokerClosings:[{partnerId:'p',salePrice:700000}],partnerCases:[{partnerId:'p',kind:'sales_mandate',createdAt:'2026-01-01T08:00:00Z',firstViewedAt:'2026-01-01T09:00:00Z'}]};
  const [rank]=brokerRanking([{id:'p',company:'Makler Test'}],state);
  assert.equal(rank.partner,'Makler Test');
  assert.equal(rank.mandateRate,100);
  assert.equal(rank.successRate,100);
  assert.equal(rank.revenue,700000);
});
