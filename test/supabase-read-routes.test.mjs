import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');

test('Supabase compatibility reads cover the central portal menus',()=>{
  for(const route of ['/account','/customers','/production/customers','/partners','/assignments','/cases','/sales','/campaigns','/role-profiles','/partner-role-templates','/admin/users','/opportunity-engine','/partner/workbench','/audit','/postal-codes','/portfolio/risks','/admin-light-dashboard','/broker-dashboard','/broker/customers','/partner-coverage','/partner-geography','/customer-coverage']){
    assert.ok(source.includes(`path==="${route}"`),`${route} fehlt`);
    assert.ok(bridge.includes(`'/api${route}'`),`${route} ist im Frontend nicht aktiviert`);
  }
});

test('Query parameters do not bypass the Supabase route selection',()=>{
  assert.match(bridge,/split\('\?'\)\[0\]/);
  assert.match(bridge,/supported\.has\(normalizedPath\(path\)\)/);
});

test('Partner reads remain property- and partner-scoped',()=>{
  assert.match(source,/scopedProperties/);
  assert.match(source,/propertyIds\.has\(x\.propertyId\)/);
  assert.match(source,/x\.partnerId===partner\?\.id/);
  assert.match(source,/publicRuntimeUser/);
});

test('customer, equipment and broker detail views are Supabase-native',()=>{
  for(const fragment of ['productionCustomerId','equipmentId','brokerFileId'])assert.ok(source.includes(fragment));
  assert.match(bridge,/production\\\/customers/);
  assert.match(bridge,/properties\\\/\[\^\/\]\+\\\/equipment/);
});
