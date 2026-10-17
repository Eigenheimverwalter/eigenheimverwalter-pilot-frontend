import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge=fs.readFileSync(new URL('../assets/allinkl-bridge.js',import.meta.url),'utf8');
const proxy=fs.readFileSync(new URL('../portal-api.php',import.meta.url),'utf8');

test('production login and session use only the ALL-INKL portal proxy',()=>{
  assert.match(bridge,/portal-api\.php/);
  assert.match(bridge,/\/api\/v1\/portal\/auth\/login/);
  assert.match(bridge,/\/api\/v1\/portal\/auth\/session/);
  assert.match(proxy,/https:\/\/api\.eigenheimverwalter\.de/);
  assert.doesNotMatch(bridge,/supabase/i);
  assert.doesNotMatch(proxy,/supabase/i);
});
