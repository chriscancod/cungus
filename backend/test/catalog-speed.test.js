// /api/products must not make a shopper wait for Printify on every request.
// Printify is stubbed with a deliberate delay so "slow" is measurable and nothing reaches a real API.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

let printifyCalls = 0;
const DELAY_MS = 400;
const nf = require.resolve('node-fetch');
require.cache[nf] = {
  id: nf, filename: nf, loaded: true,
  exports: async () => {
    printifyCalls++;
    await new Promise(r => setTimeout(r, DELAY_MS));
    return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' };
  },
};

process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS = '1';
const { app, __setPrintifyCacheForTests } = require('../server.js');

let server, base;
before(async () => { await new Promise(res => { server = app.listen(0, '127.0.0.1', res); }); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); delete process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS; });

// performance.now() is a separate clock, so the tests that fake Date.now() still measure real waiting time
const timed = async () => { const t = performance.now(); const r = await fetch(`${base}/api/products`); const j = await r.json(); return { ms: performance.now() - t, status: r.status, n: j.products ? j.products.length : -1 }; };

test('cold start waits for Printify once and still returns the whole catalog', async () => {
  printifyCalls = 0;
  const a = await timed();
  assert.strictEqual(a.status, 200);
  assert.ok(a.n > 0, 'local products are in the catalog');
  assert.ok(a.ms >= DELAY_MS - 50, `cold call waited (${a.ms} ms)`);
  assert.strictEqual(printifyCalls, 1);
});

test('the next calls are fast and do not hit Printify again', async () => {
  const before = printifyCalls;
  const b = await timed();
  const c = await timed();
  assert.ok(b.ms < DELAY_MS / 2 && c.ms < DELAY_MS / 2, `fast calls: ${b.ms} ms, ${c.ms} ms`);
  assert.strictEqual(printifyCalls, before);
});

test('a stale copy is served instantly while it refreshes in the background', async () => {
  // age the cache past the 60 s freshness window but inside the 5 minute stale window
  const cached = await (await fetch(`${base}/api/products`)).json();
  const { withLocalProducts } = require('../local-products.js');
  __setPrintifyCacheForTests(withLocalProducts([], { env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } }));
  const stale = require('../server.js');
  assert.ok(stale && cached.products.length > 0);
  // reach into the cache timestamp through the test hook's sibling: re-seed, then wait out the freshness window by faking time
  const realNow = Date.now;
  const base_t = realNow();
  Date.now = () => base_t + 120 * 1000; // 2 minutes later
  try {
    const before = printifyCalls;
    const d = await timed();
    assert.ok(d.ms < DELAY_MS / 2, `stale call answered from cache (${d.ms} ms)`);
    await new Promise(r => setTimeout(r, DELAY_MS + 150)); // let the background refresh finish
    assert.strictEqual(printifyCalls, before + 1, 'exactly one background refresh');
    // many requests at once during a stale window cause one refresh, not a stampede
    Date.now = () => base_t + 4 * 60 * 1000;
    const mid = printifyCalls;
    await Promise.all([timed(), timed(), timed(), timed(), timed()]);
    await new Promise(r => setTimeout(r, DELAY_MS + 150));
    assert.ok(printifyCalls - mid <= 1, `no stampede: ${printifyCalls - mid} refreshes for 5 requests`);
  } finally { Date.now = realNow; }
});

test('a copy older than 5 minutes makes the visitor wait for a fresh one', async () => {
  const realNow = Date.now;
  const base_t = realNow();
  Date.now = () => base_t + 30 * 60 * 1000;
  try {
    const before = printifyCalls;
    const e = await timed();
    assert.ok(e.ms >= DELAY_MS - 50, `old copy waited for a refresh (${e.ms} ms)`);
    assert.strictEqual(printifyCalls, before + 1);
  } finally { Date.now = realNow; }
});
