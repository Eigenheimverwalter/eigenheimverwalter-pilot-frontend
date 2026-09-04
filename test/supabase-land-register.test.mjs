import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOwners,compareValue,extractLandRegister} from '../supabase/functions/_shared/land-register.mjs';

test('Supabase parser extracts section I, parcel and address from browser OCR text',()=>{
  const fields=extractLandRegister(`Grundbuch von Borstel Blatt 410\nBestandsverzeichnis\n1 Borstel 3 038/7 Gebäude- und Freifläche, Quickborner Str. 19, 25494 Borstel-Hohenraden\nErste Abteilung\n1 Antonio da Silva, geb. 1980\nZweite Abteilung`);
  assert.equal(fields.landRegisterSheet,'410');
  assert.equal(fields.parcel,'038/7');
  assert.match(fields.address,/Quickborner/i);
  assert.equal(fields.owners[0],'Antonio da Silva');
});

test('Supabase comparison keeps owner, address and parcel decisions separate',()=>{
  assert.equal(compareOwners(['Antonio da Silva'],'Antonio da Silva').atLeastOneMatch,true);
  assert.equal(compareValue('Quickborner Str. 19, 25494 Borstel-Hohenraden','Quickborner Str. 19, 25494 Borstel-Hohenraden').status,'match');
  assert.equal(compareValue('038/7','038/7').status,'match');
});
