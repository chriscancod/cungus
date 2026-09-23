// The hand-off ticket the owner works from when placing a TapStitch order by hand, and the
// phone-number safety net that keeps an unplaceable order from being charged. TapStitch's
// own help pages: its checkout requires a phone number, and it does not refund checkout
// mistakes or cover reshipping for a wrong address/phone. These tests pin what the ticket
// must always contain.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const nf = require.resolve('node-fetch');
require.cache[nf] = {
  id: nf, filename: nf, loaded: true,
  exports: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' }),
};

const { LOCAL_PRODUCTS, withLocalProducts } = require('../local-products.js');
const { buildTapstitchTicket, isValidPhone, requiresPhone } = require('../tapstitch-ticket.js');
const { app, __setPrintifyCacheForTests } = require('../server.js');

const byId = id => LOCAL_PRODUCTS.find(p => p.id === id);
const MAINSTAY = byId('2am-the-mainstay');
const REST = byId('2am-the-rest');
const STANDARD = byId('2am-the-standard');
const vid = (p, size, color) => p.variants.find(v => v.title === `${size} / ${color}`).id;

const address = (over = {}) => ({
  firstName: 'Jane', lastName: 'Doe', line1: '12 Ocean Dr', line2: 'Apt 4B', city: 'Miami', state: 'FL', zip: '33101',
  country: 'US', phone: '(305) 555-0142', ...over,
});
const jeansLine = (over = {}) => ({ id: MAINSTAY.id, name: MAINSTAY.title, size: 'M', color: 'Washed Gray', price: '80.00', variantId: vid(MAINSTAY, 'M', 'Washed Gray'), ...over });
const restLine = (over = {}) => ({ id: REST.id, name: REST.title, size: 'L', color: 'Slate Blue', price: '70.00', variantId: vid(REST, 'L', 'Slate Blue'), ...over });
const ticket = (items, addr = address(), extra = {}) =>
  buildTapstitchTicket({ items, shippingAddress: addr, email: 'jane@example.com', transactionId: 'SQ_PAY_123', orderId: 'ts-SQ_PAY_123', ...extra });

// ── phone rules ──────────────────────────────────────────────────────────────
test('phone validation: 10 digits, optional leading 1, any punctuation', () => {
  for (const ok of ['3055550142', '(305) 555-0142', '+1 305-555-0142', '1-305-555-0142']) assert.ok(isValidPhone(ok), ok);
  for (const bad of ['', '   ', '555-0142', '30555501423', '1', 'abc', null, undefined, '2 3055550142']) assert.ok(!isValidPhone(bad), String(bad));
});

test('only locally-defined TapStitch products require a phone, decided server-side by id', () => {
  assert.ok(requiresPhone([jeansLine()]));
  assert.ok(requiresPhone([{ id: 'some-printify-id' }, restLine()]));
  assert.ok(!requiresPhone([{ id: 'some-printify-id', fulfillment: 'printify' }]));
  // a browser cannot opt out by lying about the fulfillment flag
  assert.ok(requiresPhone([jeansLine({ fulfillment: 'printify' })]));
  assert.ok(!requiresPhone([]) && !requiresPhone(undefined));
});

// ── ticket content ───────────────────────────────────────────────────────────
test('the ticket carries every field TapStitch\'s checkout asks for, with TapStitch\'s own names', () => {
  const t = ticket([jeansLine()]);
  assert.match(t.text, /TapStitch item : UB0029/);
  assert.match(t.text, /https:\/\/www\.tapstitch\.com\/custom\/ub0029-unisex-vintage-wash-straight-leg-jeans/);
  assert.match(t.text, /Color          : Light Gray   \[the site calls it "Washed Gray"\]/, 'maps to TapStitch\'s color name');
  assert.match(t.text, /Size           : M/);
  assert.match(t.text, /Print          : DTG · back · back pocket/);
  for (const line of ['Jane Doe', '(305) 555-0142', '12 Ocean Dr', 'Apt 4B', 'Miami', 'FL', '33101', 'United States', 'jane@example.com']) {
    assert.ok(t.text.includes(line), `missing ${line}`);
  }
  assert.match(t.text, /BEFORE YOU PAY/);
  assert.match(t.text, /does not refund checkout mistakes/);
  assert.match(t.subject, /Place at TapStitch: The Mainstay Jeans \(Light Gray \/ M\) — ts-SQ_PAY_123/);
});

test('colors that already match TapStitch are not annotated', () => {
  const t = ticket([restLine({ color: 'Black', variantId: vid(REST, 'L', 'Black') })]);
  assert.match(t.text, /Color          : Black\n/);
  assert.ok(!t.text.includes('the site calls it'));
  assert.match(ticket([restLine()]).text, /Color          : Haze Blue   \[the site calls it "Slate Blue"\]/);
});

test('a missing address line 2 and a missing phone are shown loudly, not silently dropped', () => {
  const t = ticket([jeansLine()], address({ line2: '', phone: '' }));
  assert.match(t.text, /Address line 2: \(none\)/);
  assert.match(t.text, /Phone +: \(none: do not place until you have one\)/);
});

test('several items go in ONE TapStitch cart and the subject says how many', () => {
  const t = ticket([jeansLine(), restLine()]);
  assert.match(t.text, /add all 2 to ONE TapStitch cart/);
  assert.match(t.text, /1\. The Mainstay Jeans/);
  assert.match(t.text, /2\. The Rest Sweatpants/);
  assert.match(t.text, /UB0029/); assert.match(t.text, /UB0051/);
  assert.match(t.subject, /\+1 more/);
});

test('a customer note is flagged for a human, since TapStitch cannot act on it', () => {
  const t = ticket([jeansLine({ notes: 'please embroider my name' })]);
  assert.match(t.text, /CUSTOMER NOTE  : "please embroider my name"/);
  assert.match(t.html, /Customer note:/);
});

test('the shipped-email draft is a one-tap mailto for the customer, never auto-sent', () => {
  const t = ticket([jeansLine()]);
  assert.ok(t.mailto.startsWith('mailto:jane%40example.com?subject='), t.mailto.slice(0, 50));
  const params = new URLSearchParams(t.mailto.split('?')[1]);
  assert.strictEqual(params.get('subject'), 'Your 2AM order has shipped');
  assert.match(params.get('body'), /Hi Jane,/);
  assert.match(params.get('body'), /Tracking number: \[PASTE TRACKING NUMBER\]/);
  assert.match(params.get('body'), /The Mainstay Jeans/);
  assert.ok(t.html.includes(`href="${t.mailto}"`));
});

test('customer-typed text is escaped in the HTML email', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const t = ticket([jeansLine({ notes: evil })], address({ firstName: evil, line1: evil, line2: '"><script>x</script>' }));
  assert.ok(!t.html.includes('<img src=x'), 'raw tag leaked');
  assert.ok(!t.html.includes('<script>x'), 'raw script leaked');
  assert.ok(t.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('a non-local item gets a clear "check manually" line instead of a made-up TapStitch code', () => {
  const t = ticket([{ id: 'some-printify-id', name: 'Some Product', size: 'M', color: 'Black', price: '40.00' }]);
  assert.match(t.text, /not a local TapStitch product: check the product manually/);
});

test('every local TapStitch product has what the ticket needs: item code, a TapStitch URL and a print placement', () => {
  for (const p of LOCAL_PRODUCTS) {
    assert.match(p.tapstitch.item, /^[A-Z]{2}\d{4}$/, p.title);
    assert.ok(p.tapstitch.url.startsWith('https://www.tapstitch.com/custom/' + p.tapstitch.item.toLowerCase()), `${p.title} url`);
    assert.ok(p.tapstitch.print && p.tapstitch.print.length > 10, `${p.title} print placement`);
    // every storefront color either matches TapStitch or is mapped
    const colors = [...new Set(p.variants.map(v => v.title.split(' / ')[1]))];
    for (const c of colors) assert.ok(typeof (p.tapstitch.colors[c] || c) === 'string');
  }
});

// ── the server refuses to charge an order that cannot be placed ──────────────
let server, base;
before(async () => {
  process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS = '1';
  __setPrintifyCacheForTests(withLocalProducts([], { env: { SHOW_UNLAUNCHED_LOCAL_PRODUCTS: '1' } }));
  await new Promise(res => { server = app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); delete process.env.SHOW_UNLAUNCHED_LOCAL_PRODUCTS; });

test('/api/payment refuses a TapStitch order with no valid phone, before any charge', async () => {
  for (const phone of [undefined, '', '555-0142']) {
    const r = await fetch(`${base}/api/payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'cnon:fake', idempotencyKey: 'k-' + String(phone), email: 'jane@example.com',
        items: [jeansLine({ fulfillment: 'printify' })],           // lying about fulfillment changes nothing
        shippingAddress: address({ phone }),
      }),
    });
    const body = await r.json();
    assert.strictEqual(r.status, 400, `phone=${phone}: ${JSON.stringify(body)}`);
    assert.match(body.error, /phone number is required/);
    assert.match(body.error, /card was not charged/);
  }
});
