import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');

test('Supabase Portal API schützt alle Fachdaten durch eine gültige Sitzung',()=>{
  assert.match(source,/auth\.getUser\(\)/);
  assert.match(source,/Portalprofil nicht eingerichtet oder nicht aktiv/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,300}health/);
});

test('Supabase Portal API stellt den ersten kompatiblen Leseumfang bereit',()=>{
  for(const route of ['/me','/dashboard','/customers','/partners'])assert.ok(source.includes(`endsWith("${route}")`),`${route} fehlt`);
  for(const field of ['openCases','salesFiles','recentCases','properties'])assert.ok(source.includes(field),`${field} fehlt`);
});

test('Partnerdaten werden über Quellidentität und aktive Zuweisungen begrenzt',()=>{
  assert.match(source,/identity_imports/);
  assert.match(source,/item\.partnerId === partner\.id && item\.status === "active"/);
});
