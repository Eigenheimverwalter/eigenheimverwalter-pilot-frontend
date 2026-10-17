import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimeSource=fs.readFileSync(new URL('../runtime-config.js',import.meta.url),'utf8');
const context={window:{},location:{hostname:'eigenheimverwalter-pilot.de',pathname:'/',search:'',hash:'',replace(){}}};
vm.runInNewContext(runtimeSource,context);
const config=context.window.__EHV_RUNTIME__;

test('production is configured for ALL-INKL only',()=>{
  assert.equal(config.authMode,'allinkl');
  assert.equal(config.apiMode,'allinkl');
  assert.equal(config.coreApiBase,'https://api.eigenheimverwalter.de');
  assert.equal(config.portalProxy,'./portal-api.php');
  assert.doesNotMatch(runtimeSource,/supabase/i);
});

test('dashboard is handled by the same-origin ALL-INKL bridge',()=>{
  const bridge=fs.readFileSync(new URL('../assets/allinkl-bridge.js',import.meta.url),'utf8');
  assert.match(bridge,/handles\(\)\{return true\}/);
  assert.match(bridge,/\/api\/v1\/portal/);
  assert.doesNotMatch(bridge,/supabase/i);
});
