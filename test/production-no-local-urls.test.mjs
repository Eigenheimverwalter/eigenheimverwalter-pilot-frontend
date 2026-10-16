import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const productionFiles=[
  '../index.html',
  '../runtime-config.js',
  '../assets/app.js',
  '../assets/supabase-bridge.js',
  '../assets/api-migration-routing.mjs',
];

test('publishable portal files contain no localhost or loopback links',()=>{
  for(const relative of productionFiles){
    const source=fs.readFileSync(new URL(relative,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:localhost|127\.0\.0\.1)\b/i,`${relative} enthält einen lokalen Verweis`);
  }
});
