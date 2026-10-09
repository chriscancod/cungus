// The Weekday Button-Up Shirt (TapStitch UT0197). Pins the things that would hurt on a live store:
// the price is the server's, not the browser's; its colors are all actually visible in the color
// picker (this storefront SILENTLY HIDES a color name its swatch map doesn't know, which is exactly
// what would have happened to "Sky Blue"); and the order ticket tells the owner there is NO print,
// because the supplied mockups carry no 2AM mark.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const nf = require.resolve('node-fetch');
require.cache[nf] = { id: nf, filename: nf, loaded: true,
  exports: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' }) };

const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products.js');
const { buildTapstitchTicket } = require('../tapstitch-ticket.js');
const { priceItems, computeTotals, __setPrintifyCacheForTests } = require('../server.js');

const W = LOCAL_PRODUCTS.find(p => p.id === '2am-the-weekday');
const REPO = path.join(__dirname, '..', '..');
const vid = (size, color) => W.variants.find(v => v.title === `${size} / ${color}`).id;

test('the product exists, is published with no launch gate, and is visible in the default catalog', () => {
  assert.ok(W);
  assert.equal(W.published, true);
  assert.ok(!W.launchAt);
  assert.ok(withLocalProducts([], { env: {} }).includes(W));
});

test('15 variants, S–2XL × White / Light Green / Sky Blue, all $55, unique ids, all enabled', () => {
  assert.equal(W.variants.length, 15);
  assert.equal(new Set(W.variants.map(v => v.id)).size, 15);
  const colors = new Set(W.variants.map(v => v.title.split(' / ')[1]));
  assert.deepEqual([...colors].sort(), ['Light Green', 'Sky Blue', 'White']);
  for (const v of W.variants) {
    assert.ok(['S', 'M', 'L', 'XL', '2XL'].includes(v.title.split(' / ')[0]));
    assert.equal(v.price, 5500); assert.equal(v.is_enabled, true); assert.equal(v.is_available, true);
  }
});

test('all 19 images exist on disk and each has its own alt text', () => {
  assert.equal(W.images.length, 19);
  assert.equal(W.content.imageAlts.length, 19);
  for (const img of W.images) assert.ok(fs.existsSync(path.join(REPO, new URL(img.src).pathname.replace(/^\//, ''))), img.src);
  assert.ok(W.content.imageAlts.every(a => a.length > 30));
  assert.equal(W.images[0].position, 'front', 'the first image (the card photo) is a flat front');
});

test('it is a shirt for shipping ($3.75 tier) and carries its measured size chart', () => {
  assert.equal(computeTotals([{ name: W.title, priceCents: 5500 }], { country: 'US' }).shippingCents, 375);
  const sc = W.content.sizeChart;
  assert.deepEqual(sc.rows.map(r => r[0]), ['S', 'M', 'L', 'XL', '2XL']);
  for (const r of sc.rows) assert.equal(r.length, sc.columns.length);
  assert.match(sc.rows[0][1], /^23\.62 in \/ 60 cm$/, "S chest matches TapStitch's chart");
  assert.match(sc.rows[2][2], /^25\.98 in \/ 66 cm$/, "L length matches TapStitch's chart");
});

test('the server prices every size at $55 and ignores a tampered client price', async () => {
  __setPrintifyCacheForTests(withLocalProducts([], { env: {} }));
  for (const size of ['S', 'L', '2XL']) {
    const [priced] = await priceItems([{ id: W.id, name: W.title, variantId: vid(size, 'Sky Blue'), price: '0.01' }]);
    assert.equal(priced.priceCents, 5500, size);
  }
});

test('every color name is recognized by the swatch map on all three pages, with its OWN swatch (not a hidden or wrong one)', () => {
  // Mirrors the storefront's own logic: a color is hidden unless some swatch key is a substring of its
  // name, and the swatch is the FIRST key that matches. "Light Green" must not fall through to the dark
  // 'green' swatch, and "Sky Blue" must not be dropped for matching nothing.
  const own = { 'white': null, 'light green': '#e9efe3', 'sky blue': '#c7dffc' };
  for (const page of ['product.html', 'catalog.html', 'index.html']) {
    const html = fs.readFileSync(path.join(REPO, page), 'utf8');
    const map = html.match(/const YOUR_COLORS=\{([^}]*)\}/)[1];
    const entries = [...map.matchAll(/'([^']+)':'(#[0-9a-fA-F]{6})'/g)].map(m => [m[1], m[2]]);
    for (const color of ['White', 'Light Green', 'Sky Blue']) {
      const hit = entries.find(([k]) => color.toLowerCase().includes(k));
      assert.ok(hit, `${page}: "${color}" matches no swatch key, so the page would HIDE it`);
      if (own[color.toLowerCase()]) assert.equal(hit[1], own[color.toLowerCase()], `${page}: "${color}" resolved to the wrong swatch ${hit[0]}`);
    }
  }
});

test('the owner ticket says NO PRINT and points at the right TapStitch item', () => {
  const t = buildTapstitchTicket({
    items: [{ id: W.id, name: W.title, size: 'M', color: 'Sky Blue', price: '55.00' }],
    shippingAddress: { firstName: 'Jane', lastName: 'Doe', line1: '1 Main St', city: 'Miami', state: 'FL', zip: '33101', country: 'US', phone: '(305) 555-0142' },
    email: 'jane@example.com', transactionId: 'SQ_1', orderId: 'ts-SQ_1',
  });
  assert.match(t.text, /TapStitch item : UT0197/);
  assert.match(t.text, /ut0197-unisex-boxy-long-sleeve-shirt/);
  assert.match(t.text, /Print\s+: NONE: order the blank garment/);
  assert.match(t.text, /Color\s+: Sky Blue\n/, "TapStitch's name is the same, so no annotation");
});

test('the copy makes no claim it cannot back: no print/logo claim contradicting the images, no fit or durability promise', () => {
  const text = JSON.stringify({ d: W.description, c: W.content });
  assert.match(text, /No print|There is no print|None\. A plain, unprinted/i);
  assert.ok(!/french cuff/i.test(text), "TapStitch's text says French cuffs but its own photo shows a single-button cuff");
  assert.ok(!/(durable|lasts?|built to last|true to size|fits? (perfectly|true))/i.test(text));
  assert.ok(!/\[(CONFIRM|SELECT)/.test(text));
});
