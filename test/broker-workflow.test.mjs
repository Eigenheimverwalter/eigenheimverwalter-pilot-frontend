import test from 'node:test';
import assert from 'node:assert/strict';
import { brokerStage, buildBrokerValuationModel, calculateBrokerValuation, salesFileCompleteness, brokerRanking } from '../lib/broker-workflow.mjs';

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

const completeValuation={propertyType:'Einfamilienhaus',livingArea:140,landArea:400,year:2000,basement:'true',landValuePerSqm:100,generalCondition:'good',technicalCondition:'medium',energeticCondition:'medium',documentationCondition:'good',marketAdjustmentFactor:1.05,valuationDate:'2026-08-30'};

test('Maklerbewertung blockiert bei fehlenden fachlichen Pflichtangaben', () => {
  const result=buildBrokerValuationModel({type:'Einfamilienhaus',area:140,year:2000},{landArea:400});
  assert.equal(result.complete,false);
  assert.ok(result.missingRequired.includes('landValuePerSqm'));
  assert.ok(result.missingRequired.includes('technicalCondition'));
  assert.equal(result.calculation,null);
});

test('Korrigiertes Sachwertmodell indexiert Gebäude und trennt Bodenwert nachvollziehbar', () => {
  const result=calculateBrokerValuation({value:500000,type:'Einfamilienhaus',area:140,landArea:400,year:2000,basement:true},completeValuation);
  assert.equal(result.complete,true);
  assert.equal(result.baseMarketValue,500000);
  assert.equal(result.landAdjustment,40000);
  assert.equal(result.calculation.constructionIndex.factor,151/90);
  assert.equal(result.adjustedMarketValue,Math.round((result.calculation.buildingValue+40000)*1.05));
});

test('Health Score ist nur Plausibilitätshinweis und verändert den Preis nicht automatisch', () => {
  const low=calculateBrokerValuation({type:'Einfamilienhaus',area:140,landArea:400,year:2000,basement:true},completeValuation,{healthEvidence:{available:true,score:20,status:'critical'}});
  const high=calculateBrokerValuation({type:'Einfamilienhaus',area:140,landArea:400,year:2000,basement:true},completeValuation,{healthEvidence:{available:true,score:95,status:'stable'}});
  assert.equal(low.adjustedMarketValue,high.adjustedMarketValue);
  assert.equal(low.healthPlausibility.priceImpact,0);
});

test('Maklerranking priorisiert Mandatierung, Abschluss, Reaktion und Dokumentation', () => {
  const state={salesFiles:[{id:'f',partnerId:'p',completeness:100}],brokerMandates:[{partnerId:'p',acceptedAt:'2026-01-01'}],brokerClosings:[{partnerId:'p',salePrice:700000}],partnerCases:[{partnerId:'p',kind:'sales_mandate',createdAt:'2026-01-01T08:00:00Z',firstViewedAt:'2026-01-01T09:00:00Z'}]};
  const [rank]=brokerRanking([{id:'p',company:'Makler Test'}],state);
  assert.equal(rank.partner,'Makler Test');
  assert.equal(rank.mandateRate,100);
  assert.equal(rank.successRate,100);
  assert.equal(rank.revenue,700000);
});
