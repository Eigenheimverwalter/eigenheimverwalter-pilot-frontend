import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');

test('Supabase compatibility reads cover the central portal menus',()=>{
  for(const route of ['/account','/customers','/production/customers','/partners','/assignments','/cases','/sales','/campaigns','/role-profiles','/partner-role-templates','/admin/users','/opportunity-engine','/partner/workbench','/audit','/postal-codes','/portfolio/risks']){
    assert.ok(source.includes(`path==="${route}"`),`${route} fehlt`);
  }
});

test('Partner reads remain property- and partner-scoped',()=>{
  assert.match(source,/scopedProperties/);
  assert.match(source,/propertyIds\.has\(x\.propertyId\)/);
  assert.match(source,/x\.partnerId===partner\?\.id/);
  assert.match(source,/publicRuntimeUser/);
});
