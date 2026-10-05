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
