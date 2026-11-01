import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../assets/allinkl-bridge.js',import.meta.url),'utf8');
const optional=relative=>{const url=new URL(relative,import.meta.url);return existsSync(url)?readFileSync(url,'utf8'):''};
const portalBackend=optional('../../backend-production-upload-2026-09-25/app/Http/Controllers/Portal/PortalApiController.php');
const pushService=optional('../../backend-production-upload-2026-09-25/app/Services/Push/PushNotificationService.php');
const deliveryJob=optional('../../backend-production-upload-2026-09-25/app/Jobs/SendUserPushNotification.php');

test('Push-Protokoll kommt ausschließlich über die All-inkl-Portalroute',()=>{
  assert.match(ui,/Push-Protokoll/);
  assert.match(ui,/api\(`\/api\/push-notifications/);
  assert.match(ui,/Versand, Fehler und Öffnungen nachvollziehen/);
  assert.match(bridge,/\/api\/v1\/portal/);
  assert.doesNotMatch(bridge,/supabase/i);
});

test('Push-Protokoll ist im Backend-Vertrag freigegeben',{skip:!portalBackend},()=>{
  assert.match(portalBackend,/\$path === '\/push-notifications'/);
});

test('Mehrgeräteversand, Deduplizierung und Wiederholungsschutz sind serverseitig',{skip:!deliveryJob||!pushService},()=>{
  assert.match(deliveryJob,/AppSession::query\(\)/);
  assert.match(deliveryJob,/whereNull\('revoked_at'\)/);
  assert.match(deliveryJob,/token_hash/);
  assert.match(pushService,/stableDeduplicationKey/);
  assert.match(pushService,/isRateLimited/);
  assert.match(pushService,/scheduled/);
});

test('Portal zeigt nur Zustellmetadaten und keine privaten Inhalte',()=>{
  assert.match(ui,/ohne Einsicht in private App- oder Chat-Inhalte/);
  assert.match(ui,/openedAt/);
  assert.match(ui,/failedCount/);
  assert.doesNotMatch(ui,/pushNotificationPage[^\n]{0,400}\.(chat|prompt|answer)/);
});
