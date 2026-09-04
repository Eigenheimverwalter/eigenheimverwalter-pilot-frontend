import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../supabase/functions/document-api/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/202609040002_document_source_refs.sql',import.meta.url),'utf8');

test('document API uploads only scoped, allow-listed private files',()=>{
  assert.match(source,/authenticate/);assert.match(source,/scopedProperties/);assert.match(source,/allowed\.has\(propertyId\)/);
  assert.match(source,/application\\\/pdf\|image/);assert.match(source,/10\*1024\*1024/);assert.match(source,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source,/upsert:false/);assert.match(source,/ehv-sensitive-documents/);
});

test('document views use short-lived URLs and audited soft deletion',()=>{
  assert.match(source,/createSignedUrl\(document\.object_path,60\)/);assert.match(source,/document\.viewed/);
  assert.match(source,/deleted_at:new Date\(\)\.toISOString\(\)/);assert.match(source,/document\.deleted/);
  assert.match(migration,/source_property_id text/);
});
