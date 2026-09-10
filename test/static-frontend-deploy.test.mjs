import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const builder=fs.readFileSync(new URL('../scripts/build-static-frontend.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');

test('ALL-INKL frontend build is Supabase-only and keeps SPA routes',()=>{
  assert.match(builder,/authMode:'supabase'/);
  assert.match(builder,/legacyApiBase:''/);
  assert.match(builder,/RewriteRule \^ index\.html/);
  assert.match(builder,/PILOT_BASE_PATH/);
  assert.match(builder,/404\.html/);
  assert.match(workflow,/FTP-Deploy-Action@fe9c9aad1198372d80a77c8dace63cbe48b69eac/);
  assert.match(workflow,/protocol: ftps/);
  assert.match(workflow,/ALLINKL_PILOT_TARGET_DIR/);
  assert.doesNotMatch(workflow,/legacyApiBase[^\n]*onrender\.com/);
});

test('static build publishes password recovery as a real page',()=>{
  assert.match(builder,/passwordResetDirectory/);
  assert.match(builder,/passwort-zuruecksetzen/);
  assert.match(builder,/copyFileSync\(path\.join\(target,'index\.html'\)/);
});

test('invitation onboarding has a separate shell on Pages and ALL-INKL, never the legacy auto-login shell',()=>{
  assert.match(builder,/onboardingDirectory/);
  assert.match(builder,/copyFileSync\(path\.join\(target,'partner-onboarding.html'\),path\.join\(onboardingDirectory,'index.html'\)\)/);
  assert.match(builder,/p\.startsWith\('\/partner-onboarding\/'\)\?'partner-onboarding\.html'/);
  assert.match(builder,/RewriteRule \^partner-onboarding\/ partner-onboarding\.html/);
  assert.match(builder,/meta name="referrer" content="no-referrer"/);
  const page=fs.readFileSync(new URL('../public/partner-onboarding.html',import.meta.url),'utf8');
  assert.match(page,/<base href="\/">/);
  assert.doesNotMatch(page,/assets\/(?:app|partner-basic)\.js/);
});

test('ALL-INKL deployment rejects a broad or ambiguous remote target',()=>{
  assert.match(workflow,/TARGET_DIR.*pilot/);
  assert.match(workflow,/muss absolut sein/);
});
