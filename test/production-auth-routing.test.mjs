import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge=fs.readFileSync(new URL('../assets/supabase-bridge.js',import.meta.url),'utf8');

test('production login uses the deployed portal auth proxy and validates its session',()=>{
  assert.match(bridge,/fetch\('\.\/portal-auth\.php'/);
  assert.match(bridge,/allinklAuthUrl\('session'\)/);
  assert.doesNotMatch(bridge,/allinklAuthUrl\('login'\)/);
});
