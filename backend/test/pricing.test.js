// Pricing must never trust the browser. These tests exist because /api/payment
// used to build the Square charge straight from req.body.items[].price, so a
// tampered cart could buy a $47 hoodie for a penny.
const { test } = require('node:test');
const assert = require('node:assert');

const {
  priceItems, computeTotals, computeTaxCents, __setPrintifyCacheForTests,
} = require('../server.js');

// Shaped like real Printify data: variant prices in cents, per-variant.
// Mirrors the live Revive hoodie, which really does range $47.77–$54.62.
const CATALOG = [{
  id: 'prod_hoodie',
  title: 'Revive hoodie',
  tags: ['revive'],
  variants: [
    { id: 'v_s',   price: 4777, is_enabled: true },
    { id: 'v_2xl', price: 5462, is_enabled: true },
    { id: 'v_old', price: 4777, is_enabled: false },
  ],
}];

function seed() { __setPrintifyCacheForTests(CATALOG); }

const line = (over = {}) => ({ id: 'prod_hoodie', name: 'Revive hoodie', variantId: 'v_s', price: '47.77', ...over });

test('a tampered price is ignored — Printify wins', async () => {
  seed();
  const priced = await priceItems([line({ price: '0.01' })]);
  assert.strictEqual(priced[0].priceCents, 4777);
  assert.strictEqual(priced[0].price, '47.77');
});

test('the tampered order total is the real total, not a penny', async () => {
  seed();
  const priced = await priceItems([line({ price: '0.01' })]);
  const { subtotalCents, totalCents } = computeTotals(priced, { country: 'US' });
  assert.strictEqual(subtotalCents, 4777);
  assert.strictEqual(totalCents, 4777 + 499);
});

test('a pricier variant is charged at its own price, not the cheapest', async () => {
  seed();
  // The storefront cart carries the product's cheapest-variant price even when
  // a bigger size is selected, so this is the normal path, not an attack.
  const priced = await priceItems([line({ variantId: 'v_2xl', price: '47.77' })]);
  assert.strictEqual(priced[0].priceCents, 5462);
});

test('an unknown product is rejected', async () => {
  seed();
  await assert.rejects(
    () => priceItems([line({ id: 'prod_nope' })]),
    (e) => e.status === 400 && /no longer available/i.test(e.message)
  );
});

test('an unknown variant is rejected rather than falling back to a default price', async () => {
  seed();
  await assert.rejects(
    () => priceItems([line({ variantId: 'v_fake' })]),
    (e) => e.status === 400 && /no longer available/i.test(e.message)
  );
});

test('a disabled variant is rejected', async () => {
  seed();
  await assert.rejects(
    () => priceItems([line({ variantId: 'v_old' })]),
    (e) => e.status === 400 && /sold out/i.test(e.message)
  );
});

test('the synthetic Clikey is priced server-side too', async () => {
  seed();
  const priced = await priceItems([{ id: 'clikey-custom', name: 'Custom Clikey', price: '0.01' }]);
  assert.strictEqual(priced[0].priceCents, 500);
});

test('multiple lines each resolve independently', async () => {
  seed();
  const priced = await priceItems([
    line({ variantId: 'v_s', price: '0.01' }),
    line({ variantId: 'v_2xl', price: '0.01' }),
  ]);
  assert.deepStrictEqual(priced.map(p => p.priceCents), [4777, 5462]);
  const { subtotalCents } = computeTotals(priced, { country: 'US' });
  assert.strictEqual(subtotalCents, 4777 + 5462);
});

test('tax is zero unless a rate is configured for the state', () => {
  // SALES_TAX_RATES is unset in this test env, so every state must be zero.
  assert.strictEqual(computeTaxCents(10000, { state: 'FL', country: 'US' }), 0);
  assert.strictEqual(computeTaxCents(10000, { state: 'NY', country: 'US' }), 0);
  assert.strictEqual(computeTaxCents(10000, {}), 0);
});

test('international orders are never taxed here', () => {
  assert.strictEqual(computeTaxCents(10000, { state: 'ON', country: 'CA' }), 0);
});
