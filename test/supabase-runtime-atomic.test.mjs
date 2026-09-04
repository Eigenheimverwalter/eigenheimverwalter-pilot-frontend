import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/202609040001_runtime_atomic.sql',import.meta.url),'utf8');

test('Supabase runtime updates are revision-guarded and audited atomically',()=>{
  assert.match(migration,/add column if not exists revision bigint not null default 1/);
  assert.match(migration,/portal_runtime_state\.revision = expected_revision/);
  assert.match(migration,/raise exception 'runtime_revision_conflict'/);
  assert.match(migration,/insert into public\.audit_events/);
  assert.match(migration,/grant execute[\s\S]*to service_role/);
  assert.match(migration,/revoke all[\s\S]*from public, anon, authenticated/);
});
