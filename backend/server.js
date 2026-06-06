require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const PRINTIFY_BASE = 'https://api.printify.com/v1';
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const SHOW_TAG = 'showfloor';

// ── In-memory WARDROBE code store ─────────────────────────────────────────────
// In production: move this to a database (Supabase, Railway Postgres, etc.)
const WARDROBE_CODES = {};
// Structure: { 'WARDROBE-X7K9-441': { productId, productName, orderId, email, createdAt, claimed, claimedAt } }

function pHeaders() {
  return {
    'Authorization': `Bearer ${process.env.PRINTIFY_API_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': '2AMStore/1.0',
  };
}

// ── WARDROBE activation code generator ───────────────────────────────────────
function generateWardrobeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 (confusing)
  const seg = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const num = Math.floor(Math.random() * 900 + 100); // 100-999
  return `WARDROBE-${seg}-${num}`;
}

// ── Fetch all Printify products ───────────────────────────────────────────────
async function fetchAllPrintifyProducts() {
  let allProducts = [], page = 1, hasMore = true;
  while (hasMore) {
    const r = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/products.json?limit=20&page=${page}`, { headers: pHeaders() });
    if (!r.ok) throw new Error('Printify fetch failed');
    const data = await r.json();
    const batch = data.data || [];
    allProducts = allProducts.concat(batch);
    hasMore = batch.length === 20;
    page++;
    if (page > 10) break;
  }
  return allProducts;
}

function shapeProduct(p, includeWardrobeData = false) {
  const enabledVariants = (p.variants || []).filter(v => v.is_enabled !== false);
  const cheapest = enabledVariants.length ? enabledVariants[0] : p.variants?.[0];
  const rawPrice = cheapest?.price || 0;
  const price = rawPrice > 500 ? (rawPrice / 100).toFixed(2) : rawPrice.toFixed(2);

  const base = {
    id: p.id,
    name: p.title,
    desc: (p.description || '').replace(/<[^>]*>/g, '').slice(0, 200),
    price,
    img: p.images?.[0]?.src || '',
    images: (p.images || []).map(i => i.src),
    variants: p.variants || [],
    blueprintId: p.blueprint_id,
    fulfillment: (p.tags || []).some(t => t.toLowerCase() === 'tapstitch') ? 'tapstitch' : 'printify',
    badge: (p.tags || []).find(t => !['showfloor','tapstitch','iceman'].includes(t.toLowerCase()))?.toUpperCase() || 'NEW',
    tag: p.tags?.find(t => !['showfloor','tapstitch'].includes(t.toLowerCase())) || '2AM Collection',
    sizes: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[0]).filter(Boolean))],
    colors: [...new Set((p.variants || []).map(v => v.title?.split(' / ')?.[1]).filter(Boolean))],
  };

  // Extra fields for WARDROBE clothing recognition
  if (includeWardrobeData) {
    // Derive clothing type from name/tags
    const nameLower = p.title.toLowerCase();
    let clothingType = 'top';
    if (nameLower.includes('hoodie') || nameLower.includes('sweatshirt')) clothingType = 'hoodie';
    else if (nameLower.includes('tee') || nameLower.includes('t-shirt') || nameLower.includes('shirt')) clothingType = 'tee';
    else if (nameLower.includes('case') || nameLower.includes('phone')) clothingType = 'accessory';
    else if (nameLower.includes('pants') || nameLower.includes('jogger') || nameLower.includes('shorts')) clothingType = 'bottom';
    else if (nameLower.includes('jacket') || nameLower.includes('coat')) clothingType = 'outerwear';
    else if (nameLower.includes('hat') || nameLower.includes('cap')) clothingType = 'headwear';

    // Derive collection
    let collection = 'General';
    if (nameLower.includes('iceman')) collection = 'Iceman';

    // Color palette from variant names
    const variantColors = base.colors.map(c => c.toLowerCase());

    base.wardrobe = {
      clothingType,
      collection,
      brand: '2AM',
      colorPalette: variantColors,
      // Keywords for AI matching — what words describe this piece visually
      matchKeywords: [
        p.title.toLowerCase(),
        clothingType,
        collection.toLowerCase(),
        '2am',
        ...variantColors,
        ...(p.tags || []).map(t => t.toLowerCase()),
      ].filter(Boolean),
      // All product images for visual comparison
      allImages: (p.images || []).map(i => i.src),
      // Recommended pairings (simple rule-based for now)
      recommendedPairings: clothingType === 'tee' || clothingType === 'hoodie'
        ? ['cargo pants', 'joggers', 'jeans', 'white sneakers', 'black sneakers']
        : clothingType === 'bottom'
        ? ['graphic tee', 'hoodie', 'oversized shirt']
        : [],
    };
  }

  return base;
}

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', store: '2AM', version: '2.0.0' }));

// ══════════════════════════════════════════════════════════════════════════════
// STORE — /api/products (showfloor only)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/products', async (req, res) => {
  try {
    const allProducts = await fetchAllPrintifyProducts();
    const products = allProducts
      .filter(p => (p.tags || []).some(t => t.toLowerCase() === SHOW_TAG))
      .map(p => shapeProduct(p, false));
    res.json({ products, total: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WARDROBE — /api/wardrobe/catalog
// Full product catalog for clothing recognition — no showfloor filter,
// includes extra wardrobe metadata. Protected by WARDROBE_API_KEY.
// The APEX backend calls this to build its matching database.
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/wardrobe/catalog', async (req, res) => {
  // Check WARDROBE API key — set WARDROBE_API_KEY in Railway env vars
  const key = req.headers['x-wardrobe-key'];
  if (process.env.WARDROBE_API_KEY && key !== process.env.WARDROBE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const allProducts = await fetchAllPrintifyProducts();
    // Return ALL products (no showfloor filter) with full wardrobe metadata
    const products = allProducts.map(p => shapeProduct(p, true));
    res.json({
      brand: '2AM',
      totalProducts: products.length,
      lastUpdated: new Date().toISOString(),
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WARDROBE — /api/wardrobe/validate-code
// WARDROBE app calls this to validate and claim an activation code
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/wardrobe/validate-code', async (req, res) => {
  const { code, userId } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const normalizedCode = code.trim().toUpperCase();
  const record = WARDROBE_CODES[normalizedCode];

  if (!record) return res.status(404).json({ error: 'Invalid code. Check for typos.' });
  if (record.claimed) return res.status(409).json({ error: 'This code has already been used.' });

  // Mark as claimed
  WARDROBE_CODES[normalizedCode].claimed = true;
  WARDROBE_CODES[normalizedCode].claimedAt = new Date().toISOString();
  WARDROBE_CODES[normalizedCode].claimedBy = userId || 'unknown';

  console.log(`✅ WARDROBE code claimed: ${normalizedCode} by ${userId}`);

  // Return the product data for WARDROBE to create the incoming item
  res.json({
    success: true,
    code: normalizedCode,
    product: {
      id: record.productId,
      name: record.productName,
      collection: record.collection || '2AM',
      img: record.productImg,
      images: record.productImages || [],
      colors: record.productColors || [],
      clothingType: record.clothingType || 'top',
      price: record.price,
      size: record.size,
      color: record.color,
      orderId: record.orderId,
    },
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHIPPING
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/calculate-shipping', async (req, res) => {
  const { items, shippingAddress } = req.body;
  if (!items?.length || !shippingAddress?.zip) {
    return res.status(400).json({ error: 'Missing items or address' });
  }
  const itemCount = items.length;
  const isUS = !shippingAddress.country || shippingAddress.country === 'US';
  const shippingCents = isUS
    ? 499 + Math.max(0, itemCount - 1) * 150
    : 1499 + Math.max(0, itemCount - 1) * 300;
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const totalCents = subtotalCents + shippingCents;
  res.json({
    subtotal: (subtotalCents / 100).toFixed(2),
    shipping: (shippingCents / 100).toFixed(2),
    tax: '0.00',
    total: (totalCents / 100).toFixed(2),
    totalCents,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT INTENT
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/create-payment-intent', async (req, res) => {
  const { items, email, shippingAddress } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'No items' });
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const isUS = !shippingAddress?.country || shippingAddress?.country === 'US';
  const shippingCents = isUS
    ? 499 + Math.max(0, items.length - 1) * 150
    : 1499 + Math.max(0, items.length - 1) * 300;
  const totalCents = subtotalCents + shippingCents;
  try {
    const intent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      receipt_email: email || undefined,
      automatic_payment_methods: { enabled: true },
      metadata: { store: '2AM', itemCount: String(items.length) },
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

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT CONFIRM — generates WARDROBE code per item
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/payment', async (req, res) => {
  const { paymentIntentId, items, shippingAddress, email } = req.body;
  if (!paymentIntentId || !items?.length) return res.status(400).json({ error: 'Missing data' });
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not confirmed' });
    console.log('✅ Stripe payment:', paymentIntentId);

    const printifyItems = items.filter(i => i.fulfillment !== 'tapstitch');
    const tapstitchItems = items.filter(i => i.fulfillment === 'tapstitch');

    let printifyOrderId = null;
    let tapstitchOrderId = null;

    // ── PRINTIFY ──────────────────────────────────────────
    if (printifyItems.length && shippingAddress) {
      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST',
        headers: pHeaders(),
        body: JSON.stringify({
          external_id: `2am-${paymentIntentId}`,
          label: '2AM Order',
          line_items: printifyItems.map(i => ({
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
        console.log('✅ Printify order:', printifyOrderId);
      } else {
        console.error('⚠️ Printify failed:', await pr.text());
      }
    }

    // ── TAPSTITCH ─────────────────────────────────────────
    if (tapstitchItems.length) {
      tapstitchOrderId = `ts-${paymentIntentId}`;
      console.log('🧵 TapStitch order:', {
        orderId: tapstitchOrderId,
        customer: { email, ...shippingAddress },
        items: tapstitchItems.map(i => ({ name: i.name, size: i.size, color: i.color, notes: i.notes, price: i.price })),
      });
    }

    // ── GENERATE WARDROBE ACTIVATION CODES ───────────────
    // One code per item purchased — customer enters each in WARDROBE
    const wardrobeCodes = items.map(item => {
      const code = generateWardrobeCode();

      // Determine clothing type from product name
      const nameLower = (item.name || '').toLowerCase();
      let clothingType = 'top';
      if (nameLower.includes('hoodie') || nameLower.includes('sweatshirt')) clothingType = 'hoodie';
      else if (nameLower.includes('tee') || nameLower.includes('t-shirt') || nameLower.includes('shirt')) clothingType = 'tee';
      else if (nameLower.includes('case') || nameLower.includes('phone')) clothingType = 'accessory';
      else if (nameLower.includes('pants') || nameLower.includes('jogger')) clothingType = 'bottom';
      else if (nameLower.includes('jacket') || nameLower.includes('coat')) clothingType = 'outerwear';

      let collection = 'General';
      if (nameLower.includes('iceman')) collection = 'Iceman';

      // Store the code record
      WARDROBE_CODES[code] = {
        productId: item.id,
        productName: item.name,
        productImg: item.img,
        productImages: item.images || [],
        productColors: item.colors || [],
        clothingType,
        collection,
        price: item.price,
        size: item.size,
        color: item.color,
        orderId: printifyOrderId || tapstitchOrderId,
        email,
        createdAt: new Date().toISOString(),
        claimed: false,
        claimedAt: null,
        claimedBy: null,
      };

      console.log(`🎟️ WARDROBE code generated: ${code} for "${item.name}"`);

      return {
        code,
        productName: item.name,
        productImg: item.img,
      };
    });

    res.json({
      success: true,
      paymentIntentId,
      printifyOrderId,
      tapstitchOrderId,
      // ← these codes go in the order confirmation email / page
      wardrobeCodes,
      wardrobeMessage: wardrobeCodes.length > 0
        ? `You have ${wardrobeCodes.length} WARDROBE activation code${wardrobeCodes.length > 1 ? 's' : ''}. Open WARDROBE → Add Clothes → Enter Code to track your 2AM items.`
        : null,
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DROP SIGNUP
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/drop-signup', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'No email' });
  console.log('📧 Drop signup:', email);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`2AM backend on port ${PORT}`));
