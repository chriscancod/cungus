require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const PRINTIFY_BASE = 'https://api.printify.com/v1';
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;

function pHeaders() {
  return {
    'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': '2AMStore/1.0',
  };
}

app.get('/', (req, res) => res.json({ status: 'ok', store: '2AM' }));

// GET all products — paginates to get all
app.get('/api/products', async (req, res) => {
  try {
    let allProducts = [], page = 1, hasMore = true;
    while (hasMore) {
      const r = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/products.json?limit=20&page=${page}`, { headers: pHeaders() });
      if (!r.ok) return res.status(r.status).json({ error: 'Printify error' });
      const data = await r.json();
      const batch = data.data || [];
      allProducts = allProducts.concat(batch);
      hasMore = batch.length === 20;
      page++;
      if (page > 10) break;
    }
    const products = allProducts.map(p => {
      const enabledVariants = (p.variants || []).filter(v => v.is_enabled !== false);
      const cheapest = enabledVariants.length ? enabledVariants[0] : p.variants?.[0];
      const rawPrice = cheapest?.price || 0;
      const price = rawPrice > 500 ? (rawPrice / 100).toFixed(2) : rawPrice.toFixed(2);
      return {
        id: p.id,
        name: p.title,
        desc: (p.description || '').replace(/<[^>]*>/g, '').slice(0, 200),
        price,
        img: p.images?.[0]?.src || '',
        images: (p.images || []).map(i => i.src),
        variants: p.variants || [],
        blueprintId: p.blueprint_id,
        badge: (p.tags?.[0] || 'NEW').toUpperCase(),
        tag: p.tags?.[1] || '2AM Collection',
        sizes: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[0]).filter(Boolean))],
        colors: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[1]).filter(Boolean))],
      };
    });
    res.json({ products, total: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculate-shipping — returns shipping cost for the cart
// Uses a flat-rate approach based on item count (Printify doesn't expose
// shipping costs via API without a full order calculation)
app.post('/api/calculate-shipping', async (req, res) => {
  const { items, shippingAddress } = req.body;
  if (!items?.length || !shippingAddress?.zip) {
    return res.status(400).json({ error: 'Missing items or address' });
  }

  // Flat rate shipping by item count — adjust these to match what
  // Printify actually charges you (check your Printify shipping settings)
  const itemCount = items.length;
  let shippingCents;

  const state = (shippingAddress.state || '').toUpperCase();
  const isUS = !shippingAddress.country || shippingAddress.country === 'US';

  if (isUS) {
    // US domestic: $4.99 first item + $1.50 each additional
    shippingCents = 499 + Math.max(0, itemCount - 1) * 150;
  } else {
    // International: $14.99 first + $3.00 each additional
    shippingCents = 1499 + Math.max(0, itemCount - 1) * 300;
  }

  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const taxRate = 0; // Set your tax rate here if needed (e.g. 0.08 for 8%)
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + shippingCents + taxCents;

  res.json({
    subtotal: (subtotalCents / 100).toFixed(2),
    shipping: (shippingCents / 100).toFixed(2),
    tax: (taxCents / 100).toFixed(2),
    total: (totalCents / 100).toFixed(2),
    totalCents,
  });
});

// POST /api/create-payment-intent
app.post('/api/create-payment-intent', async (req, res) => {
  const { items, email, shippingAddress } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items' });

  // Calculate total including shipping
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const itemCount = items.length;
  const isUS = !shippingAddress?.country || shippingAddress?.country === 'US';
  const shippingCents = isUS
    ? 499 + Math.max(0, itemCount - 1) * 150
    : 1499 + Math.max(0, itemCount - 1) * 300;
  const totalCents = subtotalCents + shippingCents;

  try {
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      receipt_email: email || undefined,
      automatic_payment_methods: { enabled: true },
      metadata: {
        store: '2AM',
        itemCount: String(itemCount),
        shippingCents: String(shippingCents),
      },
    });
    res.json({
      clientSecret: intent.client_secret,
      subtotal: (subtotalCents / 100).toFixed(2),
      shipping: (shippingCents / 100).toFixed(2),
      total: (totalCents / 100).toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment — confirm + create Printify order
app.post('/api/payment', async (req, res) => {
  const { paymentIntentId, items, shippingAddress, email } = req.body;
  if (!paymentIntentId || !items?.length) return res.status(400).json({ error: 'Missing data' });
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not confirmed' });
    console.log('Stripe OK:', paymentIntentId);

    let printifyOrderId = null;
    if (shippingAddress) {
      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST',
        headers: pHeaders(),
        body: JSON.stringify({
          external_id: `2am-${paymentIntentId}`,
          label: '2AM Order',
          line_items: items.map(i => ({
            product_id: i.id,
            variant_id: i.variantId,
            quantity: 1,
            // Pass personalization notes if present
            print_details: i.notes ? [{ note: i.notes }] : undefined,
          })),
          shipping_method: 1,
          send_shipping_notification: true,
          address_to: {
            first_name: shippingAddress.firstName,
            last_name: shippingAddress.lastName,
            email: email || '',
            phone: shippingAddress.phone || '',
            country: shippingAddress.country || 'US',
            region: shippingAddress.state,
            address1: shippingAddress.line1,
            address2: shippingAddress.line2 || '',
            city: shippingAddress.city,
            zip: shippingAddress.zip,
          },
        }),
      });
      if (pr.ok) {
        const po = await pr.json();
        printifyOrderId = po.id;
        console.log('Printify OK:', printifyOrderId);
      } else {
        console.error('Printify failed:', await pr.text());
      }
    }
    res.json({ success: true, paymentIntentId, printifyOrderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drop-signup', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'No email' });
  console.log('Drop signup:', email);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`2AM backend on port ${PORT}`));