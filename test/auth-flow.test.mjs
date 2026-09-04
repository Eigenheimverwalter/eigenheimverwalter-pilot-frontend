import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/assets/auth-flow.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');

test('Login und Portal können nicht gleichzeitig sichtbar sein', () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(app, /\$\('#login'\)\.hidden=true;\$\('#app'\)\.hidden=false/);
});

test('Öffentliche Loginseite enthält keine vorausgefüllten Testzugänge', () => {
  assert.doesNotMatch(html, /value="admin@ehv\.test"/);
  assert.doesNotMatch(html, /Testrollen anzeigen/);
  assert.match(html, /name="email"[^>]*autocomplete="username"/);
  assert.match(html, /name="password"[^>]*autocomplete="current-password"/);
});
