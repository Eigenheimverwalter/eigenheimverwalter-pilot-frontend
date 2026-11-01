import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

test('Partnerakte pflegt alle öffentlichen App-Daten', () => {
  assert.match(app, /name="logoUrl"/);
  assert.match(app, /name="photoUrl"/);
  assert.match(app, /name="externalScore"/);
  assert.match(app, /name="externalScoreSource"/);
  assert.match(app, /Öffentliche Partnerakte in der App/);
});

test('öffentliche Partnerdaten werden mit dem bestehenden Partnerformular gespeichert', () => {
  assert.match(app, /new FormData\(form\)/);
  assert.match(app, /api\(`\/api\/partners\/\$\{id\}`.*method:'PATCH'/s);
});
