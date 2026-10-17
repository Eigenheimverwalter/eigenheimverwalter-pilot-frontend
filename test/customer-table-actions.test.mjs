import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../assets/features.css', import.meta.url), 'utf8');

test('die 360-Grad-Aktion steht direkt in der ersten Kundenspalte', () => {
  assert.match(app, /<th>Kunde \/ Akte<\/th>/);
  assert.match(app, /customer-primary-cell[\s\S]{0,500}customer-inline-action/);
  assert.doesNotMatch(app, /<th>Adressprüfung<\/th><th><\/th>/);
});

test('die Kundenakte bleibt auch beim horizontalen Scrollen erreichbar', () => {
  assert.match(features, /\.customer-table th:first-child,\.customer-table td:first-child\{position:sticky;left:0/);
  assert.match(features, /\.customer-inline-action\{display:block/);
});

test('die Bewertungsprüfung liegt ausschließlich in der 360-Grad-Verkaufsakte', () => {
  const productionOverview = app.slice(app.indexOf('const productionPage='), app.indexOf('async function openAdminValuationPreview'));
  const start = app.lastIndexOf("if(tab==='sales')return");
  const customerView = app.slice(start, app.indexOf("if(tab==='service')return", start));

  assert.doesNotMatch(productionOverview, /valuation-preview/);
  assert.match(customerView, /class="valuation-submenu"/);
  assert.match(customerView, /<summary>Bewertung prüfen<\/summary>/);
  assert.match(customerView, /class="outline admin-valuation-preview"/);
});

test('aktive Kunden und offene Registrierungen werden getrennt dargestellt', () => {
  assert.match(app, /Aktive Kunden/);
  assert.match(app, /Offene Registrierungen/);
  assert.match(app, /customer-account-filter/);
  assert.match(app, /data-account-status/);
});
