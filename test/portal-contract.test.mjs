import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const basic = fs.readFileSync(new URL('../public/assets/partner-basic.js', import.meta.url), 'utf8');

test('Opportunity-Auswertung verlangt die fachliche Leseberechtigung', () => {
  assert.match(server, /url\.pathname==='\/api\/opportunity-engine'\)\{const a=requireAuth\(req,res,'opportunities\.read'\)/);
  assert.doesNotMatch(server, /dedefinitionName/);
});

test('Basic-Registrierung gibt den tatsächlichen Mailstatus zurück', () => {
  assert.match(server, /mailStatus:delivery\.status/);
  assert.match(server, /mailReason:delivery\.reason\|\|delivery\.error\|\|null/);
  assert.doesNotMatch(server, /Partner-Basic-Zugang bestätigen[\s\S]{0,1200}mailStatus:'queued'/);
});

test('Alle dynamischen Menüziele besitzen eine registrierte Seite', () => {
  const pageBlock = app.match(/const pages=\{([\s\S]*?)\n\};/)?.[1] || '';
  const pageNames = new Set([...pageBlock.matchAll(/(?:^|,|\n)([A-Za-z][A-Za-z0-9]*):/g)].map(match => match[1]));
  const targets = new Set([...app.matchAll(/data-go="([A-Za-z][A-Za-z0-9]*)"/g)].map(match => match[1]));
  assert.ok(pageNames.size > 10, 'Seitenregister wurde nicht erkannt');
  assert.deepEqual([...targets].filter(target => !pageNames.has(target)), []);
});

test('Kritische Formularaktionen haben explizite Event-Handler', () => {
  assert.match(app, /\$\('#login-form'\)\.onsubmit/);
  assert.match(basic, /q\('#basic-registration-trade-form'\)\.onsubmit/);
  assert.match(basic, /q\('#forgot-form'\)\.onsubmit/);
  assert.match(app, /function bindGo\(\).*querySelectorAll\('\[data-go\]'\)/);
});
