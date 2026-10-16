import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {apiBackendFor,allinklApiUrl} from '../assets/api-migration-routing.mjs';

const runtimeSource=fs.readFileSync(new URL('../runtime-config.js',import.meta.url),'utf8');
const context={
  window:{},
  location:{
    hostname:'eigenheimverwalter-pilot.de',
    pathname:'/',
    search:'',
    hash:'',
    replace(){},
  },
};
vm.runInNewContext(runtimeSource,context);
const config=context.window.__EHV_RUNTIME__;

test('dashboard remains on the implemented Supabase portal route',()=>{
  assert.equal(apiBackendFor('/api/dashboard',config),'supabase');
  assert.equal(config.allinklRoutes.includes('/api/dashboard'),false);
});

test('existing migrated routes remain on the ALL-INKL portal API',()=>{
  assert.equal(apiBackendFor('/api/production/customers/123',config),'allinkl');
  assert.equal(allinklApiUrl('/api/production/customers/123',config),'https://api.eigenheimverwalter.de/api/v1/portal/production/customers/123');
});

test('valuation preview remains on Supabase and is not sent to Laravel',()=>{
  assert.equal(apiBackendFor('/api/admin/valuation-preview/123',config),'supabase');
});
