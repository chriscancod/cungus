// The Overtime Track Pants (TapStitch RK0015). Staged until Chris confirms the name and price,
// so besides the product facts these tests check that it can NOT reach customers by accident.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const nf = require.resolve('node-fetch');
require.cache[nf] = {
  id: nf, filename: nf, loaded: true,
  exports: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' }),
};

const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products.js');
const { computeTotals } = require('../server.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const p = LOCAL_PRODUCTS.find(x => x.id === '2am-the-overtime');
const BANNED = /\b(vintage|retro|normcore|barrel|infrared|heat preservation|heavyweight|premium|luxury|limited|exclusive|hurry|selling fast|best[- ]?seller|handcrafted|artisan\w*|iconic|elevated|trend\w*|must[- ]have|timeless|built to last|lightweight)\b/i;

test('product exists, is TapStitch RK0015, and the title says pants', () => {
  assert.ok(p, 'product registered');
  assert.strictEqual(p.tapstitch.item, 'RK0015');
  assert.match(p.tapstitch.url, /^https:\/\/www\.tapstitch\.com\/custom\/\d{15,}$/);
  assert.match(p.title, /pants/i);
});

test('15 variants: S-2XL x Black/Khaki/Royal Blue, all $50, unique ids', () => {
  assert.strictEqual(p.variants.length, 15);
  assert.strictEqual(new Set(p.variants.map(v => v.id)).size, 15);
  for (const v of p.variants) {
    const [size, color] = v.title.split(' / ');
    assert.ok(['S', 'M', 'L', 'XL', '2XL'].includes(size), v.title);
    assert.ok(['Black', 'Khaki', 'Royal Blue'].includes(color), v.title);
    assert.strictEqual(v.price, 5000);
    assert.strictEqual(v.is_enabled, true);
    assert.strictEqual(v.is_available, true);
  }
});

test('19 images exist on disk, are web-sized, and each has a descriptive alt text', () => {
  assert.strictEqual(p.images.length, 19);
  let total = 0;
  for (const img of p.images) {
    const rel = img.src.replace('https://2amcases.online/', '');
    const file = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(file), `missing file: ${rel}`);
    assert.ok(fs.statSync(file).size < 400 * 1024, `${rel} is too heavy for a phone`);
    total += fs.statSync(file).size;
  }
  assert.ok(total < 3 * 1024 * 1024, `all images total ${(total / 1048576).toFixed(1)} MB`);
  assert.strictEqual(p.content.imageAlts.length, p.images.length);
  assert.ok(p.content.imageAlts.every(a => a.trim().length > 20));
  assert.deepStrictEqual(p.images.slice(0, 6).map(i => i.position), ['front', 'back', 'front', 'back', 'front', 'back']);
});

test('storefront description fits the 200-char cut; copy has no banned words, placeholders, supplier name or item codes', () => {
  assert.ok(p.description.length <= 200, `${p.description.length} chars`);
  const text = JSON.stringify({ title: p.title, description: p.description, content: p.content });
  assert.ok(!/\[(CONFIRM|SELECT)/i.test(text));
  assert.ok(!BANNED.test(text), `banned word: ${(text.match(BANNED) || [])[0]}`);
  assert.ok(!/tapstitch/i.test(text) && !/\b[A-Z]{2}\d{4}\b/.test(text), 'supplier name or code in customer copy');
});

test('the verified RK0015 specs appear and nothing contradicts them', () => {
  const specs = JSON.stringify(p.content.specs);
  assert.match(specs, /65\.6% cotton, 34\.4% polyester/);
  assert.match(specs, /100% polyester/);
  assert.match(specs, /340 gsm \(10\.0 oz\/yd²\)/);
  assert.match(p.description, /unisex/i);
  assert.match(p.description, /S–2XL/);
  assert.match(p.content.paragraphs.join(' '), /6'1" \(186 cm\), 139 lb, and wears size 2XL/);
});

test('size chart lists S-2XL with matching columns', () => {
  const sc = p.content.sizeChart;
  assert.deepStrictEqual(sc.rows.map(r => r[0]), ['S', 'M', 'L', 'XL', '2XL']);
  for (const r of sc.rows) assert.strictEqual(r.length, sc.columns.length);
});

test('the ticket tells the person ordering exactly what to print and where', () => {
  assert.match(p.tapstitch.print, /DTF/);
  assert.match(p.tapstitch.print, /front/);
  assert.match(p.tapstitch.print, /2am/);
  assert.ok(p.tapstitch.print.length > 40);
});

test('STAGED: hidden from customers by default, visible in the preview mode', () => {
  assert.strictEqual(p.published, false);
  const live = withLocalProducts([], { now: Date.now(), env: {} });
  assert.ok(!live.some(x => x.id === p.id), 'must not be live before Chris confirms');
  const preview = withLocalProducts([], { now: 0, env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } });
  assert.ok(preview.some(x => x.id === p.id));
});

test('classified as pants: shipping uses the $4.00 bottoms tier, not the $3.75 generic tier', () => {
  const t = computeTotals([{ name: p.title, priceCents: 5000 }], { country: 'US' });
  assert.strictEqual(t.subtotalCents, 5000);
  assert.strictEqual(t.shippingCents, 400);
});
