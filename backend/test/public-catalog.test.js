// What the public /api/products reply may and may not contain.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const nf = require.resolve('node-fetch');
require.cache[nf] = {
  id: nf, filename: nf, loaded: true,
  exports: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' }),
};

const { app, __setPrintifyCacheForTests } = require('../server.js');

// A product shaped like Printify's raw one, with the private fields Printify includes on every variant.
const raw = {
  id: 'p1', title: 'Test Tee', description: 'A tee.', tags: ['showfloor'], created_at: '2026-10-01T00:00:00Z',
  images: [{ src: 'https://example.com/a.jpg' }], blueprint_id: 5,
  variants: [
    { id: 101, sku: 'SECRET-SKU-1', cost: 2175, price: 3000, title: 'M / White', grams: 240, is_enabled: true, is_default: false, is_available: true, is_printify_express_eligible: false, options: [21, 521], quantity: 1 },
    { id: 102, sku: 'SECRET-SKU-2', cost: 2400, price: 3300, title: 'XL / White', grams: 260, is_enabled: true, is_default: true, is_available: false, is_printify_express_eligible: true, options: [22, 521], quantity: 1 },
  ],
};

let server, base;
before(async () => {
  __setPrintifyCacheForTests([raw]);
  await new Promise(res => { server = app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('the public catalog never reveals our wholesale cost, SKUs or other internal variant fields', async () => {
  const r = await fetch(`${base}/api/products`);
  assert.strictEqual(r.status, 200);
  const text = await r.text();
  assert.ok(!/SECRET-SKU|"cost"|"grams"|is_printify_express_eligible|"sku"/.test(text), 'internal variant field leaked');
  const { products } = JSON.parse(text);
  for (const p of products) {
    for (const v of p.variants) {
      assert.deepStrictEqual(Object.keys(v).filter(k => !['id', 'title', 'price', 'is_enabled', 'is_available'].includes(k)), [], `${p.name}: extra variant field`);
    }
  }
});

test('the fields the storefront does use are all still there, with their real values', async () => {
  const { products } = await (await fetch(`${base}/api/products`)).json();
  const tee = products.find(p => p.id === 'p1');
  assert.deepStrictEqual(tee.variants, [
    { id: 101, title: 'M / White', price: 3000, is_enabled: true, is_available: true },
    { id: 102, title: 'XL / White', price: 3300, is_enabled: true, is_available: false },
  ]);
  assert.deepStrictEqual(tee.sizes, ['M', 'XL']);
  assert.strictEqual(tee.price, '30.00');
});

test('no response announces the server software', async () => {
  for (const path of ['/', '/api/products', '/no-such-route']) {
    const r = await fetch(`${base}${path}`);
    assert.strictEqual(r.headers.get('x-powered-by'), null, `${path} sent x-powered-by`);
  }
});

test('local products keep their full storefront shape after trimming', async () => {
  const { withLocalProducts } = require('../local-products');
  __setPrintifyCacheForTests(withLocalProducts([], { env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } }));
  const { products } = await (await fetch(`${base}/api/products`)).json();
  assert.ok(products.length >= 10);
  for (const p of products) {
    assert.ok(p.variants.length > 0, p.name);
    assert.ok(p.variants.every(v => v.id !== undefined && v.title && typeof v.price === 'number'), `${p.name}: variant missing id, title or price`);
  }
});
