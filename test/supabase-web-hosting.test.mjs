import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const builder=fs.readFileSync(new URL('../scripts/build-supabase-web-function.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../public/assets/supabase-bridge.js',import.meta.url),'utf8');

test('Supabase hosts the complete frontend without a Render fallback',()=>{
  assert.match(builder,/portal-web\/index\.ts/);
  assert.match(builder,/legacyApiBase:''/);
  assert.match(builder,/SUPABASE_ANON_KEY/);
  assert.match(workflow,/functions deploy portal-web/);
  assert.doesNotMatch(workflow,/legacyApiBase[^\n]*onrender\.com/);
});

test('invitation links retain the Supabase web base path',()=>{
  assert.match(bridge,/config\.siteBaseUrl\|\|location\.origin/);
  assert.match(builder,/siteBaseUrl/);
  assert.match(builder,/relative\.startsWith\('\/registrierung\/'\)/);
  assert.match(builder,/relative\.startsWith\('\/ref\/'\)/);
});
