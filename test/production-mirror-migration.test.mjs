import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const reads=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');
const writes=fs.readFileSync(new URL('../supabase/functions/_shared/write-routes.ts',import.meta.url),'utf8');
const importer=fs.readFileSync(new URL('../scripts/import-production-mirror.mjs',import.meta.url),'utf8');
const documentImporter=fs.readFileSync(new URL('../scripts/import-production-documents.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-production-mirror-import.yml',import.meta.url),'utf8');
const deployWorkflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');

test('confidential production mirror has a separate token-protected export',()=>{
  assert.match(server,/\/api\/migration\/production-export/);
  assert.match(server,/validMigrationExportToken/);
  assert.match(server,/password_present/);
  assert.doesNotMatch(server,/productionMigrationSnapshot[\s\S]{0,800}\[\['password',item\]\]/);
});

test('production document binaries have an authenticated migration-only export',()=>{
  assert.match(server,/productionMigrationFile=url\.pathname\.match/);
  assert.match(server,/migration\.production_file_exported/);
  assert.match(server,/path\.basename\(String\(record\.file/);
  assert.match(server,/validMigrationExportToken\(req\)/);
});

test('production mirror merges into the current runtime revision instead of replacing newer work',()=>{
  assert.match(importer,/select=payload,revision/);
  assert.match(importer,/\.\.\.current\.payload,productionMirror:mirror/);
  assert.match(importer,/replace_portal_runtime_state/);
  assert.match(workflow,/production-export/);
  assert.match(workflow,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('production customer views and overrides use only the imported confidential mirror',()=>{
  assert.match(reads,/productionTables/);
  assert.match(reads,/productionUsers/);
  assert.match(reads,/sourceUserCount:productionUsers\.length/);
  assert.match(writes,/state\.productionMirror/);
  assert.match(writes,/productionCustomerOverrides=overrides/);
});

test('available production files are uploaded privately and linked idempotently',()=>{
  assert.match(documentImporter,/ehv-sensitive-documents/);
  assert.match(documentImporter,/source_entity_type:'production_property_file'/);
  assert.match(documentImporter,/on_conflict=source_entity_type,source_entity_id/);
  assert.match(documentImporter,/uploaded_by:null/);
  assert.match(documentImporter,/replace_portal_runtime_state/);
  assert.match(deployWorkflow,/import-production-documents\.mjs/);
});
