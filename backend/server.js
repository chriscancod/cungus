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

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const r = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/products.json?limit=20`, { headers: pHeaders() });
    if (!r.ok) return res.status(r.status).json({ error: 'Printify error' });
    const data = await r.json();
    const products = (data.data || []).map(p => ({
      id: p.id,
      name: p.title,
      desc: (p.description || '').replace(/<[^>]*>/g, '').slice(0, 200),
      price: p.variants?.[0]?.price ? (p.variants[0].price / 100) : 0,
      img: p.images?.[0]?.src || '',
      images: (p.images || []).map(i => i.src),
      variants: p.variants || [],
      blueprintId: p.blueprint_id,
      badge: (p.tags?.[0] || 'NEW').toUpperCase(),
      tag: p.tags?.[1] || '2AM Collection',
      sizes: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[0]).filter(Boolean))],
      colors: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[1]).filter(Boolean))],
    }));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create Stripe PaymentIntent
app.post('/api/create-payment-intent', async (req, res) => {
  const { items, email } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items' });
  const total = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  try {
    const intent = await stripe.paymentIntents.create({
      amount: total,
      currency: 'usd',
      receipt_email: email || undefined,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST confirm payment + create Printify order
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
          })),
          shipping_method: 1,
          send_shipping_notification: true,
          address_to: {
            first_name: shippingAddress.firstName,
            last_name: shippingAddress.lastName,
            email: email || '',
            phone: '',
            country: 'US',
            region: shippingAddress.state,
            address1: shippingAddress.line1,
            address2: shippingAddress.line2 || '',
            city: shippingAddress.city,
            zip: shippingAddress.zip,
          },
        }),
      });
      if (pr.ok) { const po = await pr.json(); printifyOrderId = po.id; console.log('Printify OK:', printifyOrderId); }
      else console.error('Printify failed:', await pr.text());
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