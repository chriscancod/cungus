// The four TapStitch products (The Standard, The Virgil, The Mainstay, The Rest) are
// defined in local-products.js rather than in Printify. These tests pin the properties
// that matter for a store that charges real cards: they only appear once launched (or
// published), they are priced by the server (not the browser), they land in the right
// shipping tier, every image they point at exists in the repo, and the copy carries no
// unresolved placeholders.
//
// As of 2026-09-23 all four are live: The Standard/The Virgil were launch-gated to
// 2026-09-23T00:00-04:00 and that date has passed; The Mainstay/The Rest were published
// on Chris's direct instruction before their sample-check gate was cleared (see the
// comment above their definitions in local-products.js) — `published: false` itself is
// still real, load-bearing code (see the synthetic-product test below), just not
// currently applied to any real product.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// server.js does `require('node-fetch')` for Printify/Square/mambru calls. Stub it
// so nothing here can reach a real API: Printify answers with an empty catalog.
const nf = require.resolve('node-fetch');
require.cache[nf] = {
  id: nf, filename: nf, loaded: true,
  exports: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' }),
};

const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products.js');
const {
  app, priceItems, computeTotals, __setPrintifyCacheForTests,
} = require('../server.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const byId = id => LOCAL_PRODUCTS.find(p => p.id === id);
const STANDARD = byId('2am-the-standard');
const VIRGIL = byId('2am-the-virgil');
const MAINSTAY = byId('2am-the-mainstay');
const REST = byId('2am-the-rest');
const AFTER_LAUNCH = Date.parse('2026-09-23T00:00:00-04:00') + 1000;
const BEFORE_LAUNCH = Date.parse('2026-09-22T23:59:00-04:00');

// ── launch gate ──────────────────────────────────────────────────────────────
test('The Standard/The Virgil are invisible before their launch time; The Mainstay/The Rest have no launch gate and always show', () => {
  const out = withLocalProducts([{ id: 'printify-1' }], { now: BEFORE_LAUNCH, env: {} });
  assert.deepStrictEqual(out.map(p => p.id), ['printify-1', MAINSTAY.id, REST.id]);
});

test('all four show after the tee/hoodie launch time, after the existing Printify products', () => {
  const out = withLocalProducts([{ id: 'printify-1' }], { now: AFTER_LAUNCH, env: {} });
  assert.deepStrictEqual(out.map(p => p.id), ['printify-1', STANDARD.id, VIRGIL.id, MAINSTAY.id, REST.id]);
});

test('SHOW_UNLAUNCHED_LOCAL_PRODUCTS=1 shows every product early, unpublished ones included (for previewing a deploy)', () => {
  const out = withLocalProducts([], { now: BEFORE_LAUNCH, env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } });
  assert.strictEqual(out.length, LOCAL_PRODUCTS.length);
});

test('published: false is still real, load-bearing code, exercised through withLocalProducts itself', () => {
  // LOCAL_PRODUCTS is a closed-over module constant, not injectable — so this pins the
  // guarantee by toggling a real product's flag and restoring it, rather than duplicating
  // withLocalProducts' own filter logic in the test (which would only prove the copy
  // agrees with itself, not that the real function behaves this way).
  const far = Date.parse('2030-01-01T00:00:00Z');
  assert.strictEqual(MAINSTAY.published, true, 'precondition: currently published');
  MAINSTAY.published = false;
  try {
    const ids = withLocalProducts([], { now: far, env: {} }).map(p => p.id);
    assert.ok(!ids.includes(MAINSTAY.id), 'a published:false product must never appear, regardless of date');
    assert.ok(ids.includes(REST.id), 'unsetting one product must not hide the others');
  } finally {
    MAINSTAY.published = true; // restore — other tests in this file assume it's published
  }
});

// ── data integrity ───────────────────────────────────────────────────────────
test('variants are Size / Color, S–2XL, priced $50 and $70, all enabled, ids unique', () => {
  const expect = [
    [STANDARD, ['Black', 'White', 'Heather Gray'], 5000],
    [VIRGIL, ['Black', 'Light Gray', 'Haze Blue', 'Dark Green'], 7000],
    [MAINSTAY, ['Washed Black', 'Washed Blue', 'Washed Gray'], 8000],
    [REST, ['Black', 'Slate Blue', 'Heather Gray'], 7000],
  ];
  for (const [p, colors, cents] of expect) {
    assert.strictEqual(p.variants.length, 5 * colors.length, `${p.title} variant count`);
    assert.strictEqual(new Set(p.variants.map(v => v.id)).size, p.variants.length, 'unique variant ids');
    for (const v of p.variants) {
      const [size, color] = v.title.split(' / ');
      assert.ok(['S', 'M', 'L', 'XL', '2XL'].includes(size), `size in ${v.title}`);
      assert.ok(colors.includes(color), `color in ${v.title}`);
      assert.strictEqual(v.price, cents);
      assert.strictEqual(v.is_enabled, true);
      assert.strictEqual(v.is_available, true);
    }
  }
});

test('every image file the products point at exists in the repo', () => {
  for (const p of LOCAL_PRODUCTS) {
    for (const img of p.images) {
      const rel = img.src.replace('https://2amcases.online/', '');
      assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `missing file: ${rel}`);
    }
    assert.strictEqual(p.content.imageAlts.length, p.images.length, `${p.title}: one alt text per image`);
    assert.ok(p.content.imageAlts.every(a => a.trim().length > 20), `${p.title}: alt text is descriptive`);
  }
});

test('size charts are complete: 5 sizes, same column count in every row', () => {
  for (const p of LOCAL_PRODUCTS) {
    const sc = p.content.sizeChart;
    assert.strictEqual(sc.rows.length, 5, `${p.title} rows`);
    assert.deepStrictEqual(sc.rows.map(r => r[0]), ['S', 'M', 'L', 'XL', '2XL']);
    for (const r of sc.rows) assert.strictEqual(r.length, sc.columns.length, `${p.title} row ${r[0]}`);
  }
});

test('the storefront description is a standalone summary that fits its 200-char cut', () => {
  for (const p of LOCAL_PRODUCTS) assert.ok(p.description.length <= 200, `${p.title}: ${p.description.length} chars`);
});

test('no unresolved placeholders or banned copy reach customers', () => {
  const banned = /\b(vintage|retro|normcore|barrel|infrared|heat preservation|heavyweight|premium|luxury|limited|exclusive|hurry|selling fast|best[- ]?seller|handcrafted|artisan\w*|iconic|elevated|trend\w*|must[- ]have|timeless|built to last|lightweight)\b/i;
  for (const p of LOCAL_PRODUCTS) {
    const text = JSON.stringify({ title: p.title, description: p.description, content: p.content });
    assert.ok(!/\[(CONFIRM|SELECT)/i.test(text), `${p.title}: placeholder left in copy`);
    assert.ok(!banned.test(text), `${p.title}: banned word "${(text.match(banned) || [])[0]}"`);
  }
});

test('titles put each product in the right shipping category', () => {
  const { computeTotals: ct } = require('../server.js');
  const standard = ct([{ name: STANDARD.title, priceCents: 5000 }], { country: 'US' });
  const virgil = ct([{ name: VIRGIL.title, priceCents: 7000 }], { country: 'US' });
  assert.strictEqual(standard.shippingCents, 375, 'tee tier');
  assert.strictEqual(virgil.shippingCents, 400, 'hoodie tier');
  // "jeans" used to be missing from the classifier and fell to the $3.75 generic tier.
  const mainstay = ct([{ name: MAINSTAY.title, priceCents: 8000 }], { country: 'US' });
  const rest = ct([{ name: REST.title, priceCents: 7000 }], { country: 'US' });
  assert.strictEqual(mainstay.shippingCents, 400, 'jeans must be bottoms, not the generic top tier');
  assert.strictEqual(rest.shippingCents, 400, 'sweatpants tier');
});

// ── server-side pricing ──────────────────────────────────────────────────────
function seed() { __setPrintifyCacheForTests(withLocalProducts([], { env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } })); }
const vid = (p, size, color) => p.variants.find(v => v.title === `${size} / ${color}`).id;

test('a tampered price is ignored: the tee is charged $50', async () => {
  seed();
  const priced = await priceItems([{ id: STANDARD.id, name: STANDARD.title, variantId: vid(STANDARD, 'M', 'Black'), price: '0.01' }]);
  assert.strictEqual(priced[0].priceCents, 5000);
});

test('the hoodie is charged $70 in every size, including 2XL', async () => {
  seed();
  for (const size of ['S', 'XL', '2XL']) {
    const priced = await priceItems([{ id: VIRGIL.id, name: VIRGIL.title, variantId: vid(VIRGIL, size, 'Haze Blue'), price: '1.00' }]);
    assert.strictEqual(priced[0].priceCents, 7000, size);
  }
});

test('the jeans are charged $80 and the sweatpants $70 in every size, server-side', async () => {
  seed();
  for (const size of ['S', 'L', '2XL']) {
    const j = await priceItems([{ id: MAINSTAY.id, name: MAINSTAY.title, variantId: vid(MAINSTAY, size, 'Washed Blue'), price: '1.00' }]);
    assert.strictEqual(j[0].priceCents, 8000, `jeans ${size}`);
    const r = await priceItems([{ id: REST.id, name: REST.title, variantId: vid(REST, size, 'Slate Blue'), price: '1.00' }]);
    assert.strictEqual(r[0].priceCents, 7000, `sweatpants ${size}`);
  }
});

test('a staged (published: false) product cannot be bought: the default catalog does not contain it', async () => {
  assert.strictEqual(MAINSTAY.published, true, 'precondition: currently published');
  MAINSTAY.published = false;
  try {
    __setPrintifyCacheForTests(withLocalProducts([], { now: AFTER_LAUNCH, env: {} }));
    await assert.rejects(
      priceItems([{ id: MAINSTAY.id, name: MAINSTAY.title, variantId: vid(MAINSTAY, 'M', 'Washed Black'), price: '80.00' }]),
      /no longer available/,
    );
  } finally {
    MAINSTAY.published = true;
  }
});

test('a variant that does not exist is rejected, not guessed', async () => {
  seed();
  await assert.rejects(
    priceItems([{ id: VIRGIL.id, name: VIRGIL.title, variantId: 'vrg-m-red', price: '70.00' }]),
    /no longer available/,
  );
});

test('before launch a product cannot be bought even with a valid id', async () => {
  __setPrintifyCacheForTests(withLocalProducts([], { now: BEFORE_LAUNCH, env: {} }));
  await assert.rejects(
    priceItems([{ id: STANDARD.id, name: STANDARD.title, variantId: vid(STANDARD, 'M', 'Black'), price: '50.00' }]),
    /no longer available/,
  );
});

test('a two-item order ships at the top tier plus one additional-item fee', async () => {
  seed();
  const priced = await priceItems([
    { id: STANDARD.id, name: STANDARD.title, variantId: vid(STANDARD, 'M', 'White'), price: '50.00' },
    { id: VIRGIL.id, name: VIRGIL.title, variantId: vid(VIRGIL, 'M', 'Black'), price: '70.00' },
  ]);
  const t = computeTotals(priced, { country: 'US' });
  assert.strictEqual(t.subtotalCents, 12000);
  assert.strictEqual(t.shippingCents, 400 + 150);
});

// ── the real /api/products response ──────────────────────────────────────────
let server, base;
before(async () => {
  process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS = '1';
  await new Promise(res => { server = app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); delete process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS; });

test('/api/products returns both, shaped the way the storefront reads them', async () => {
  const { products } = await (await fetch(`${base}/api/products`)).json();
  const std = products.find(p => p.id === STANDARD.id);
  const vrg = products.find(p => p.id === VIRGIL.id);
  assert.ok(std && vrg, 'both products present');

  assert.strictEqual(std.category, 'tee');
  assert.strictEqual(vrg.category, 'hoodie');
  for (const p of [std, vrg]) {
    assert.strictEqual(p.fulfillment, 'tapstitch', 'routes to the owner-email TapStitch path');
    assert.strictEqual(p.preorder, false);
    assert.deepStrictEqual(p.sizes, ['S', 'M', 'L', 'XL', '2XL']);
    assert.ok(p.img.startsWith('https://2amcases.online/assets/products/'), 'absolute image url (og:image needs it)');
    assert.strictEqual(p.images[0], p.img);
    assert.ok(p.content && p.content.sizeChart.rows.length === 5);
    assert.strictEqual(p.badge, 'NEW', 'routing tags only, so the card badge is NEW');
  }
  assert.strictEqual(std.price, '50.00');
  assert.strictEqual(vrg.price, '70.00');
  assert.deepStrictEqual(std.colors, ['Black', 'White', 'Heather Gray']);
  assert.deepStrictEqual(vrg.colors, ['Black', 'Light Gray', 'Haze Blue', 'Dark Green']);
});

test('/api/products includes the jeans and sweatpants too, correctly shaped, now that they are published', async () => {
  const { products } = await (await fetch(`${base}/api/products`)).json();
  const msy = products.find(p => p.id === MAINSTAY.id);
  const rst = products.find(p => p.id === REST.id);
  assert.ok(msy && rst, 'both present');
  assert.strictEqual(msy.category, 'bottom'); assert.strictEqual(rst.category, 'bottom');
  for (const p of [msy, rst]) {
    assert.strictEqual(p.fulfillment, 'tapstitch');
    assert.deepStrictEqual(p.sizes, ['S', 'M', 'L', 'XL', '2XL']);
    assert.ok(p.content && p.content.sizeChart.rows.length === 5);
  }
  assert.strictEqual(msy.price, '80.00');
  assert.strictEqual(rst.price, '70.00');
  assert.deepStrictEqual(msy.colors, ['Washed Black', 'Washed Blue', 'Washed Gray']);
  assert.deepStrictEqual(rst.colors, ['Black', 'Slate Blue', 'Heather Gray']);
});

test('/api/calculate-shipping quotes a local product from the server\'s own price', async () => {
  const r = await fetch(`${base}/api/calculate-shipping`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: VIRGIL.id, name: VIRGIL.title, variantId: vid(VIRGIL, 'L', 'Black'), price: '0.01' }],
      shippingAddress: { zip: '33101', state: 'FL', country: 'US' },
    }),
  });
  const q = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(q));
  assert.strictEqual(q.subtotal, '70.00');
  assert.strictEqual(q.shipping, '4.00');
});
