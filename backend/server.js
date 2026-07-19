require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const fs      = require('fs');
const path    = require('path');
const nodemailer = require('nodemailer');

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

// ── 2AM CREATIVE STUDIO — design storage + Clikey STL pipeline ──────
const DATA_DIR = path.join(__dirname, 'data');
const DESIGNS_FILE = path.join(DATA_DIR, 'designs.json');
const BLANKS_DIR = path.join(__dirname, 'blanks');
const CLIKEY_BLANK_PATH = path.join(BLANKS_DIR, 'clikey-blank.stl');

function loadDesigns() {
  try { return JSON.parse(fs.readFileSync(DESIGNS_FILE, 'utf8')); }
  catch (e) { return {}; }
}
function saveDesigns(designs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DESIGNS_FILE, JSON.stringify(designs, null, 2));
}

let mailer = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}
const OWNER_EMAIL = process.env.OWNER_EMAIL || process.env.EMAIL_USER;

async function sendClikeyOrderEmail({ items, shippingAddress, email, paymentIntentId }) {
  const blankAvailable = fs.existsSync(CLIKEY_BLANK_PATH);
  const manifest = items.map((i, idx) => ({
    line: idx + 1,
    designId: i.designId || null,
    design: i.design || null,
    price: i.price,
  }));
  const summaryText = [
    `New Clikey order — ${paymentIntentId}`,
    `Customer: ${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''} <${email || ''}>`,
    shippingAddress ? `Ship to: ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}` : '',
    '',
    blankAvailable ? 'Blank STL attached.' : 'NOTE: no blank Clikey STL uploaded yet at backend/blanks/clikey-blank.stl — attach manually.',
    '',
    JSON.stringify(manifest, null, 2),
  ].filter(Boolean).join('\n');

  if (!mailer || !OWNER_EMAIL) {
    console.warn('Clikey order received but email is not configured (EMAIL_USER/EMAIL_PASS/OWNER_EMAIL):');
    console.warn(summaryText);
    return { emailed: false };
  }

  const attachments = blankAvailable ? [{ filename: 'clikey-blank.stl', path: CLIKEY_BLANK_PATH }] : [];
  await mailer.sendMail({
    from: process.env.EMAIL_USER,
    to: OWNER_EMAIL,
    subject: `Clikey order — ${paymentIntentId}`,
    text: summaryText,
    attachments,
  });
  return { emailed: true };
}

// POST /api/generate-design — AI shirt artwork via Stability AI (text-to-image)
app.post('/api/generate-design', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });
  if (!process.env.STABILITY_API_KEY) return res.status(500).json({ error: 'STABILITY_API_KEY not configured on the backend' });
  try {
    const r = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [{ text: `${prompt}, isolated graphic design, centered, plain flat background, no mockup, high contrast` }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        samples: 1,
        steps: 30,
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error('Stability AI error:', errText);
      return res.status(r.status).json({ error: 'Design generation failed' });
    }
    const data = await r.json();
    const b64 = data.artifacts?.[0]?.base64;
    if (!b64) return res.status(500).json({ error: 'No image returned' });
    res.json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/designs — save a studio design (apparel mockup or Clikey config)
app.post('/api/designs', (req, res) => {
  const { type, config, email } = req.body;
  if (!type || !config) return res.status(400).json({ error: 'Missing type or config' });
  const designs = loadDesigns();
  const id = `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  designs[id] = { id, type, config, email: email || null, createdAt: new Date().toISOString() };
  saveDesigns(designs);
  res.json({ id });
});

// GET /api/designs/:id — read a saved design back
app.get('/api/designs/:id', (req, res) => {
  const designs = loadDesigns();
  const d = designs[req.params.id];
  if (!d) return res.status(404).json({ error: 'Design not found' });
  res.json(d);
});

// POST /api/generate-stl — Clikey STL pipeline
// Real per-key mesh generation lands once the blank Clikey model is provided
// at backend/blanks/clikey-blank.stl — until then this reports the design
// manifest so the studio can confirm what will ship to the maker.
app.post('/api/generate-stl', (req, res) => {
  const { designId } = req.body;
  if (!designId) return res.status(400).json({ error: 'Missing designId' });
  const designs = loadDesigns();
  const design = designs[designId];
  if (!design) return res.status(404).json({ error: 'Design not found' });
  if (design.type !== 'clikey') return res.status(400).json({ error: 'STL generation only applies to Clikey designs' });
  const blankAvailable = fs.existsSync(CLIKEY_BLANK_PATH);
  res.json({
    designId,
    blankAvailable,
    manifest: design.config,
    note: blankAvailable
      ? 'Blank model found — STL will be attached to the order email.'
      : 'Blank Clikey model not uploaded yet — the design spec will be emailed for manual fulfillment.',
  });
});

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

// ── /api/payment — confirm payment + route each item to its fulfiller ────────
// Printify/Tapstitch apparel -> supplier order + WARDROBE codes.
// Clikey items -> emailed to the owner for manual fulfillment (see
// sendClikeyOrderEmail above), and excluded from WARDROBE codes since
// they aren't clothing.
app.post('/api/payment', async (req, res) => {
  const { paymentIntentId, items, shippingAddress, email } = req.body;
  if (!paymentIntentId || !items?.length) return res.status(400).json({ error: 'Missing data' });
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not confirmed' });
    console.log('✅ Stripe payment:', paymentIntentId);

    const clikeyItems    = items.filter(i => i.type === 'clikey');
    const apparelItems   = items.filter(i => i.type !== 'clikey');
    const printifyItems  = apparelItems.filter(i => i.fulfillment !== 'tapstitch');
    const tapstitchItems = apparelItems.filter(i => i.fulfillment === 'tapstitch');
    let printifyOrderId  = null;
    let tapstitchOrderId = null;

    // Printify order
    if (printifyItems.length && shippingAddress) {
      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST', headers: pHeaders(),
        body: JSON.stringify({
          external_id: `2am-${paymentIntentId}`,
          label: '2AM Order',
          line_items: printifyItems.map(i => ({
            product_id: i.id,
            variant_id: i.variantId,
            quantity: 1,
            // Pass personalization notes if present
            print_details: i.notes ? [{ note: i.notes }] : undefined,
          })),
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

    // Clikey (manual fulfillment via email + STL pipeline)
    let clikeyEmailed = false;
    if (clikeyItems.length) {
      try {
        const r = await sendClikeyOrderEmail({ items: clikeyItems, shippingAddress, email, paymentIntentId });
        clikeyEmailed = r.emailed;
      } catch (err) {
        console.error('Clikey order email failed:', err.message);
      }
    }

    // Generate WARDROBE codes for apparel items only
    const wardrobeCodes = apparelItems.map(item => {
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
      success: true, paymentIntentId, printifyOrderId, tapstitchOrderId, clikeyEmailed,
      wardrobeCodes,
      wardrobeMessage: `You have ${wardrobeCodes.length} WARDROBE activation code${wardrobeCodes.length !== 1 ? 's' : ''}. Open WARDROBE → Add Clothes → Enter Code.`,
    });
  } catch (err) {
    console.error('Payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drop-signup — persists to backend/data/signups.json (deduped by email)
const SIGNUPS_FILE = path.join(DATA_DIR, 'signups.json');
function loadSignups() {
  try { return JSON.parse(fs.readFileSync(SIGNUPS_FILE, 'utf8')); }
  catch (e) { return []; }
}
function saveSignups(signups) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SIGNUPS_FILE, JSON.stringify(signups, null, 2));
}
app.post('/api/drop-signup', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  const normalized = email.trim().toLowerCase();
  const signups = loadSignups();
  if (!signups.some(s => s.email === normalized)) {
    signups.push({ email: normalized, createdAt: new Date().toISOString() });
    saveSignups(signups);
    console.log('Drop signup saved:', normalized, `(${signups.length} total)`);
  }
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`2AM backend on port ${PORT}`));
