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

test('Kunden- und Partnerkarten filtern die Tabellen unmittelbar und kombinierbar', () => {
  assert.match(app, /table\.dataset\.region=region;table\.dispatchEvent\(new CustomEvent\('regionfilter'\)\)/);
  assert.match(app, /row\.dataset\.region=profile\.region/);
  assert.match(app, /row\.dataset\.regions=profile\.regions\.join\('\|'\)/);
  assert.match(app, /table\.addEventListener\('regionfilter',apply\)/);
  assert.match(app, /delete table\.dataset\.region/);
});

test('Lesende Partneransicht startet ausschließlich aus der Partnertabelle', () => {
  assert.doesNotMatch(app, /data-menu="support"/);
  assert.doesNotMatch(app, /Partneransicht für Support/);
  assert.match(app, /class="primary partner-360"/);
  assert.match(app, /startPartnerSupportView\(b\.dataset\.id\)/);
  assert.match(app, /body:JSON\.stringify\(\{partnerId\}\)/);
});

test('Admin Plus bearbeitet Rollen ohne separates Benutzerzugangsmenü', () => {
  assert.doesNotMatch(app, /data-menu="access"/);
  assert.match(app, /class="primary save-partner-role"/);
  assert.match(app, /partner-role-templates\/\$\{encodeURIComponent\(card\.dataset\.roleId\)\}/);
  assert.match(app, /body:JSON\.stringify\(\{title,status,permissions\}\)/);
});

test('Zugangsverwaltung lädt Mitarbeiter ein und trennt Admin Light von Support', () => {
  assert.match(app, /data-menu="roles">Zugangsverwaltung/);
  assert.match(app, /Mitarbeiterzugang einladen/);
  assert.match(app, /support_staff:'Support-Mitarbeiter'/);
  assert.match(app, /support_staff:\['dashboard','production','partners'\]/);
  assert.match(app, /api\('\/api\/access-management\/invitations'/);
  assert.match(app, /const form=\$\('#staff-invitation-form'\);form\.onsubmit/);
  assert.doesNotMatch(app, /setTimeout\(\(\)=>\$\('#staff-invitation-form'\)\.onsubmit/);
});
