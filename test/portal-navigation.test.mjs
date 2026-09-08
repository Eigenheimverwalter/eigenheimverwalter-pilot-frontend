import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { portalRootPath } from '../public/assets/portal-navigation.mjs';

test('portal root preserves root, GitHub Pages and nested deployments', () => {
  for (const [base, expected] of [[undefined, '/'], ['', '/'], ['/', '/'], ['/eigenheimverwalter-pilot-frontend/', '/eigenheimverwalter-pilot-frontend/'], ['pilot/test', '/pilot/test/']]) {
    assert.equal(portalRootPath(base), expected);
  }
  for (const base of ['https://example.com', '../', 'portal?next=bad', 'portal#bad']) assert.throws(() => portalRootPath(base));
});

const source = fs.readFileSync(new URL('../public/assets/partner-basic.js', import.meta.url), 'utf8');
test('all authentication return links use the configured portal root', () => {
  assert.doesNotMatch(source, /href="\/"|location\.href='\/'/);
  assert.equal(source.match(/href="\$\{escapeHtml\(loginPath\(\)\)\}"/g)?.length, 4);
});

// Exercise the actual invitation form handler without creating accounts or sending mail.
for (const basePath of ['', '/eigenheimverwalter-pilot-frontend']) {
  test(`successful invitation returns to the login page under ${basePath || '/'}`, async () => {
    const html = [], calls = [], form = {}, close = {};
    const bridge = { enabled: true, handles: () => true, request: async (path, options = {}) => {
      calls.push({path, method: options.method || 'GET'});
      if (path === '/api/me') return {user: {role: 'not-a-partner'}};
      assert.equal(path, '/api/partner-invitations/test-token');
      return options.method === 'POST' ? {message: 'Zugang aktiviert'} : {company: 'Test', trade: 'Basic Partner', postalCodes: [], email: 'test@example.invalid'};
    }};
    const context = {
      portalRootPath,
      window: {__EHV_RUNTIME__: {authMode: 'supabase', basePath}, ehvSupabaseBridge: bridge},
      location: {pathname: `${basePath}/partner-einladung/test-token`},
      document: {querySelector: selector => selector === '#full-partner-invitation-form' ? form : selector === '.basic-auth-modal .close' ? close : null, addEventListener() {}, body: {insertAdjacentHTML: (_, value) => html.push(value)}},
      FormData: class extends Array { constructor() {super(['password', 'Fixture-only!234'], ['passwordConfirmation', 'Fixture-only!234']);} },
    };
    // Same route adaptation as build-static-frontend.mjs for the published site.
    const builtSource = source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '').replaceAll("location.pathname.split('/').filter(Boolean)", "location.pathname.split('/').filter(Boolean).slice(-2)");
    vm.runInNewContext(builtSource, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof form.onsubmit, 'function');
    await form.onsubmit({preventDefault() {}, target: form});
    assert.match(html.at(-1), /Partnerzugang aktiviert/);
    const href = html.at(-1).match(/href="([^"]+)"/)?.[1];
    assert.equal(href, `${basePath}/`);
    assert.equal(new URL(href, `https://eigenheimverwalter.github.io${basePath}/partner-einladung/test-token`).pathname, `${basePath}/`);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  });
}
