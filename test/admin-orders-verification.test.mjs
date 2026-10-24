import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const reads = await readFile(new URL('../supabase/functions/_shared/read-routes.ts', import.meta.url), 'utf8');
const writes = await readFile(new URL('../supabase/functions/_shared/write-routes.ts', import.meta.url), 'utf8');
const routes = await readFile(new URL('../assets/supabase-routes.mjs', import.meta.url), 'utf8');

test('admin portal exposes app service requests as orders with routing context', () => {
  assert.match(app, /Aufträge/);
  assert.match(app, /api\('\/api\/orders'\)/);
  assert.match(reads, /path==="\/orders"/);
  assert.match(reads, /assignedPartnerId/);
  assert.match(routes, /'\/api\/orders'/);
});

test('address verification resolves properties and customers from the production mirror', () => {
  assert.match(writes, /mirrorTables\.properties/);
  assert.match(writes, /mirrorTables\.users/);
  assert.match(writes, /propertyAddressVerifications/);
});

test('admin document register renders the protected storage path', () => {
  assert.match(reads, /storagePath/);
  assert.match(app, /ADMIN-DOKUMENTENREGISTER/);
  assert.match(app, /doc\.storagePath\|\|doc\.file/);
});
