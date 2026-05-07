require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Client, Environment } = require('square');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const PRINTIFY_BASE = 'https://api.printify.com/v1';
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENV === 'production'
    ? Environment.Production
    : Environment.Sandbox,
});

function pHeaders() {
  return {
    'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': '2AMStore/1.0',
  };
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', store: '2AM' });
});

// GET all products from Printify
app.get('/api/products', async (req, res) => {
  try {
    const r = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/products.json?limit=20`, { headers: pHeaders() });
    if (!r.ok) return res.status(r.status).json({ error: 'Printify fetch failed' });
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
      printProviderId: p.print_provider_id,
      badge: p.tags?.[0]?.toUpperCase() || 'NEW',
      tag: p.tags?.[1] || '2AM Collection',
      sizes: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[0]).filter(Boolean))],
      colors: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[1]).filter(Boolean))],
    }));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const r = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/products/${req.params.id}.json`, { headers: pHeaders() });
    if (!r.ok) return res.status(r.status).json({ error: 'Product not found' });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST process Square payment + create Printify order
app.post('/api/payment', async (req, res) => {
  const { token, items, total, shippingAddress, email } = req.body;
  if (!token || !items?.length) return res.status(400).json({ error: 'Missing token or items' });

  try {
    // 1. Charge Square
    const { result } = await squareClient.paymentsApi.createPayment({
      sourceId: token,
      idempotencyKey: `2am-${Date.now()}`,
      amountMoney: { amount: BigInt(Math.round(total * 100)), currency: 'USD' },
      locationId: process.env.SQUARE_LOCATION_ID,
      note: '2AM Streetwear Order',
      buyerEmailAddress: email || undefined,
    });
    const paymentId = result.payment?.id;
    if (!paymentId) throw new Error('Square payment failed');
    console.log('Square payment OK:', paymentId);

    // 2. Create Printify order
    let printifyOrderId = null;
    if (shippingAddress) {
      const lineItems = items.map(item => ({
        product_id: item.id,
        variant_id: item.variantId || item.variants?.[0]?.id,
        quantity: 1,
      }));

      const orderBody = {
        external_id: `2am-${paymentId}`,
        label: `2AM Order ${new Date().toLocaleDateString()}`,
        line_items: lineItems,
        shipping_method: 1,
        send_shipping_notification: true,
        address_to: {
          first_name: shippingAddress.firstName,
          last_name: shippingAddress.lastName,
          email: email || '',
          phone: shippingAddress.phone || '',
          country: 'US',
          region: shippingAddress.state,
          address1: shippingAddress.line1,
          address2: shippingAddress.line2 || '',
          city: shippingAddress.city,
          zip: shippingAddress.zip,
        },
      };

      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST',
        headers: pHeaders(),
        body: JSON.stringify(orderBody),
      });

      if (pr.ok) {
        const pOrder = await pr.json();
        printifyOrderId = pOrder.id;
        console.log('Printify order OK:', printifyOrderId);
      } else {
        console.error('Printify order failed:', await pr.text());
      }
    }

    res.json({ success: true, paymentId, printifyOrderId });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST upload custom graphic to Printify
app.post('/api/upload-graphic', async (req, res) => {
  const { imageBase64, fileName } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });
  try {
    const r = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
      method: 'POST',
      headers: pHeaders(),
      body: JSON.stringify({
        file_name: fileName || 'custom.png',
        contents: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Upload failed' });
    const data = await r.json();
    res.json({ uploadId: data.id, previewUrl: data.preview_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST drop email signup
app.post('/api/drop-signup', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'No email' });
  console.log('Drop signup:', email);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`2AM backend running on port ${PORT}`));
