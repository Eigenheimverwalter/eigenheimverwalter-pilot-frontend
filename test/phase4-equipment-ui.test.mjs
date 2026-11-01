import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');

test('published 360 view renders equipment returned by the productive app backend without internal labels',()=>{
  assert.match(ui,/d\.related\?\.equipment/);
  assert.match(ui,/x\.property_id\?\?x\.propertyId/);
  assert.match(ui,/ANLAGENKOMPONENTEN/);
  assert.doesNotMatch(ui,/ANLAGENKOMPONENTEN AUS PHASE 4/);
  assert.match(ui,/Zustandsbewertung vorhanden/);
  assert.match(ui,/Produktive App-Daten/);
  assert.match(ui,/instance_label/);
  assert.match(ui,/equipment-live-toggle/);
  assert.match(ui,/renderEquipmentCockpit\(name,'equipment',selected\?\.id\|\|''\)/);
  assert.match(ui,/ehvAdminServiceCare\?\.mount\(p\.id,name\)/);
  assert.match(ui,/x\?\.is_present\?\?x\?\.isPresent/);
  assert.match(ui,/&&present\(x\)/);
});

test('background refresh preserves an open customer cockpit',()=>{
  assert.match(ui,/productionCustomerId/);
  assert.match(ui,/renderProductionCustomer\(state\.productionCustomerId,\{preserveContext:true\}\)/);
  assert.match(ui,/LIVE_REFRESH_MS/);
});

test('published 360 view does not present unconnected domains as real empty data',()=>{
  assert.match(ui,/Noch nicht verbunden/);
  assert.match(ui,/keine vermeintlichen Nullwerte/);
});

test('published 360 view renders service records and both document classes without internal labels',()=>{
  assert.match(ui,/equipment_service_records/);
  assert.match(ui,/equipment_documents/);
  assert.match(ui,/SERVICEAKTE/);
  assert.match(ui,/IMMOBILIENDOKUMENTE/);
  assert.match(ui,/ANLAGENDOKUMENTE/);
  assert.match(ui,/propertyDocuments/);
  assert.doesNotMatch(ui,/SERVICEHEFT AUS PHASE 4/);
  assert.doesNotMatch(ui,/EQUIPMENT-DOKUMENTE AUS PHASE 4/);
  assert.match(ui,/phase4-document-open/);
});
