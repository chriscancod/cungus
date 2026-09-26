// The "you got an order" email to the owner: sent for EVERY paid order, whatever fulfills it.
//
// Before this existed the server only emailed the owner for TapStitch items (the hand-off
// ticket), preorders, Clikey items and Printify failures, so an ordinary Printify order
// (like the first real order, 2026-09-26) produced no owner email at all even with email
// working. This is the single place that says: an order came in, who it is from, what they
// bought, where it is going, what it cost, and what happened to it (auto-submitted to
// Printify / needs placing at TapStitch / preorder). It contains customer contact details,
// so it goes to OWNER_EMAIL only.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => `$${Number(v || 0).toFixed(2)}`;

// What became of one cart line. Order matters: a preorder is never auto-fulfilled.
function routeFor(item, { printifyOrderId, printifyFailed }) {
  if (item.type === 'clikey') return 'Clikey (made by hand: see the separate Clikey email)';
  if (item.type === 'hardware') return 'Hardware preorder (ships when ready)';
  if (item.preorder) return 'PREORDER: not submitted; ships when ready';
  if (item.fulfillment === 'tapstitch') return 'TAPSTITCH: you place this by hand (see the "Place at TapStitch" ticket email)';
  if (printifyFailed) return 'PRINTIFY FAILED: needs your attention (see the Printify failure email)';
  return printifyOrderId ? `Printify: submitted automatically (order ${printifyOrderId})` : 'Printify: not submitted (check the logs)';
}

function buildOwnerOrderEmail({
  items, shippingAddress = {}, email, transactionId, printifyOrderId, tapstitchOrderId, printifyFailed,
  subtotal, shipping, tax, discount, total, couponCode, now = new Date(),
}) {
  const a = shippingAddress || {};
  const name = `${a.firstName || ''} ${a.lastName || ''}`.trim() || '(no name)';
  const when = now.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  const lines = items.map((i, idx) => {
    const variant = [i.size && i.size !== '—' ? i.size : '', i.color && i.color !== '—' ? i.color : ''].filter(Boolean).join(' / ');
    return {
      n: idx + 1, name: i.name || '(item)', variant, price: i.price,
      route: routeFor(i, { printifyOrderId, printifyFailed }), note: (i.notes || '').trim(),
    };
  });
  const N = lines.length;
  const needsAction = lines.some(l => /^(TAPSTITCH|PRINTIFY FAILED|PREORDER)/.test(l.route));
  const subject = `New 2AM order ${money(total)}: ${lines[0].name}${N > 1 ? ` +${N - 1} more` : ''}${needsAction ? ' (ACTION NEEDED)' : ''}`;

  const addr = [
    a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ` ${a.zip}` : ''), a.country && a.country !== 'US' ? a.country : 'United States',
  ].filter(Boolean);

  const t = [];
  t.push(`NEW ORDER: ${money(total)}`);
  t.push(`Received ${when} ET`);
  t.push(`Payment reference (Square): ${transactionId}`);
  if (printifyOrderId) t.push(`Printify order: ${printifyOrderId}`);
  if (tapstitchOrderId) t.push(`TapStitch order ref: ${tapstitchOrderId}`);
  t.push('');
  t.push(needsAction ? '>>> ACTION NEEDED: see the lines marked below.' : 'Nothing to do: everything in this order was handled automatically.');
  t.push('');
  t.push('ITEMS');
  for (const l of lines) {
    t.push(`  ${l.n}. ${l.name}${l.variant ? ` (${l.variant})` : ''}: ${money(l.price)}`);
    t.push(`     ${l.route}`);
    if (l.note) t.push(`     Customer note: "${l.note}"`);
  }
  t.push('');
  t.push('CUSTOMER');
  t.push(`  ${name}`);
  t.push(`  ${email || '(no email)'}${a.phone ? `   ${a.phone}` : ''}`);
  t.push('SHIP TO');
  for (const l of addr) t.push(`  ${l}`);
  t.push('');
  t.push('TOTALS');
  t.push(`  Items ${money(subtotal)}   Shipping ${money(shipping)}   Tax ${money(tax)}${Number(discount) > 0 ? `   Discount -${money(discount)}${couponCode ? ` (${couponCode})` : ''}` : ''}`);
  t.push(`  Charged ${money(total)}`);
  const text = t.join('\n');

  const row = (k, v) => `<tr><td style="padding:2px 12px 2px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0">${v}</td></tr>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:620px">
  <h2 style="margin:0 0 2px">New order: ${esc(money(total))}</h2>
  <div style="color:#666">Received ${esc(when)} ET · Square ${esc(transactionId)}${printifyOrderId ? ` · Printify ${esc(printifyOrderId)}` : ''}${tapstitchOrderId ? ` · ${esc(tapstitchOrderId)}` : ''}</div>
  <div style="margin:12px 0;padding:10px 12px;border-left:4px solid ${needsAction ? '#c0392b' : '#2e7d32'};background:${needsAction ? '#fdecea' : '#eef7ee'}">
    ${needsAction ? '<b>Action needed:</b> see the lines marked below.' : 'Nothing to do: everything in this order was handled automatically.'}
  </div>
  <h3 style="margin:14px 0 4px">Items</h3>
  ${lines.map(l => `<div style="margin:6px 0"><b>${l.n}. ${esc(l.name)}</b>${l.variant ? ` (${esc(l.variant)})` : ''}: ${esc(money(l.price))}<br><span style="color:#555">${esc(l.route)}</span>${l.note ? `<br><span style="background:#fff3cd;padding:1px 4px">Customer note: "${esc(l.note)}"</span>` : ''}</div>`).join('')}
  <h3 style="margin:14px 0 4px">Customer</h3>
  <table style="border-collapse:collapse">${row('Name', esc(name))}${row('Email', esc(email || '(no email)'))}${a.phone ? row('Phone', esc(a.phone)) : ''}${row('Ship to', addr.map(esc).join('<br>'))}</table>
  <h3 style="margin:14px 0 4px">Totals</h3>
  <table style="border-collapse:collapse">${row('Items', esc(money(subtotal)))}${row('Shipping', esc(money(shipping)))}${row('Tax', esc(money(tax)))}${Number(discount) > 0 ? row('Discount', `-${esc(money(discount))}${couponCode ? ` (${esc(couponCode)})` : ''}`) : ''}${row('Charged', `<b>${esc(money(total))}</b>`)}</table>
</div>`;

  return { subject, text, html, needsAction };
}

module.exports = { buildOwnerOrderEmail };
