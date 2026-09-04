import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../supabase/functions/portal-public/index.ts',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/partner-basic.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');

test('public registration uses Supabase Auth and registration mail without storing passwords',()=>{
  assert.match(source,/auth\.admin\.generateLink\(\{type:"signup"/);
  assert.match(source,/channel:"registration"/);
  assert.doesNotMatch(source,/passwordHash/);
  assert.match(source,/identity_imports/);
  assert.match(source,/replace_portal_runtime_state/);
});

test('public auth routes are origin-limited and routed without Render',()=>{
  assert.match(source,/allowedOrigin/);assert.match(source,/type:"recovery"/);
  assert.match(bridge,/portal-public/);assert.match(bridge,/isPublicPath/);
  assert.match(ui,/ehvSupabaseBridge/);assert.match(ui,/updatePassword/);
  assert.match(workflow,/portal-public/);
});
