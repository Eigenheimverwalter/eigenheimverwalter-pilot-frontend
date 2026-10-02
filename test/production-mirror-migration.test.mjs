import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backendRoutes=fs.readFileSync(new URL('../../backend-production-upload-2026-09-25/routes/api.php',import.meta.url),'utf8');
const exportController=fs.readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Http/Controllers/Admin/ProductionMirrorExportController.php',import.meta.url),'utf8');
const exportService=fs.readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Services/Admin/ProductionMirrorExportService.php',import.meta.url),'utf8');
const reads=fs.readFileSync(new URL('../supabase/functions/_shared/read-routes.ts',import.meta.url),'utf8');
const writes=fs.readFileSync(new URL('../supabase/functions/_shared/write-routes.ts',import.meta.url),'utf8');
const importer=fs.readFileSync(new URL('../scripts/import-production-mirror.mjs',import.meta.url),'utf8');
const documentImporter=fs.readFileSync(new URL('../scripts/import-production-documents.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/supabase-production-mirror-import.yml',import.meta.url),'utf8');
const deployWorkflow=fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml',import.meta.url),'utf8');

test('confidential production mirror has a separate token-protected export',()=>{
  assert.match(backendRoutes,/migration\/production-export/);
  assert.match(backendRoutes,/migration\.export/);
  assert.match(exportController,/ProductionMirrorExportService/);
  assert.match(exportService,/password\|token\|secret\|credential\|api_key\|private_key/);
  assert.match(exportService,/password_present/);
  assert.doesNotMatch(exportService,/['\"]password['\"]\s*=>\s*\$user->password/);
});

test('production document binaries have an authenticated migration-only export',()=>{
  assert.match(backendRoutes,/migration\/production-files/);
  assert.match(backendRoutes,/migration\.export/);
  assert.match(exportController,/downloadFile/);
  assert.match(exportController,/basename/);
  assert.match(exportController,/migration\.production_file_exported/);
});

test('production mirror merges into the current runtime revision instead of replacing newer work',()=>{
  assert.match(importer,/select=payload,revision/);
  assert.match(importer,/\.\.\.current\.payload,productionMirror:/);
  assert.match(importer,/replace_portal_runtime_state/);
  assert.match(importer,/previous\?\.supabaseDocumentId/);
  assert.match(workflow,/production-export/);
  assert.match(workflow,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow,/cron: '2-59\/5 \* \* \* \*'/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/https:\/\/api\.eigenheimverwalter\.de/);
  assert.match(workflow,/--retry 3 --retry-all-errors/);
  assert.match(importer,/schemaVersion/);
  assert.match(importer,/meta\.source!==['"]api\.eigenheimverwalter\.de['"]/);
  assert.match(importer,/Import abgelehnt/);
  assert.match(importer,/productionSync/);
  assert.match(importer,/property_equipment/);
  assert.match(importer,/phase4_user_setcards/);
  assert.match(importer,/admin_access_assignments/);
});

test('production customer views and overrides use only the imported confidential mirror',()=>{
  assert.match(reads,/productionTables/);
  assert.match(reads,/productionUsers/);
  assert.match(reads,/sourceUserCount:productionUsers\.length/);
  assert.match(writes,/state\.productionMirror/);
  assert.match(writes,/productionCustomerOverrides=overrides/);
  assert.match(reads,/property\.streetName\|\|property\.street_name\|\|property\.street/);
  assert.match(reads,/property_address:\[propertyStreet,propertyHouseNumber\]/);
  assert.match(reads,/productionRegistrationStatus\(user,owned\.length\)/);
});

test('available production files have a private idempotent migration utility',()=>{
  assert.match(documentImporter,/ehv-sensitive-documents/);
  assert.match(documentImporter,/source_entity_type:'production_property_file'/);
  assert.match(documentImporter,/on_conflict=source_entity_type,source_entity_id/);
  assert.match(documentImporter,/uploaded_by:null/);
  assert.match(documentImporter,/replace_portal_runtime_state/);
  assert.doesNotMatch(deployWorkflow,/PILOT_MIGRATION_EXPORT_URL/);
});

test('deployment verifies migrated documents and no longer deploys the temporary import function',()=>{
  assert.doesNotMatch(deployWorkflow,/functions deploy production-document-import/);
  assert.match(deployWorkflow,/pilot_migration_status/);
  assert.match(deployWorkflow,/\.availableDocuments >= 93/);
  assert.match(deployWorkflow,/\.customers >= 194/);
  assert.doesNotMatch(deployWorkflow,/\.customers == 194/);
});

test('deployment requires an active info admin without logging identity data',()=>{
  const workflow=fs.readFileSync('.github/workflows/supabase-deploy.yml','utf8');
  const migration=fs.readFileSync('supabase/migrations/202609040008_pilot_access_status.sql','utf8');
  assert.match(migration,/activeAdminProfiles/);
  assert.match(migration,/activeInfoAdmin/);
  assert.match(migration,/lower\('info@eigenheimverwalter\.de'\)/);
  assert.match(workflow,/\.activeAdminProfiles >= 1/);
  assert.match(workflow,/\.activeInfoAdmin == true/);
});

test('admin bootstrap is fixed to info and never stores an initial password',()=>{
  const workflow=fs.readFileSync('.github/workflows/supabase-deploy.yml','utf8');
  const bootstrap=fs.readFileSync('scripts/bootstrap-pilot-admin.sh','utf8');
  assert.match(workflow,/bash scripts\/bootstrap-pilot-admin\.sh/);
  assert.match(bootstrap,/admin_email='info@eigenheimverwalter\.de'/);
  assert.match(bootstrap,/openssl rand -base64 48/);
  assert.match(bootstrap,/role:\"super_admin\"/);
  assert.match(bootstrap,/portal-public\/password\/forgot/);
  assert.doesNotMatch(bootstrap,/ChangeMe123/);
  assert.doesNotMatch(bootstrap,/admin_password/i);
});
