import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../supabase/functions/_shared/runtime.ts',import.meta.url),'utf8');

test('Supabase Portal API schützt alle Fachdaten durch eine gültige Sitzung',()=>{
  assert.match(runtime,/auth\.getUser\(\)/);
  assert.match(runtime,/Portalprofil nicht eingerichtet oder nicht aktiv/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,300}health/);
});

test('Supabase Portal API stellt den ersten kompatiblen Leseumfang bereit',()=>{
  const reads=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');
  for(const route of ['/me','/dashboard'])assert.ok(source.includes(`endsWith("${route}")`),`${route} fehlt`);
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
