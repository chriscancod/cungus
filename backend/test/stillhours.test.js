// The Stillhours Double-Waist Sweatpants (TapStitch RK0012). These checks cover this
// product only, so they do not depend on the older shared tests in local-products.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products.js');
const { computeTotals } = require('../server.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const p = LOCAL_PRODUCTS.find(x => x.id === '2am-the-stillhours');
const BANNED = /\b(vintage|retro|normcore|barrel|infrared|heat preservation|heavyweight|premium|luxury|limited|exclusive|hurry|selling fast|best[- ]?seller|handcrafted|artisan\w*|iconic|elevated|trend\w*|must[- ]have|timeless|built to last|lightweight)\b/i;

test('product exists, is TapStitch RK0012, and the title says sweatpants', () => {
  assert.ok(p, 'product registered');
  assert.strictEqual(p.tapstitch.item, 'RK0012');
  assert.match(p.title, /sweatpants/i);
});

test('12 variants: S-XL x Black/White/Flower Gray, all $45, unique ids', () => {
  assert.strictEqual(p.variants.length, 12);
  assert.strictEqual(new Set(p.variants.map(v => v.id)).size, 12);
  for (const v of p.variants) {
    const [size, color] = v.title.split(' / ');
    assert.ok(['S', 'M', 'L', 'XL'].includes(size), v.title);
    assert.ok(['Black', 'White', 'Flower Gray'].includes(color), v.title);
    assert.strictEqual(v.price, 4500);
    assert.strictEqual(v.is_enabled, true);
    assert.strictEqual(v.is_available, true);
  }
});

test('every image file exists and each has a descriptive alt text', () => {
  assert.strictEqual(p.images.length, 19);
  for (const img of p.images) {
    const rel = img.src.replace('https://2amcases.online/', '');
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `missing file: ${rel}`);
  }
  assert.strictEqual(p.content.imageAlts.length, p.images.length);
  assert.ok(p.content.imageAlts.every(a => a.trim().length > 20));
});

test('storefront description fits the 200-char cut; copy has no banned words or placeholders', () => {
  assert.ok(p.description.length <= 200, `${p.description.length} chars`);
  const text = JSON.stringify({ title: p.title, description: p.description, content: p.content });
  assert.ok(!/\[(CONFIRM|SELECT)/i.test(text));
  assert.ok(!BANNED.test(text), `banned word: ${(text.match(BANNED) || [])[0]}`);
});

test('the verified RK0012 specs appear and nothing contradicts them', () => {
  const specs = JSON.stringify(p.content.specs);
  assert.match(specs, /81% cotton, 19% polyester/);
  assert.match(specs, /280 gsm/);
  assert.match(p.description, /unisex/i);
});

test('size chart lists S-XL with matching columns', () => {
  const sc = p.content.sizeChart;
  assert.deepStrictEqual(sc.rows.map(r => r[0]), ['S', 'M', 'L', 'XL']);
  for (const r of sc.rows) assert.strictEqual(r.length, sc.columns.length);
});

test('it is shown by default and also in the staged-preview mode', () => {
  const live = withLocalProducts([], { now: Date.now(), env: {} });
  assert.ok(live.some(x => x.id === p.id));
  const preview = withLocalProducts([], { now: 0, env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } });
  assert.ok(preview.some(x => x.id === p.id));
});

test('classified as sweatpants: shipping uses the $4.00 bottoms tier, not the $3.75 generic tier', () => {
  const t = computeTotals([{ name: p.title, priceCents: 4500 }], { country: 'US' });
  assert.strictEqual(t.subtotalCents, 4500);
  assert.strictEqual(t.shippingCents, 400);
});
