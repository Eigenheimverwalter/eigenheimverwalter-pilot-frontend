import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge = fs.readFileSync(new URL('../supabase/functions/portal-mail/index.ts', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/supabase-deploy.yml', import.meta.url), 'utf8');
const render = fs.readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');

test('Supabase-Mailgateway trennt alle drei ALL-INKL-Absender strikt', () => {
  assert.match(edge, /partner@eigenheimverwalter\.de/);
  assert.match(edge, /registrierung@eigenheimverwalter\.de/);
  assert.match(edge, /info@eigenheimverwalter\.de/);
  assert.match(edge, /SMTP_PARTNER_PASSWORD/);
  assert.match(edge, /SMTP_REGISTRATION_PASSWORD/);
  assert.match(edge, /SMTP_INFO_PASSWORD/);
});

test('Mailgateway ist nur serverseitig mit langem Geheimnis erreichbar', () => {
  assert.match(edge, /x-pilot-mail-token/);
  assert.match(edge, /PILOT_MAIL_GATEWAY_TOKEN/);
  assert.match(edge, /expected\.length < 48/);
  assert.match(edge, /safeEqual\(supplied, expected\)/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin/);
});

test('Deployment und Render zeigen ausschließlich auf das Pilot-Projekt', () => {
  assert.match(config, /\[functions\.portal-mail\][\s\S]*verify_jwt = false/);
  assert.match(workflow, /functions deploy portal-mail/);
  assert.match(workflow, /portal-mail\/health/);
  assert.match(render, /MAIL_TRANSPORT\s*\n\s*value: supabase/);
  assert.match(render, /rpniwtshbwjuesoeztyt\.supabase\.co\/functions\/v1\/portal-mail/);
  assert.doesNotMatch(render, /yfgieygxlpatmhdskmaa/);
});

test('SMTP-Nutzdaten werden gegen Header-Injection und falsche Kanäle geschützt', () => {
  assert.match(edge, /replace\(\/\[\\r\\n\]\/g, " "\)/);
  assert.match(edge, /channel in channels/);
  assert.match(edge, /body\.action !== "pilot_send_email"/);
  assert.match(edge, /message[\s\S]*slice\(0, 50_000\)/);
});
