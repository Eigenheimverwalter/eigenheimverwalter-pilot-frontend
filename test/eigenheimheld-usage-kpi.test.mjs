import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Http/Controllers/Portal/PortalApiController.php',import.meta.url),'utf8');
const service=readFileSync(new URL('../../backend-production-upload-2026-09-25/app/Services/Ai/AiEntitlementService.php',import.meta.url),'utf8');

test('Kundenakte zeigt nur aggregierte eigenheimHeld-Kennzahlen',()=>{
  assert.match(ui,/EIGENHEIMHELD NUTZUNG/);
  assert.match(ui,/Wochen-Prompts genutzt/);
  assert.match(ui,/Daypass-Käufe/);
  assert.match(ui,/Kaufdaten anzeigen/);
  assert.match(ui,/Fragen, Antworten und Chatverläufe sind im Portal nicht einsehbar/);
  assert.doesNotMatch(ui,/eigenheimHeldUsage[^\n]{0,400}\.(prompt|answer|message)/);
  assert.match(backend,/eigenheimHeldUsage/);
  assert.match(backend,/adminUsage\(\$customer\)/);
});

test('Freikontingent wird montags in Europe-Berlin erneuert',()=>{
  assert.match(service,/FREE_PROMPT_LIMIT = 10/);
  assert.match(service,/Europe\/Berlin/);
  assert.match(service,/startOfWeek\(CarbonInterface::MONDAY\)/);
  assert.match(service,/setTimezone\('Europe\/Berlin'\)[\s\S]*addWeek\(\)[\s\S]*startOfWeek\(CarbonInterface::MONDAY\)/);
  assert.match(service,/free_prompts_week_started_at/);
  assert.match(service,/'period' => 'weekly'/);
});

test('Daypass-KPI basiert auf eigener Kaufhistorie',()=>{
  assert.match(service,/AiDayPassPurchase/);
  assert.match(service,/stripe_payment_intent_id/);
  assert.match(service,/'purchaseCount'/);
  assert.match(service,/'purchases'/);
  assert.match(service,/'privacy' => 'aggregate_only'/);
});
