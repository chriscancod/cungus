// Customers should never see the supplier's name on a product badge or fulfillment tag.
// (Privacy, terms and FAQ pages still name the print partners on purpose.)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PAGES = ['product.html', 'catalog.html', 'index.html', 'about.html'];

test('no storefront page puts the supplier name on a badge or a "made to order" tag', () => {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(!/Made to order · (?:TapStitch|Tapstitch)/.test(html), `${page}: supplier name in the made-to-order tag`);
    assert.ok(!/'Tapstitch'/.test(html), `${page}: supplier name used as a badge label`);
    if (/fulfillment-tag tapstitch/.test(html)) assert.match(html, /Made to order · '\+TAPSTITCH_LEAD/, `${page}: tag text lost its lead time`);
  }
});

test('the khaki and royal blue swatch colors exist on every page that draws swatches', () => {
  for (const page of ['product.html', 'catalog.html', 'index.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /'khaki':'#c6b198'/, page);
    assert.match(html, /'royal blue':'#2c324f'/, page);
  }
});
