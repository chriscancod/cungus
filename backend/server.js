require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Lazy-init Stripe so a missing key doesn't crash the whole server ──────────
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const PRINTIFY_BASE = 'https://api.printify.com/v1';
const SHOP_ID       = process.env.PRINTIFY_SHOP_ID;
const SHOW_TAG      = 'showfloor';

// ── In-memory WARDROBE code store ────────────────────────────────────────────
const WARDROBE_CODES = {};

function pHeaders() {
  return {
    'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
    'Content-Type':  'application/json',
    'User-Agent':    '2AMStore/1.0',
  };
}

function generateWardrobeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg   = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const num   = Math.floor(Math.random() * 900 + 100);
  return `WARDROBE-${seg}-${num}`;
}

async function fetchAllPrintifyProducts() {
  let all = [], page = 1, hasMore = true;
  while (hasMore) {
    const r = await fetch(
      `${PRINTIFY_BASE}/shops/${SHOP_ID}/products.json?limit=20&page=${page}`,
      { headers: pHeaders() }
    );
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Printify error ${r.status}: ${txt}`);
    }
    const data  = await r.json();
    const batch = data.data || [];
    all       = all.concat(batch);
    hasMore   = batch.length === 20;
    page++;
    if (page > 10) break;
  }
  return all;
}

function getClothingType(name) {
  const n = name.toLowerCase();
  if (n.includes('hoodie') || n.includes('sweatshirt')) return 'hoodie';
  if (n.includes('tee') || n.includes('t-shirt') || n.includes('shirt')) return 'tee';
  if (n.includes('case') || n.includes('phone')) return 'accessory';
  if (n.includes('pants') || n.includes('jogger') || n.includes('shorts')) return 'bottom';
  if (n.includes('jacket') || n.includes('coat')) return 'outerwear';
  if (n.includes('hat') || n.includes('cap')) return 'headwear';
  return 'top';
}

function shapeProduct(p, wardrobeData = false) {
  const enabled  = (p.variants || []).filter(v => v.is_enabled !== false);
  const cheapest = enabled.length ? enabled[0] : p.variants?.[0];
  const rawPrice = cheapest?.price || 0;
  const price    = (rawPrice > 500 ? rawPrice / 100 : rawPrice).toFixed(2);
  const tags     = (p.tags || []).map(t => t.toLowerCase());

  const base = {
    id:          p.id,
    name:        p.title,
    desc:        (p.description || '').replace(/<[^>]*>/g, '').slice(0, 200),
    price,
    img:         p.images?.[0]?.src || '',
    images:      (p.images || []).map(i => i.src),
    variants:    p.variants || [],
    blueprintId: p.blueprint_id,
    fulfillment: tags.includes('tapstitch') ? 'tapstitch' : 'printify',
    badge:       (p.tags || []).find(t => !['showfloor','tapstitch','iceman'].includes(t.toLowerCase()))?.toUpperCase() || 'NEW',
    tag:         (p.tags || []).find(t => !['showfloor','tapstitch'].includes(t.toLowerCase())) || '2AM Collection',
    sizes:       [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[0]).filter(Boolean))],
    colors:      [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[1]).filter(Boolean))],
  };

  if (wardrobeData) {
    const clothingType  = getClothingType(p.title);
    const collection    = p.title.toLowerCase().includes('iceman') ? 'Iceman' : 'General';
    const variantColors = base.colors.map(c => c.toLowerCase());
    base.wardrobe = {
      clothingType, collection, brand: '2AM',
      colorPalette: variantColors,
      matchKeywords: [p.title.toLowerCase(), clothingType, collection.toLowerCase(), '2am', ...variantColors, ...tags].filter(Boolean),
      allImages: base.images,
      recommendedPairings: (clothingType === 'tee' || clothingType === 'hoodie')
        ? ['cargo pants', 'joggers', 'jeans', 'white sneakers', 'black sneakers']
        : clothingType === 'bottom' ? ['graphic tee', 'hoodie', 'oversized shirt'] : [],
    };
  }
  return base;
}

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'ok', store: '2AM', version: '3.0.0' }));

// ── /api/products — showfloor-tagged products only ───────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const all      = await fetchAllPrintifyProducts();
    const products = all
      .filter(p => !p.title.toLowerCase().includes('custom'))
      .map(p => shapeProduct(p, false));
    console.log(`/api/products → ${products.length} products`);
    res.json({ products, total: products.length });
  } catch (err) {
    console.error('/api/products error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/wardrobe/catalog — full catalog for clothing recognition ─────────────
app.get('/api/wardrobe/catalog', async (req, res) => {
  const key = req.headers['x-wardrobe-key'];
  if (process.env.WARDROBE_API_KEY && key !== process.env.WARDROBE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const all      = await fetchAllPrintifyProducts();
    const products = all.map(p => shapeProduct(p, true));
    res.json({ brand: '2AM', totalProducts: products.length, lastUpdated: new Date().toISOString(), products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /api/wardrobe/validate-code ───────────────────────────────────────────────
app.post('/api/wardrobe/validate-code', (req, res) => {
  const { code, userId } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const key    = code.trim().toUpperCase();
  const record = WARDROBE_CODES[key];
  if (!record)         return res.status(404).json({ error: 'Invalid code. Check for typos.' });
  if (record.claimed)  return res.status(409).json({ error: 'This code has already been used.' });
  WARDROBE_CODES[key].claimed   = true;
  WARDROBE_CODES[key].claimedAt = new Date().toISOString();
  WARDROBE_CODES[key].claimedBy = userId || 'unknown';
  console.log(`✅ WARDROBE code claimed: ${key}`);
  res.json({
    success: true, code: key,
    product: {
      id: record.productId, name: record.productName,
      collection: record.collection || '2AM',
      img: record.productImg, images: record.productImages || [],
      colors: record.productColors || [], clothingType: record.clothingType || 'top',
      price: record.price, size: record.size, color: record.color, orderId: record.orderId,
    },
  });
});

// ── /api/calculate-shipping ───────────────────────────────────────────────────
app.post('/api/calculate-shipping', (req, res) => {
  const { items, shippingAddress } = req.body;
  if (!items?.length || !shippingAddress?.zip) return res.status(400).json({ error: 'Missing items or address' });
  const isUS          = !shippingAddress.country || shippingAddress.country === 'US';
  const shippingCents = isUS
    ? 499 + Math.max(0, items.length - 1) * 150
    : 1499 + Math.max(0, items.length - 1) * 300;
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const totalCents    = subtotalCents + shippingCents;
  res.json({
    subtotal: (subtotalCents / 100).toFixed(2),
    shipping: (shippingCents / 100).toFixed(2),
    tax: '0.00',
    total: (totalCents / 100).toFixed(2),
    totalCents,
  });
});

// ── /api/create-payment-intent ────────────────────────────────────────────────
app.post('/api/create-payment-intent', async (req, res) => {
  const { items, email, shippingAddress } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items' });
  const isUS          = !shippingAddress?.country || shippingAddress?.country === 'US';
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const shippingCents = isUS
    ? 499 + Math.max(0, items.length - 1) * 150
    : 1499 + Math.max(0, items.length - 1) * 300;
  const totalCents = subtotalCents + shippingCents;
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount:   totalCents,
      currency: 'usd',
      receipt_email: email || undefined,
      automatic_payment_methods: { enabled: true },
      metadata: { store: '2AM', itemCount: String(items.length) },
    });
    res.json({
      clientSecret: intent.client_secret,
      subtotal: (subtotalCents / 100).toFixed(2),
      shipping: (shippingCents / 100).toFixed(2),
      total:    (totalCents / 100).toFixed(2),
    });
  } catch (err) {
    console.error('/api/create-payment-intent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/payment — confirm payment + Printify order + WARDROBE codes ─────────
app.post('/api/payment', async (req, res) => {
  const { paymentIntentId, items, shippingAddress, email } = req.body;
  if (!paymentIntentId || !items?.length) return res.status(400).json({ error: 'Missing data' });
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not confirmed' });
    console.log('✅ Stripe payment:', paymentIntentId);

    const printifyItems  = items.filter(i => i.fulfillment !== 'tapstitch');
    const tapstitchItems = items.filter(i => i.fulfillment === 'tapstitch');
    let printifyOrderId  = null;
    let tapstitchOrderId = null;

    // Printify order
    if (printifyItems.length && shippingAddress) {
      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST', headers: pHeaders(),
        body: JSON.stringify({
          external_id: `2am-${paymentIntentId}`,
          label: '2AM Order',
          line_items: printifyItems.map(i => ({ product_id: i.id, variant_id: i.variantId, quantity: 1 })),
          shipping_method: 1,
          send_shipping_notification: true,
          address_to: {
            first_name: shippingAddress.firstName, last_name: shippingAddress.lastName,
            email: email || '', phone: shippingAddress.phone || '',
            country: shippingAddress.country || 'US', region: shippingAddress.state,
            address1: shippingAddress.line1, address2: shippingAddress.line2 || '',
            city: shippingAddress.city, zip: shippingAddress.zip,
          },
        }),
      });
      if (pr.ok) { const po = await pr.json(); printifyOrderId = po.id; console.log('✅ Printify order:', printifyOrderId); }
      else console.error('⚠️ Printify failed:', await pr.text());
    }

    // TapStitch (manual fulfillment)
    if (tapstitchItems.length) {
      tapstitchOrderId = `ts-${paymentIntentId}`;
      console.log('🧵 TapStitch order:', { orderId: tapstitchOrderId, customer: { email, ...shippingAddress }, items: tapstitchItems.map(i => ({ name: i.name, size: i.size, color: i.color, notes: i.notes, price: i.price })) });
    }

    // Generate WARDROBE codes
    const wardrobeCodes = items.map(item => {
      const code = generateWardrobeCode();
      WARDROBE_CODES[code] = {
        productId: item.id, productName: item.name, productImg: item.img,
        productImages: item.images || [], productColors: item.colors || [],
        clothingType: getClothingType(item.name || ''),
        collection: (item.name || '').toLowerCase().includes('iceman') ? 'Iceman' : 'General',
        price: item.price, size: item.size, color: item.color,
        orderId: printifyOrderId || tapstitchOrderId,
        email, createdAt: new Date().toISOString(),
        claimed: false, claimedAt: null, claimedBy: null,
      };
      console.log(`🎟️ WARDROBE code: ${code} for "${item.name}"`);
      return { code, productName: item.name, productImg: item.img };
    });

    res.json({
      success: true, paymentIntentId, printifyOrderId, tapstitchOrderId,
      wardrobeCodes,
      wardrobeMessage: `You have ${wardrobeCodes.length} WARDROBE activation code${wardrobeCodes.length !== 1 ? 's' : ''}. Open WARDROBE → Add Clothes → Enter Code.`,
    });
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/drop-signup ─────────────────────────────────────────────────────────
app.post('/api/drop-signup', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'No email' });
  console.log('📧 Drop signup:', email);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`2AM backend on port ${PORT}`));
