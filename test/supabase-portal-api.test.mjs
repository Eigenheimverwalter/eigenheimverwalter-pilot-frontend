import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../supabase/functions/_shared/runtime.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');

test('Supabase Portal API schützt alle Fachdaten durch eine gültige Sitzung',()=>{
  assert.match(runtime,/auth\.getUser\(\)/);
  assert.match(runtime,/Portalprofil nicht eingerichtet oder nicht aktiv/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,300}health/);
});

test('Supabase Portal API stellt den ersten kompatiblen Leseumfang bereit',()=>{
  const reads=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');
  for(const route of ['/me','/dashboard'])assert.ok(source.includes(`routePath === "${route}"`),`${route} muss exakt geroutet werden`);
  for(const route of ['/customers','/partners'])assert.ok(reads.includes(`path==="${route}"`),`${route} fehlt`);
  for(const field of ['openCases','salesFiles','recentCases','properties'])assert.ok(source.includes(field),`${field} fehlt`);
});

test('Partnerdaten werden über Quellidentität und aktive Zuweisungen begrenzt',()=>{
  assert.match(runtime,/identity_imports/);
  assert.match(runtime,/item\.partnerId === partner\.id && item\.status === "active"/);
});

test('Frontend kann kontrolliert zwischen Legacy und Supabase wechseln',()=>{
  const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
  assert.match(bridge,/signInWithPassword/);
  assert.match(bridge,/persistSession:true/);
  assert.match(app,/ehvSupabaseBridge/);
  assert.match(app,/legacyApiBase/);
});

test('Frontend-Assets funktionieren sowohl an der Domainwurzel als auch unter GitHub Pages',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/(?:href|src)="\/(?:assets|runtime-config)/);
  assert.match(html,/\.\/assets\/app\.css\?v=20260903-2/);
});

test('Render-Übergang nutzt den dedizierten Pilot-Mailgateway',()=>{
  const render=fs.readFileSync(new URL('../render.yaml',import.meta.url),'utf8');
  assert.match(render,/key: MAIL_TRANSPORT\s+value: supabase/);
  assert.match(render,/rpniwtshbwjuesoeztyt\.supabase\.co\/functions\/v1\/portal-mail/);
  for(const key of ['SMTP_PARTNER_PASSWORD','SMTP_REGISTRATION_PASSWORD','SMTP_INFO_PASSWORD'])assert.match(render,new RegExp(`key: ${key}\\s+sync: false`));
});

test('Supabase support view is admin-only, read-only and audited',()=>{
  assert.match(source,/support-view\/users/);assert.match(source,/support-view\/start/);assert.match(source,/support-view\/stop/);
  assert.match(source,/x-ehv-support-user/);assert.match(source,/Support-Sicht ist ausschließlich lesend/);
  assert.match(source,/support_view\.started/);assert.match(source,/support_view\.stopped/);
  assert.match(source,/body\.partnerId/);assert.match(source,/identity_imports/);assert.match(source,/auth_user_id/);
  assert.match(source,/resolvePartnerPortalUser/);assert.match(source,/\.ilike\("email", email\)/);
  assert.match(source,/array\(state\.users\)/);assert.match(source,/noch kein aktiver Portal-Login eingerichtet/);
  assert.match(bridge,/ehv-support-target/);
});

test('Super Admin verwaltet interne Zugänge und Support bleibt strikt lesend',()=>{
  assert.match(source,/access-management\/invitations/);
  assert.match(source,/info@eigenheimverwalter\.de/);
  assert.match(source,/staffRoles = \["admin_light", "support_staff"\]/);
  assert.match(source,/Support-Mitarbeiter besitzen ausschließlich Leserechte/);
  assert.match(source,/sendPortalMail\("info",email/);
});
