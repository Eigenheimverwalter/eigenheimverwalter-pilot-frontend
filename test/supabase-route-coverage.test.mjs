import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handlesRoute} from '../public/assets/supabase-routes.mjs';

const sources=['app.js','partner-basic.js'].map(name=>fs.readFileSync(new URL(`../public/assets/${name}`,import.meta.url),'utf8'));

test('every statically discoverable frontend API call is handled by Supabase',()=>{
  const calls=[];
  for(const source of sources){
    for(const match of source.matchAll(/\bapi\(\s*([`'"])(\/api\/[^`'"]+)\1/g)){
      const representative=match[2].replace(/\$\{[^}]+\}/g,'route-id');
      calls.push(representative);
    }
  }
  assert.ok(calls.length>60,`Nur ${calls.length} API-Aufrufe erkannt`);
  const missing=[...new Set(calls.filter(path=>!handlesRoute(path)))];
  assert.deepEqual(missing,[],`Nicht zu Supabase geroutet: ${missing.join(', ')}`);
});
