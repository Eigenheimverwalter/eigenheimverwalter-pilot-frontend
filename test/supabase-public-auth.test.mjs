import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../supabase/functions/portal-public/index.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../public/assets/supabase-routes.mjs',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/partner-basic.js',import.meta.url),'utf8');
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

test('full partner invitations activate a scoped Supabase identity',()=>{
  assert.match(source,/pilot_partner_invitation/);assert.match(source,/crafts_partner/);assert.match(source,/broker_partner/);
  assert.match(source,/partner\.invitation\.accepted/);assert.match(source,/identity_imports/);
  assert.match(bridge,/partner-invitations/);
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
  assert.match(authSmoke,/portal-api\/me/);
  assert.match(authSmoke,/portal-api\/dashboard/);
  assert.match(authSmoke,/role-profiles/);
  assert.match(authSmoke,/test "\$acl_status" = '403'/);
  assert.match(authSmoke,/trap cleanup EXIT/);
  assert.match(authSmoke,/auth\/v1\/admin\/users\/\$\{user_id\}/);
  assert.doesNotMatch(authSmoke,/ChangeMe123/);
});
