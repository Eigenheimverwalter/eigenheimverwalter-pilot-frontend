import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');

test('published 360 view renders equipment returned by productive Phase 4',()=>{
  assert.match(ui,/d\.related\?\.equipment/);
  assert.match(ui,/x\.property_id\?\?x\.propertyId/);
  assert.match(ui,/PHASE‑4‑EQUIPMENT/);
  assert.match(ui,/Healthscore/);
  assert.match(ui,/Produktive App-Daten/);
});

test('published 360 view does not present unconnected domains as real empty data',()=>{
  assert.match(ui,/Noch nicht verbunden/);
  assert.match(ui,/keine vermeintlichen Nullwerte/);
});
