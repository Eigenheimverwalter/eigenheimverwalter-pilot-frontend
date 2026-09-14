import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/geonames-de-postal-codes.json',import.meta.url),'utf8'));
const expectedStates=['Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg','Hessen','Mecklenburg-Vorpommern','Niedersachsen','Nordrhein-Westfalen','Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thüringen'];

test('GeoNames-Katalog deckt Deutschland vollständig und eindeutig ab',()=>{
  const codes=catalog.entries.map(item=>item.postalCode);
  assert.ok(codes.length>=10000,`nur ${codes.length} PLZ vorhanden`);
  assert.equal(new Set(codes).size,codes.length);
  assert.deepEqual([...new Set(catalog.entries.map(item=>item.state))].sort(),expectedStates.sort());
  assert.ok(catalog.entries.every(item=>/^[0-9]{5}$/.test(item.postalCode)));
  assert.ok(codes.includes('01067')&&codes.includes('10115')&&codes.includes('22041')&&codes.includes('80331'));
});

test('Katalog ist versioniert, nachvollziehbar und für Ortssuche vorbereitet',()=>{
  assert.equal(catalog.metadata.source,'GeoNames');
  assert.equal(catalog.metadata.license,'CC BY 4.0');
  assert.match(catalog.metadata.sourceUrl,/geonames\.org/);
  assert.equal(catalog.metadata.postalCodeCount,catalog.entries.length);
  assert.ok(catalog.entries.every(item=>item.city&&item.placeNames.includes(item.city)&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude)));
});
