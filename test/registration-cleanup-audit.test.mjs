import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html,audit] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/registration-cleanup-audit.js', import.meta.url), 'utf8'),
]);

test('Registrierungsprotokoll ist im Portal eingebunden', () => {
  assert.match(html, /assets\/registration-cleanup-audit\.js/);
  assert.match(audit, /\/api\/registration-cleanup\/audit/);
  assert.match(audit, /Registrierungs- und Reaktionsprotokoll/);
});

test('Registrierungsprotokoll zeigt keine Zugangsdaten oder Token', () => {
  assert.doesNotMatch(audit, /password|token|secret/i);
});
