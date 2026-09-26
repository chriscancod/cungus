// The owner's "you got an order" email is sent for EVERY paid order. The first real order
// (2026-09-26, a Printify decal) would have produced no owner email even with email working,
// because the server only ever emailed the owner for TapStitch, preorder, Clikey and failure
// cases. These tests pin what that email must always say.
const { test } = require('node:test');
const assert = require('node:assert');
const { buildOwnerOrderEmail } = require('../order-alert.js');

const addr = (o = {}) => ({ firstName: 'Jane', lastName: 'Doe', line1: '12 Ocean Dr', line2: 'Apt 4B', city: 'Miami', state: 'FL', zip: '33101', country: 'US', phone: '(305) 555-0142', ...o });
const base = (o = {}) => ({
  items: [{ id: 'p1', name: 'Kiss-Cut Vinyl Decals', size: 'M', color: 'Black', price: '8.00', fulfillment: 'printify' }],
  shippingAddress: addr(), email: 'jane@example.com', transactionId: 'SQ_PAY_1', printifyOrderId: 'pf_123',
  subtotal: '8.00', shipping: '3.50', tax: '0.48', discount: '0.00', total: '11.98', now: new Date('2026-09-26T14:42:00Z'), ...o,
});

test('an ordinary Printify order says so, and that nothing is needed from the owner', () => {
  const m = buildOwnerOrderEmail(base());
  assert.match(m.subject, /^New 2AM order \$11\.98: Kiss-Cut Vinyl Decals$/);
  assert.ok(!m.needsAction && !/ACTION NEEDED/.test(m.subject));
  assert.match(m.text, /Printify: submitted automatically \(order pf_123\)/);
  assert.match(m.text, /Nothing to do/);
  assert.match(m.text, /Payment reference \(Square\): SQ_PAY_1/);
  assert.match(m.text, /Charged \$11\.98/);
});

test('it carries who, where and how much', () => {
  const t = buildOwnerOrderEmail(base()).text;
  for (const s of ['Jane Doe', 'jane@example.com', '(305) 555-0142', '12 Ocean Dr', 'Apt 4B', 'Miami, FL 33101', 'United States', 'M / Black', 'Shipping $3.50', 'Tax $0.48']) assert.ok(t.includes(s), `missing ${s}`);
});

test('a TapStitch item flags ACTION NEEDED in the subject and points to the ticket', () => {
  const m = buildOwnerOrderEmail(base({ items: [{ id: 'x', name: 'The Standard Long Sleeve Tee', size: 'L', color: 'Black', price: '50.00', fulfillment: 'tapstitch' }], printifyOrderId: null, tapstitchOrderId: 'ts-SQ_PAY_1', total: '56.75' }));
  assert.ok(m.needsAction);
  assert.match(m.subject, /\(ACTION NEEDED\)$/);
  assert.match(m.text, /TAPSTITCH: you place this by hand/);
  assert.match(m.text, /TapStitch order ref: ts-SQ_PAY_1/);
});

test('a failed Printify submission and a preorder are both flagged', () => {
  assert.match(buildOwnerOrderEmail(base({ printifyFailed: true })).subject, /ACTION NEEDED/);
  assert.match(buildOwnerOrderEmail(base({ printifyFailed: true })).text, /PRINTIFY FAILED/);
  const pre = buildOwnerOrderEmail(base({ items: [{ name: 'Hoodie', price: '60.00', preorder: true }], printifyOrderId: null }));
  assert.match(pre.text, /PREORDER: not submitted/); assert.ok(pre.needsAction);
});

test('a mixed order lists every line with its own route, and the subject counts the rest', () => {
  const m = buildOwnerOrderEmail(base({ items: [
    { name: 'Decals', price: '8.00', fulfillment: 'printify' },
    { name: 'The Rest Sweatpants', size: 'L', color: 'Slate Blue', price: '70.00', fulfillment: 'tapstitch' },
  ] }));
  assert.match(m.subject, /Decals \+1 more \(ACTION NEEDED\)/);
  assert.match(m.text, /1\. Decals: \$8\.00\n\s+Printify: submitted automatically/);
  assert.match(m.text, /2\. The Rest Sweatpants \(L \/ Slate Blue\): \$70\.00\n\s+TAPSTITCH/);
});

test('a discount and coupon code are shown; a zero discount is not', () => {
  assert.match(buildOwnerOrderEmail(base({ discount: '5.00', couponCode: 'SAVE5' })).text, /Discount -\$5\.00 \(SAVE5\)/);
  assert.ok(!/Discount/.test(buildOwnerOrderEmail(base()).text));
});

test('a customer note is echoed for the owner; customer-typed text is escaped in the HTML', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const m = buildOwnerOrderEmail(base({ items: [{ name: 'Decals', price: '8.00', fulfillment: 'printify', notes: evil }], shippingAddress: addr({ firstName: evil, line1: '"><script>x</script>' }) }));
  assert.match(m.text, /Customer note: "<img src=x/);
  assert.ok(!m.html.includes('<img src=x') && !m.html.includes('<script>x'), 'raw markup leaked into the HTML');
  assert.ok(m.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('missing optional details do not break it', () => {
  const m = buildOwnerOrderEmail(base({ shippingAddress: {}, email: undefined, printifyOrderId: undefined }));
  assert.match(m.text, /\(no name\)/); assert.match(m.text, /\(no email\)/);
  assert.match(m.text, /Printify: not submitted \(check the logs\)/);
});
