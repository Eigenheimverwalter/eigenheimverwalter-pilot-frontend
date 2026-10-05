import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync(new URL('../assets/management-ui.js',import.meta.url),'utf8');

test('Eigenheime und Kunden stehen zuerst und öffnen ohne Zwischenhub',()=>{
  assert.match(ui,/order=\['homes','company','partners'/);
  assert.match(ui,/homes:\{page:'production',route:'\/production\/customers'\}/);
  assert.match(ui,/\['production','Eigenheime & Kunden'\]/);
  assert.doesNotMatch(ui,/\['managementHomesHub','Eigenheime & Kunden'\]/);
});

test('Dashboard-KPIs besitzen direkte korrespondierende Ziele',()=>{
  for(const route of ['/production/customers','/direct/partners','/management/sales-intelligence','/direct/cases','/management/broker','/management/opportunities'])assert.ok(ui.includes(route),`${route} fehlt`);
});
