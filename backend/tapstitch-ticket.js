// The email that tells the owner exactly what to place at TapStitch.
//
// TapStitch has no order-placement API for a custom site (its automation only
// pulls orders from a connected Shopify/WooCommerce/etc. store), so every TapStitch
// order is placed by hand in its checkout. Two facts from TapStitch's own help
// pages shape this ticket:
//   1. Its checkout form requires a real phone number, and it is not responsible
//      for reshipping when the phone or address is wrong.
//   2. It does not refund checkout mistakes (wrong size, color, quantity).
// So the ticket's job is to make the hand-off exact: every field TapStitch asks for,
// in the order it asks, with TapStitch's own names for items and colors, a
// verify-before-you-pay line, and a ready-to-send "shipped" draft for the customer.
//
// Customer emails stay drafted-and-tapped, never auto-sent (house rule): the
// "shipped" note is a mailto link the owner opens, fills in and sends.

const { LOCAL_PRODUCTS } = require('./local-products');

const tapstitchProduct = id => LOCAL_PRODUCTS.find(p => p.id === String(id) && p.tapstitch) || null;

// US-only shop today: 10 digits, optionally with a leading country code 1.
function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return /^1?\d{10}$/.test(digits);
}

// True when any line is a locally-defined TapStitch product. Looked up by product
// id on the server, never from the `fulfillment` flag the browser sends.
function requiresPhone(items) {
  return (items || []).some(i => tapstitchProduct(i.id));
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SHIPPING_NOTE =
  'The site tells customers to allow up to 5 weeks. Choose the TapStitch shipping method that promise assumes, ' +
  'and write down which one you chose. If TapStitch offers a US-fulfillment option for this item, note that too.';

function buildTapstitchTicket({ items, shippingAddress = {}, email, transactionId, orderId, now = new Date() }) {
  const a = shippingAddress || {};
  const fullName = `${a.firstName || ''} ${a.lastName || ''}`.trim();
  const country = !a.country || a.country === 'US' ? 'United States' : a.country;
  const lines = items.map((i, idx) => {
    const lp = tapstitchProduct(i.id);
    const tap = lp ? lp.tapstitch : null;
    const color = i.color && i.color !== '—' ? i.color : '';
    const tapColor = tap && color ? (tap.colors[color] || color) : color;
    return {
      n: idx + 1,
      name: i.name,
      item: tap ? tap.item : '(not a local TapStitch product: check the product manually)',
      url: tap ? tap.url : '',
      size: i.size && i.size !== '—' ? i.size : '',
      tapColor,
      storeColor: tapColor !== color ? color : '',
      print: tap ? tap.print : '',
      price: i.price,
      note: (i.notes || '').trim(),
    };
  });
  const N = lines.length;
  const when = now.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  const first = lines[0];
  const subject = `Place at TapStitch: ${first.name}${first.size ? ` (${first.tapColor ? first.tapColor + ' / ' : ''}${first.size})` : ''}${N > 1 ? ` +${N - 1} more` : ''} — ${orderId}`;

  const addr = [
    ['Name', fullName],
    ['Phone', a.phone || '(none: do not place until you have one)'],
    ['Address line 1', a.line1 || ''],
    ['Address line 2', a.line2 || '(none)'],
    ['City', a.city || ''],
    ['State', a.state || ''],
    ['ZIP', a.zip || ''],
    ['Country', country],
    ['Email', email || ''],
  ];

  const names = lines.map(l => l.name).join(', ');
  const draftSubject = 'Your 2AM order has shipped';
  const draftBody =
    `Hi ${a.firstName || 'there'},\n\nYour 2AM order has shipped.\n\nItems: ${names}\nOrder reference: ${transactionId}\n\n` +
    `Tracking number: [PASTE TRACKING NUMBER]\nCarrier: [PASTE CARRIER IF SHOWN]\n\n` +
    `If anything looks wrong when it arrives, reply to this email and we will sort it out.\n\n2AM`;
  const mailto = `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(draftSubject)}&body=${encodeURIComponent(draftBody)}`;

  // ── plain text ──
  const t = [];
  t.push(`PLACE AT TAPSTITCH — ${orderId}`);
  t.push(`Received ${when} ET`);
  t.push('');
  t.push('BEFORE YOU PAY: check every line below against the TapStitch cart.');
  t.push('TapStitch does not refund checkout mistakes (wrong size, color or quantity), and wrong addresses or phone numbers come back at your cost.');
  t.push('');
  t.push(N > 1 ? `ITEMS: add all ${N} to ONE TapStitch cart so they ship together.` : 'ITEM');
  for (const l of lines) {
    t.push('');
    t.push(`${l.n}. ${l.name}   (qty 1, customer paid $${l.price})`);
    t.push(`   TapStitch item : ${l.item}`);
    if (l.url) t.push(`   Open           : ${l.url}`);
    t.push(`   Color          : ${l.tapColor || '(none)'}${l.storeColor ? `   [the site calls it "${l.storeColor}"]` : ''}`);
    t.push(`   Size           : ${l.size || '(none)'}`);
    if (l.print) t.push(`   Print          : ${l.print}`);
    if (l.note) t.push(`   CUSTOMER NOTE  : "${l.note}"   <- needs a human decision; TapStitch cannot act on it`);
  }
  t.push('');
  t.push('SHIP TO (enter exactly as shown)');
  for (const [k, v] of addr) t.push(`   ${k.padEnd(14)}: ${v}`);
  t.push('');
  t.push('SHIPPING METHOD');
  t.push(`   ${SHIPPING_NOTE}`);
  t.push('');
  t.push('AFTER YOU SUBMIT');
  t.push('   1. Write the TapStitch order number here: ______________');
  t.push('      (You can cancel only while it shows "In Review".)');
  t.push('   2. When TapStitch emails the tracking number, open this link. It drafts the customer\'s "shipped" email; paste the tracking number and send:');
  t.push(`      ${mailto}`);
  t.push(`   Reference: ${transactionId}`);
  const text = t.join('\n');

  // ── html: one field per row, values in monospace so a double-click selects them ──
  const row = (k, v) => `<tr><td style="padding:3px 12px 3px 0;color:#666;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-family:Menlo,Consolas,monospace">${v}</td></tr>`;
  const itemBlocks = lines.map(l => `
    <div style="border:1px solid #ddd;border-radius:6px;padding:12px 14px;margin:10px 0">
      <div style="font-weight:600">${l.n}. ${esc(l.name)} <span style="font-weight:400;color:#666">(qty 1, customer paid $${esc(l.price)})</span></div>
      <table style="border-collapse:collapse;margin-top:6px">
        ${row('TapStitch item', esc(l.item))}
        ${l.url ? row('Open', `<a href="${esc(l.url)}">${esc(l.url)}</a>`) : ''}
        ${row('Color', `${esc(l.tapColor || '(none)')}${l.storeColor ? ` <span style="color:#666;font-family:inherit">[the site calls it "${esc(l.storeColor)}"]</span>` : ''}`)}
        ${row('Size', esc(l.size || '(none)'))}
        ${l.print ? row('Print', esc(l.print)) : ''}
      </table>
      ${l.note ? `<div style="margin-top:8px;padding:8px;background:#fff3cd;border-radius:4px"><b>Customer note:</b> "${esc(l.note)}"<br>Needs a human decision; TapStitch cannot act on it.</div>` : ''}
    </div>`).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:640px">
  <h2 style="margin:0 0 2px">Place at TapStitch</h2>
  <div style="color:#666">${esc(orderId)} · received ${esc(when)} ET</div>
  <div style="margin:14px 0;padding:10px 12px;background:#fdecea;border-left:4px solid #c0392b">
    <b>Before you pay:</b> check every line against the TapStitch cart. TapStitch does not refund checkout mistakes (wrong size, color or quantity), and wrong addresses or phone numbers come back at your cost.
  </div>
  <h3 style="margin:16px 0 0">${N > 1 ? `Items: add all ${N} to ONE TapStitch cart` : 'Item'}</h3>
  ${itemBlocks}
  <h3 style="margin:16px 0 4px">Ship to (enter exactly as shown)</h3>
  <table style="border-collapse:collapse">${addr.map(([k, v]) => row(k, esc(v))).join('')}</table>
  <h3 style="margin:16px 0 4px">Shipping method</h3>
  <div>${esc(SHIPPING_NOTE)}</div>
  <h3 style="margin:16px 0 4px">After you submit</h3>
  <ol style="margin:0;padding-left:20px">
    <li>Write the TapStitch order number here: ______________ <span style="color:#666">(cancel only while it shows "In Review")</span></li>
    <li>When TapStitch emails the tracking number, <a href="${mailto}">tap here to draft the customer's "shipped" email</a>, paste the tracking number and send.</li>
  </ol>
  <div style="color:#888;margin-top:16px;font-size:12px">Reference: ${esc(transactionId)}</div>
</div>`;

  return { subject, text, html, mailto };
}

module.exports = { buildTapstitchTicket, isValidPhone, requiresPhone };
