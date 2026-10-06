const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products');

test('Afterhours Henley has a unique catalog identity, $40 variants and all 21 local images', () => {
  const product = LOCAL_PRODUCTS.find(p => p.id === '2am-the-afterhours-henley');
  assert.ok(product);
  assert.ok(withLocalProducts([], { env: {} }).includes(product));
  assert.equal(product.tapstitch.item, 'RT0044-C001-V2');
  assert.equal(product.variants.length, 20);
  assert.equal(new Set(product.variants.map(v => v.id)).size, 20);
  assert.ok(product.variants.every(v => v.price === 4000 && v.is_enabled && v.is_available));
  assert.equal(product.images.length, 21);
  for (const image of product.images) {
    const relative = new URL(image.src).pathname.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(__dirname, '../..', relative)), relative);
  }
  assert.equal(product.content.imageAlts.length, 21);
});
