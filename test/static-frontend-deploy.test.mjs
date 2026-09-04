import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const builder=fs.readFileSync(new URL('../scripts/build-static-frontend.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');

test('ALL-INKL frontend build is Supabase-only and keeps SPA routes',()=>{
  assert.match(builder,/authMode:'supabase'/);
  assert.match(builder,/legacyApiBase:''/);
  assert.match(builder,/RewriteRule \^ index\.html/);
  assert.match(workflow,/FTP-Deploy-Action@fe9c9aad1198372d80a77c8dace63cbe48b69eac/);
  assert.match(workflow,/protocol: ftps/);
  assert.match(workflow,/ALLINKL_PILOT_TARGET_DIR/);
  assert.doesNotMatch(workflow,/legacyApiBase[^\n]*onrender\.com/);
});

test('ALL-INKL deployment rejects a broad or ambiguous remote target',()=>{
  assert.match(workflow,/TARGET_DIR.*pilot/);
  assert.match(workflow,/muss absolut sein/);
});
