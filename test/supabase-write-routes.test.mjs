import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const writes=fs.readFileSync(new URL('../supabase/functions/_shared/write-routes.ts',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');

test('central mutations use the atomic audited runtime function',()=>{
  for(const route of ['/account','/referral/invitations','/assignments','/cases','/valuations','/campaigns','/partners','/customer-invitations'])assert.ok(writes.includes(`path==="${route}"`),`${route} fehlt`);
  assert.match(writes,/await replaceRuntime/);
  assert.match(writes,/allowedProperties\.has/);
  assert.match(api,/writeRoute\(req\.method/);
});

test('customer invitations use expiring hashed tokens and registration mail',()=>{
  assert.match(writes,/tokenHash:await digest/);assert.match(writes,/expiresAt/);
  assert.match(writes,/sendPortalMail\("registration"/);assert.match(bridge,/siteUrl=location\.origin/);
});

test('dynamic entity writes are routed to Supabase',()=>{
  assert.match(bridge,/dynamicSupported/);
  assert.match(bridge,/cases\|partners\|equipment/);
  assert.ok(bridge.includes("'/api/valuations'"));
});

test('service, broker and opportunity workflows persist through Supabase',()=>{
  for(const fragment of ['service-records','document-status','address-verification','mandate','closing','release','customer-actions','partner-opportunities']){
    assert.ok(writes.includes(fragment),`${fragment} fehlt in den Schreibregeln`);
    assert.ok(bridge.includes(fragment),`${fragment} fehlt in der Frontend-Weiterleitung`);
  }
  assert.match(writes,/allowedProperties\.has/);
  assert.match(writes,/profile\.role!=="broker_partner"/);
});
