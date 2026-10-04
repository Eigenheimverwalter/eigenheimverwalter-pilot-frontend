import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');

test('live customer data refreshes silently without the legacy mirror warning',()=>{
  assert.match(app,/LIVE_REFRESH_MS=15\*60\*1000/);
  assert.match(app,/customerDatabaseLive\(\{silent:true\}\)/);
  assert.match(app,/document\.addEventListener\('visibilitychange',refreshProductionOnReturn\)/);
  assert.match(app,/window\.addEventListener\('focus',refreshProductionOnReturn\)/);
  assert.match(app,/Live-Daten · zuletzt aktualisiert/);
  assert.match(app,/Direkte, signierte Phase-4-Daten/);
  assert.doesNotMatch(app,/api\('\/api\/production\/sync-status'\)/);
  assert.doesNotMatch(app,/Achtung: Produktivspiegel nicht aktuell/);
  assert.doesNotMatch(app,/Dokumentenspiegel unvollständig/);
});
