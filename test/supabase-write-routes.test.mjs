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
  assert.match(writes,/mailAfterCommit=\{channel:"registration"/);assert.match(bridge,/siteUrl=location\.origin/);
  assert.ok(writes.indexOf('await replaceRuntime')<writes.lastIndexOf('await sendPortalMail'),'Mailversand muss nach atomarer Speicherung erfolgen');
});

test('partner creation validates a single trade and persists invitation before partner mail',()=>{
  assert.match(writes,/Pro Partnerkonto muss genau ein Gewerk/);assert.match(writes,/partnerInvitations/);
  assert.match(writes,/channel:"partner"/);assert.match(bridge,/\['\/api\/customer-invitations','\/api\/referral\/invitations','\/api\/partners'\]/);
});

test('partner license changes enforce catalog, exclusivity and reservation extension',()=>{
  assert.match(writes,/applyPartnerLicenseChange/);assert.match(writes,/reservation_date_required/);
  assert.match(writes,/partner\.license\.updated/);assert.match(writes,/partnerLicenseSummary/);
});

test('partner and administrative test mail use the Supabase gateway channels',()=>{
  assert.match(writes,/partner\.email\.queued/);assert.match(writes,/\/system\/mail-test/);
  assert.match(writes,/Nur Admin Plus darf Testmails/);assert.match(bridge,/system\/mail-test/);
  assert.match(bridge,/partners\\\/\[\^\/\]\+\\\/email/);
});

test('trigger configuration and event processing are Supabase-native',()=>{
  assert.match(writes,/processTriggerEvent/);assert.match(writes,/\/trigger-definitions/);assert.match(writes,/\/trigger-events/);
  assert.match(writes,/trigger_event\.processed/);assert.match(bridge,/trigger-definitions/);assert.match(bridge,/trigger-events/);
});

test('production customer edits, soft deletion and restore are Supabase-native',()=>{
  assert.match(writes,/\/production\/customers\/restore-all/);
  assert.match(writes,/productionCustomerDeletions/);
  assert.match(writes,/production\.customer\.updated/);
  assert.match(writes,/production\.customer\.deleted/);
  for(const field of ['first_name','last_name','phone_number','postal_code'])assert.ok(writes.includes(`"${field}"`),`${field} muss im App-Exportformat erhalten bleiben`);
  assert.ok(bridge.includes("'/api/production/customers/restore-all'"));
  assert.match(bridge,/production\\\/customers\\\/\[\^\/\]\+/);
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

test('equipment writes enforce the authoritative form matrix',()=>{
  assert.match(writes,/normalizeEquipmentFields/);assert.match(writes,/requiredComplete/);
  assert.match(writes,/equipment\.specification\.created/);assert.match(writes,/channel:"app_push"/);
});
