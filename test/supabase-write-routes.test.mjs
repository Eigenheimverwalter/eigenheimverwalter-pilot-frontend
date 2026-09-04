import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const writes=fs.readFileSync(new URL('../supabase/functions/_shared/write-routes.ts',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');

test('central mutations use the atomic audited runtime function',()=>{
  for(const route of ['/assignments','/cases','/valuations','/campaigns','/partners'])assert.ok(writes.includes(`path==="${route}"`),`${route} fehlt`);
  assert.match(writes,/await replaceRuntime/);
  assert.match(writes,/allowedProperties\.has/);
  assert.match(api,/writeRoute\(req\.method/);
});

test('dynamic entity writes are routed to Supabase',()=>{
  assert.match(bridge,/dynamicSupported/);
  assert.match(bridge,/cases\|partners\|equipment/);
  assert.ok(bridge.includes("'/api/valuations'"));
});
