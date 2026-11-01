import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../assets/allinkl-bridge.js',import.meta.url),'utf8');
const portalBackend=readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Http/Controllers/Portal/PortalApiController.php',import.meta.url),'utf8');
const pushService=readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Services/Push/PushNotificationService.php',import.meta.url),'utf8');
const deliveryJob=readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Jobs/SendUserPushNotification.php',import.meta.url),'utf8');

test('Push-Protokoll kommt ausschließlich über die All-inkl-Portalroute',()=>{
  assert.match(ui,/Push-Protokoll/);
  assert.match(ui,/api\(`\/api\/push-notifications/);
  assert.match(ui,/Versand, Fehler und Öffnungen nachvollziehen/);
  assert.match(bridge,/\/api\/v1\/portal/);
  assert.match(portalBackend,/\$path === '\/push-notifications'/);
  assert.doesNotMatch(bridge,/supabase/i);
});

test('Mehrgeräteversand, Deduplizierung und Wiederholungsschutz sind serverseitig',()=>{
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
