import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../supabase/functions/portal-public/index.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../public/assets/supabase-routes.mjs',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/partner-basic.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');
const referral=fs.readFileSync(new URL('../public/assets/referral.js',import.meta.url),'utf8');
const customerRegistration=fs.readFileSync(new URL('../public/assets/customer-registration.js',import.meta.url),'utf8');
const authConfig=fs.readFileSync(new URL('../scripts/configure-pilot-auth.sh',import.meta.url),'utf8');
const authSmoke=fs.readFileSync(new URL('../scripts/smoke-pilot-auth.sh',import.meta.url),'utf8');

test('public registration uses Supabase Auth and registration mail without storing passwords',()=>{
  assert.match(source,/auth\.admin\.generateLink\(\{type:"signup"/);
  assert.match(source,/channel:"registration"/);
  assert.doesNotMatch(source,/passwordHash/);
  assert.match(source,/identity_imports/);
  assert.match(source,/replace_portal_runtime_state/);
});

test('public referral and customer invitation flows are Supabase-native',()=>{
  for(const fragment of ['referrals','partnerReferralInvitations','customer-registration','customerInvitations','partner-invitations','partnerInvitations'])assert.ok(source.includes(fragment));
  assert.match(source,/referral\.invitation\.accepted/);assert.match(source,/customer\.registration\.completed/);
  assert.match(referral,/supabase-bridge/);assert.match(customerRegistration,/supabase-bridge/);
  assert.doesNotMatch(referral,/await fetch\(path/);assert.doesNotMatch(customerRegistration,/await fetch\(path/);
  assert.match(source,/registrationCompleted:true/);assert.match(source,/snapshot\.state\.customers/);assert.match(source,/snapshot\.state\.properties/);
  assert.match(source,/auth\.admin\.deleteUser/);
});

test('legacy partner invitations cannot activate without central legal onboarding',()=>{
  assert.match(source,/ältere Einladung kann aus Sicherheitsgründen nicht mehr direkt aktiviert/);
  assert.doesNotMatch(source,/partner\.invitation\.accepted/);
  assert.match(bridge,/partner-invitations/);
});

test('public invitation flow waits for the Supabase bridge and does not fall back to GitHub API paths',()=>{
  assert.match(ui,/await import\('\.\/supabase-bridge\.js'\)/);
  assert.match(ui,/if\(window\.__EHV_RUNTIME__\?\.authMode==='supabase'\)throw Error\('Die sichere Portalverbindung/);
  assert.match(bridge,/if\(isPublicPath\(path\)\)\{[\s\S]*?const supabase=await getClient\(\)/);
});

test('Basic partner confirmation activates runtime state and failed registration is compensated',()=>{
  const api=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
  assert.match(api,/partner_basic\.email_confirmed/);
  assert.match(api,/user\.email_confirmed_at/);
  assert.match(source,/auth\.admin\.deleteUser/);
  assert.match(source,/identity_imports"\)\.delete/);
});

test('public auth routes are origin-limited and routed without Render',()=>{
  assert.match(source,/allowedOrigin/);assert.match(source,/type:"recovery"/);
  assert.match(bridge,/portal-public/);assert.match(bridge,/isPublicPath/);
  assert.match(ui,/ehvSupabaseBridge/);assert.match(ui,/updatePassword/);
  assert.match(workflow,/portal-public/);
});

test('Supabase responses echo only allow-listed browser origins',()=>{
  const cors=fs.readFileSync(new URL('../supabase/functions/_shared/cors.ts',import.meta.url),'utf8');
  const portalApi=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
  const documentApi=fs.readFileSync(new URL('../supabase/functions/document-api/index.ts',import.meta.url),'utf8');
  assert.match(cors,/req\?\.headers\.get\("Origin"\)/);
  assert.match(cors,/host === "eigenheimverwalter\.github\.io"/);
  assert.doesNotMatch(cors,/endsWith\("\.github\.io"\)/);
  assert.doesNotMatch(cors,/endsWith\("\.onrender\.com"\)/);
  assert.match(cors,/if \(origin\) headers\["Access-Control-Allow-Origin"\] = origin/);
  assert.match(cors,/"Vary": "Origin"/);
  assert.match(portalApi,/corsHeaders\(req\)/);
  assert.match(source,/corsHeaders\(req\)/);
  assert.match(documentApi,/corsHeaders\(req\)/);
});

test('GitHub Pages auth redirects stay inside the Pilot project path',()=>{
  assert.match(source,/redirectBase/);
  assert.match(source,/eigenheimverwalter-pilot-frontend/);
  assert.match(source,/redirectTo:redirectBase\(origin\)/);
  assert.match(source,/redirectTo:`\$\{redirectBase\(origin\)\}\/passwort-zuruecksetzen`/);
});

test('password recovery UI recognizes the GitHub Pages project path',()=>{
  assert.match(ui,/pathname\.split\('\/'\)\.filter\(Boolean\)\.at\(-1\)===['"]passwort-zuruecksetzen['"]/);
  assert.doesNotMatch(ui,/pathname===['"]\/passwort-zuruecksetzen['"]/);
  assert.match(ui,/ehvSupabaseBridge\.updatePassword/);
});

test('Supabase login is handled once without a forced reload loop',()=>{
  assert.match(ui,/event\.target\.id!==['"]login-form['"]\|\|window\.ehvSupabaseBridge\?\.enabled/);
  assert.match(app,/\$\('#login-form'\)\.onsubmit=[\s\S]*setup\(d\.user,d\.csrf,d\.supportView\)/);
});

test('CI configures only the concrete Pilot GitHub Pages auth path',()=>{
  assert.match(workflow,/bash scripts\/configure-pilot-auth\.sh/);
  assert.match(authConfig,/eigenheimverwalter\.github\.io\/eigenheimverwalter-pilot-frontend/);
  assert.match(authConfig,/passwort-zuruecksetzen/);
  assert.match(authConfig,/\$site\+"\/\*\*"/);
  assert.doesNotMatch(authConfig,/https:\/\/\*\*\.github\.io/);
  assert.match(authConfig,/current.*uri_allow_list/);
});

test('CI proves a real Supabase login and cleans its scoped smoke identity',()=>{
  assert.match(workflow,/bash scripts\/smoke-pilot-auth\.sh/);
  assert.match(authSmoke,/grant_type=password/);
  assert.match(authSmoke,/admin\/generate_link/);
  assert.match(authSmoke,/type:\"recovery\"/);
  assert.match(authSmoke,/auth\/v1\/verify/);
  assert.match(authSmoke,/auth\/v1\/user/);
  assert.match(authSmoke,/portal-api\/me/);
  assert.match(authSmoke,/portal-api\/dashboard/);
  assert.match(authSmoke,/role-profiles/);
  assert.match(authSmoke,/test "\$acl_status" = '403'/);
  assert.match(authSmoke,/document-api/);
  assert.match(authSmoke,/createSignedUrl|signed_url/);
  assert.match(authSmoke,/storage\/v1\/object/);
  assert.match(authSmoke,/documents\?id=eq/);
  assert.match(authSmoke,/PILOT_MAIL_SMOKE_RECIPIENT/);
  assert.match(authSmoke,/for channel in partner registration info/);
  assert.match(authSmoke,/\.delivery\.status==\"sent\"/);
  assert.match(authSmoke,/trap cleanup EXIT/);
  assert.match(authSmoke,/auth\/v1\/admin\/users\/\$\{user_id\}/);
  assert.doesNotMatch(authSmoke,/ChangeMe123/);
});
