// Runs only in an isolated VM. No browser, network, environment file or server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs.readFileSync(new URL('../shared/analytics.js', import.meta.url), 'utf8');
async function run({ referrer = '', consent = true, gpc = false, dnt = '', search = '' } = {}) {
  const pending = [], events = [], listeners = {};
  const ctx = vm.createContext({
    window: { URL, URLSearchParams, crypto: webcrypto, hasAnalyticsConsent: () => consent, addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: { referrer, addEventListener() {} },
    navigator: { globalPrivacyControl: gpc, doNotTrack: dnt, sendBeacon: (_, blob) => { pending.push(blob.text().then(t => events.push(JSON.parse(t)))); return true; } },
    location: { search, pathname: '/faq.html', hostname: 'localhost' },
    Uint8Array, Blob, Math,
    fetch() { throw Error('Unexpected fetch: test must not use networking'); },
  });
  vm.runInContext(source, ctx);
  await Promise.all(pending);
  return { events, ctx, listeners };
}
for (const referrer of [
  'https://search.example.test/private/customer@example.test?email=kid@example.test&token=SECRET#PRIVATE',
  'https://search.example.test/?utm_campaign=PRIVATE&access_token=SECRET',
]) {
  test('only origin is transmitted, never referrer path/query/fragment: ' + referrer, async () => {
    const { events } = await run({ referrer }); assert.equal(events.length, 1); assert.equal(events[0].referrer, 'https://search.example.test');
    const payload = JSON.stringify(events[0]); for (const privatePart of ['kid@', 'customer@', 'SECRET', 'PRIVATE', 'email=', 'token=']) assert.equal(payload.includes(privatePart), false);
  });
}
for (const referrer of ['', 'not a URL', 'file:///Users/private/secret', 'data:text/plain,SECRET', 'javascript:SECRET', 'https://user:password@example.test/private']) {
  test('invalid, non-web and credentialed referrers are dropped: ' + referrer, async () => { const { events } = await run({ referrer }); assert.equal(events[0].referrer, ''); });
}
test('consent remains required', async () => { const { events } = await run({ consent: false, referrer: 'https://example.test/?token=SECRET' }); assert.deepEqual(events, []); });
test('GPC and DNT remain blocking even with consent', async () => { for (const options of [{ gpc: true }, { dnt: '1' }]) assert.deepEqual((await run(options)).events, []); });
