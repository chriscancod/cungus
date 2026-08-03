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

// ── Lazy-init Square so a missing key doesn't crash the whole server ──────────
let _square = null;
function getSquareClient() {
  if (!_square) {
    if (!process.env.SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN not set');
    const { SquareClient, SquareEnvironment } = require('square');
    _square = new SquareClient({
      token: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENV === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    });
  }
  return _square;
}

const PRINTIFY_BASE = 'https://api.printify.com/v1';
const SHOP_ID       = process.env.PRINTIFY_SHOP_ID;
const SHOW_TAG      = 'showfloor';

// ── "Revive" drop — products tagged "revive" in Printify stay out of the
// public catalog entirely (server-enforced, not just hidden client-side)
// until REVIVE_DROP_AT passes, then appear automatically. No per-product
// date tag needed — REVIVE_DROP_AT is the single source of truth so the
// countdown page and the catalog gate can never drift out of sync.
function isReviveLive() {
  const dropAt = process.env.REVIVE_DROP_AT;
  if (!dropAt) return true;
  return Date.now() >= new Date(dropAt).getTime();
}
function isReviveTagged(p) {
  return (p.tags || []).some(t => t.toLowerCase() === 'revive');
}

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

async function sendClikeyOrderEmail({ items, shippingAddress, email, transactionId }) {
  const blankAvailable = fs.existsSync(CLIKEY_BLANK_PATH);
  const manifest = items.map((i, idx) => ({
    line: idx + 1,
    designId: i.designId || null,
    design: i.design || null,
    price: i.price,
  }));
  const summaryText = [
    `New Clikey order — ${transactionId}`,
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
    subject: `Clikey order — ${transactionId}`,
    text: summaryText,
    attachments,
  });
  return { emailed: true };
}

// ── Preorders — items tagged "preorder" in Printify (or synthetic
// non-Printify products like the Veynor Solis) skip real fulfillment at
// checkout since there's nothing to ship yet. Logged locally so nothing is
// lost even if the owner-notification email below fails or is unconfigured.
const PREORDERS_FILE = path.join(DATA_DIR, 'preorders.json');
function appendPreorder(record) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(PREORDERS_FILE, 'utf8')); } catch (e) { all = []; }
  all.push(record);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PREORDERS_FILE, JSON.stringify(all, null, 2));
}

async function sendPreorderOwnerEmail({ items, shippingAddress, email, transactionId }) {
  const lines = items.map((i, idx) => `${idx + 1}. ${i.name}${i.size ? ` — ${i.size}` : ''}${i.color && i.color !== '—' ? ` / ${i.color}` : ''} — $${i.price}${i.shipsAt ? ` (ships ~${i.shipsAt})` : ''}`);
  const summaryText = [
    `New preorder — ${transactionId}`,
    `Customer: ${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''} <${email || ''}>`,
    shippingAddress ? `Ship to: ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}` : '',
    '',
    ...lines,
    '',
    'Fulfill manually (e.g. via Printify) once the item is actually ready — this order was intentionally NOT sent to Printify yet.',
  ].filter(Boolean).join('\n');

  if (!mailer || !OWNER_EMAIL) {
    console.warn('Preorder received but email is not configured (EMAIL_USER/EMAIL_PASS/OWNER_EMAIL):');
    console.warn(summaryText);
    return { emailed: false };
  }
  await mailer.sendMail({ from: process.env.EMAIL_USER, to: OWNER_EMAIL, subject: `Preorder — ${transactionId}`, text: summaryText });
  return { emailed: true };
}

// ── Proactive support: a Printify order failure used to just be a
// console.error nobody saw until a customer complained about a missing
// package. The card already charged successfully, so this can't undo the
// order — instead it alerts the owner to fulfill manually right away, and
// the customer's own confirmation email gets an honest heads-up (see the
// printifyFailed flag threaded into sendCustomerOrderEmail below) instead of
// implying everything's on track when it silently isn't.
async function sendFulfillmentFailureAlert({ items, shippingAddress, email, transactionId, printifyError }) {
  const lines = items.map((i, idx) => `${idx + 1}. ${i.name}${i.size ? ` — ${i.size}` : ''}${i.color && i.color !== '—' ? ` / ${i.color}` : ''}`);
  const summaryText = [
    `⚠️ Printify order FAILED — ${transactionId} — customer already charged`,
    `Customer: ${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''} <${email || ''}>`,
    shippingAddress ? `Ship to: ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}` : '',
    '',
    ...lines,
    '',
    `Printify error: ${printifyError}`,
    '',
    'This order needs to be placed with Printify manually (or retried) — the customer already paid and was told their order is confirmed.',
  ].filter(Boolean).join('\n');

  if (!mailer || !OWNER_EMAIL) {
    console.warn('Printify order failed but alert email is not configured (EMAIL_USER/EMAIL_PASS/OWNER_EMAIL):');
    console.warn(summaryText);
    return { emailed: false };
  }
  try {
    await mailer.sendMail({ from: process.env.EMAIL_USER, to: OWNER_EMAIL, subject: `⚠️ Printify order failed — ${transactionId}`, text: summaryText });
    return { emailed: true };
  } catch (err) {
    console.error('Fulfillment-failure alert email itself failed (non-fatal):', err.message);
    return { emailed: false };
  }
}

// ── Customer order-confirmation email — sent for every completed order,
// separate from order-confirmation.html (belt-and-suspenders: the page can
// be closed/lost, the email is a durable record in the customer's own inbox).
async function sendCustomerOrderEmail({ email, items, wardrobeCodes, transactionId, subtotal, shipping, discount, total, preorderNote, printifyFailed }) {
  if (!mailer || !email) {
    console.warn(`Order ${transactionId} completed but customer email not sent (mailer configured: ${!!mailer}, email provided: ${!!email})`);
    return { emailed: false };
  }
  const itemLines = items.map((i, idx) => `  ${idx + 1}. ${i.name}${i.size && i.size !== '—' ? ` — ${i.size}` : ''}${i.color && i.color !== '—' ? ` / ${i.color}` : ''} — $${Number(i.price).toFixed(2)}`);
  const codeLines = (wardrobeCodes || []).map((c) => `  ${c.productName}: ${c.code}`);
  const text = [
    `Thanks for your order — here's your confirmation.`,
    ``,
    `Order: ${transactionId}`,
    ...itemLines,
    ``,
    `Subtotal: $${subtotal}`,
    `Shipping: $${shipping}`,
    Number(discount) > 0 ? `Discount: -$${discount}` : null,
    `Total: $${total}`,
    printifyFailed ? `` : null,
    printifyFailed ? `Heads up: your order needs a quick manual check on our end before it prints — nothing you need to do, but tracking may take an extra day or two. We'll email the moment it ships.` : null,
    preorderNote ? `` : null,
    preorderNote ? `PREORDER NOTE: ${preorderNote}` : null,
    codeLines.length ? `` : null,
    codeLines.length ? `WARDROBE activation codes — open WARDROBE → Add Clothes → Enter Code:` : null,
    ...codeLines,
    ``,
    `✦ You earned ~${Math.floor(Number(total))} loyalty points on this order (1 point = $1 spent). Hit 100/250/500/1000 lifetime points and we'll email you a reward coupon automatically.`,
    ``,
    `We've picked out a few things you might like based on this order — see them under "Recommended For You" at 2amcases.online.`,
    ``,
    `Questions? Just reply to this email.`,
    `— 2AM`,
  ].filter((l) => l !== null).join('\n');

  await mailer.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Your 2AM order confirmation — ${transactionId.slice(-10)}`,
    text,
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
  // Printify's variant.price is always in cents, no exceptions — the old
  // "only divide if > 500" heuristic left anything under $5.00 (e.g. a
  // $1.58 sticker, price=158) undivided, showing as $158.00 on the storefront.
  const rawPrice = cheapest?.price || 0;
  const price    = (rawPrice / 100).toFixed(2);
  const tags     = (p.tags || []).map(t => t.toLowerCase());

  // Preorder is just a Printify tag — add "preorder" (and optionally
  // "ships:YYYY-MM-DD") in the Printify dashboard to sell a not-yet-produced
  // item. /api/payment still charges the card in full today, but skips the
  // real Printify fulfillment order for these items (see there for why).
  const preorder    = tags.includes('preorder');
  const shipTagRaw  = (p.tags || []).find(t => /^ships:/i.test(t));
  const shipsAt      = shipTagRaw ? shipTagRaw.slice(shipTagRaw.indexOf(':') + 1).trim() : null;
  const isMetaTag    = t => ['showfloor', 'tapstitch', 'iceman', 'preorder'].includes(t.toLowerCase()) || /^ships:/i.test(t);

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
    preorder,
    shipsAt,
    badge:       preorder ? 'PREORDER' : ((p.tags || []).find(t => !isMetaTag(t))?.toUpperCase() || 'NEW'),
    tag:         (p.tags || []).find(t => !isMetaTag(t)) || '2AM Collection',
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
    const reviveLive = isReviveLive();
    const products = all
      .filter(p => !p.title.toLowerCase().includes('custom'))
      .filter(p => reviveLive || !isReviveTagged(p))
      .map(p => shapeProduct(p, false));
    console.log(`/api/products → ${products.length} products`);
    res.json({ products, total: products.length });
  } catch (err) {
    console.error('/api/products error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/drops/revive — countdown + auto-reveal for the Revive collection.
// Before REVIVE_DROP_AT: no product data at all, just the drop time (kept a
// surprise). After: the real "revive"-tagged products, same shape as
// /api/products, fully shoppable through the normal cart/checkout flow.
app.get('/api/drops/revive', async (req, res) => {
  const dropAt = process.env.REVIVE_DROP_AT || null;
  const live = isReviveLive();
  if (!live) return res.json({ live: false, collection: 'revive', dropAt });
  try {
    const all = await fetchAllPrintifyProducts();
    const products = all.filter(isReviveTagged).map(p => shapeProduct(p, false));
    res.json({ live: true, collection: 'revive', dropAt, products });
  } catch (err) {
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
    const reviveLive = isReviveLive();
    const products = all
      .filter(p => reviveLive || !isReviveTagged(p))
      .map(p => shapeProduct(p, true));
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

function computeTotals(items, shippingAddress) {
  const isUS          = !shippingAddress?.country || shippingAddress?.country === 'US';
  const subtotalCents = items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0);
  const shippingCents = isUS
    ? 499 + Math.max(0, items.length - 1) * 150
    : 1499 + Math.max(0, items.length - 1) * 300;
  return { subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

// ── Coupons — proxied through mambru-backend. The shop's X-API-Key never
// reaches the browser; the client only ever talks to this server. `dryRun`
// previews a discount (checkout's "apply code" step) without consuming the
// coupon's use — only the real call made from /api/payment, right before
// charging, increments it.
async function validateCoupon(code, subtotalCents, { dryRun } = {}) {
  if (!process.env.MAMBRU_BACKEND_URL || !process.env.MAMBRU_API_KEY) {
    throw new Error('Coupon support is not configured on this backend yet');
  }
  const r = await fetch(`${process.env.MAMBRU_BACKEND_URL}/api/coupons/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.MAMBRU_API_KEY },
    body: JSON.stringify({ code, amount: (subtotalCents / 100).toFixed(2), dryRun: !!dryRun }),
  });
  const data = await r.json();
  if (!r.ok || !data.success) {
    const err = new Error(data.error || 'Invalid coupon code');
    err.status = r.status === 401 ? 500 : r.status; // never leak an API-key auth failure as if the code were bad
    throw err;
  }
  return data; // {discount_amount, final_amount, coupon_id}
}

// POST /api/apply-coupon — preview a coupon's discount before payment, called
// from the "Have a code?" field in the cart drawer. Does not consume a use.
app.post('/api/apply-coupon', async (req, res) => {
  const { code, items, shippingAddress } = req.body || {};
  if (!code || !items?.length) return res.status(400).json({ error: 'Missing code or items' });
  try {
    const { subtotalCents } = computeTotals(items, shippingAddress);
    const result = await validateCoupon(code, subtotalCents, { dryRun: true });
    res.json({
      success: true,
      discount_amount: result.discount_amount,
      final_amount: result.final_amount,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// GET /api/loyalty/lookup?email=X — proxies to mambru-backend (server-to-server
// with the shop API key) so the customer-facing lookup widget never needs a
// key of its own. Same resilience pattern as coupon validation: if mambru is
// unreachable, return a real zero-state rather than a scary error.
app.get('/api/loyalty/lookup', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!process.env.MAMBRU_BACKEND_URL || !process.env.MAMBRU_API_KEY) {
    return res.json({ points_balance: 0, lifetime_points: 0, next_tier: null });
  }
  try {
    const r = await fetch(`${process.env.MAMBRU_BACKEND_URL}/api/loyalty/lookup?email=${encodeURIComponent(email)}`, {
      headers: { 'X-API-Key': process.env.MAMBRU_API_KEY },
    });
    const data = await r.json();
    res.status(r.ok ? 200 : 500).json(r.ok ? data : { points_balance: 0, lifetime_points: 0, next_tier: null });
  } catch (err) {
    res.json({ points_balance: 0, lifetime_points: 0, next_tier: null });
  }
});

// GET /api/recommendations?email=X — "Recommended for You", proxied to the
// mega backend (public there too — just product suggestions, no financial
// data, same trust level as /api/products itself). A real empty list beats
// a scary error if mambru is unreachable.
app.get('/api/recommendations', async (req, res) => {
  if (!process.env.MAMBRU_BACKEND_URL) return res.json({ products: [] });
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const limit = req.query.limit || 4;
    const r = await fetch(`${process.env.MAMBRU_BACKEND_URL}/api/recommendations?email=${encodeURIComponent(email)}&limit=${encodeURIComponent(limit)}`);
    const data = await r.json();
    res.status(r.ok ? 200 : 500).json(r.ok ? data : { products: [] });
  } catch (err) {
    res.json({ products: [] });
  }
});

// ── Square error → customer-safe message ───────────────────────────────────
// Square's SDK errors (the `errors[]` array on both a resolved response and
// a thrown SquareError) carry a short machine code per failure; the error's
// own .message/.detail can include the full raw request/response JSON, which
// must never reach a customer. This maps known codes to plain English and
// falls back to a safe generic message for anything unmapped.
const SQUARE_DECLINE_MESSAGES = {
  CARD_DECLINED: 'Your card was declined. Please try a different payment method.',
  CARD_DECLINED_VERIFICATION_REQUIRED: 'Your bank needs to verify this purchase. Please contact your bank or try a different card.',
  CVV_FAILURE: "The security code (CVV) didn't match. Please check it and try again.",
  ADDRESS_VERIFICATION_FAILURE: "The billing address didn't match your card. Please double-check it and try again.",
  INVALID_EXPIRATION: 'That card has an invalid expiration date. Please check it and try again.',
  CARD_EXPIRED: 'That card has expired. Please try a different card.',
  INSUFFICIENT_FUNDS: 'Your card was declined for insufficient funds.',
  TRANSACTION_LIMIT: 'This purchase exceeds a limit set by your card issuer. Try a smaller order or a different card.',
  INVALID_CARD: 'That card number looks invalid. Please double-check it and try again.',
  INVALID_ACCOUNT: 'That card is not currently active. Please try a different card.',
  PAN_FAILURE: 'That card number looks invalid. Please double-check it and try again.',
  INVALID_PIN: 'Incorrect PIN entered.',
  ALLOWABLE_PIN_TRIES_EXCEEDED: 'This card cannot be used right now. Please try a different card.',
  CARD_NOT_SUPPORTED: "This card isn't supported for this purchase. Please try a different card.",
  GENERIC_DECLINE: 'Your card was declined. Please try a different card or contact your bank.',
  GIFT_CARD_AVAILABLE_AMOUNT: 'This gift card does not have enough balance for this purchase.',
};
function friendlyPaymentError(err) {
  const squareErrors = err?.errors || err?.result?.errors;
  const code = squareErrors?.[0]?.code || null;
  const message = (code && SQUARE_DECLINE_MESSAGES[code])
    || (code ? 'Your card was declined. Please try a different card or contact your bank.' : "We couldn't process your payment. Please try again in a moment.");
  return { message, code, status: code ? 402 : 500 };
}

// ── /api/payment — tokenize-and-charge with Square, then route each item
// to its fulfiller. Square's Web Payments SDK tokenizes the card client-side
// (no server round-trip needed for that step, unlike Stripe's PaymentIntent
// flow), so this single endpoint both charges the card and runs fulfillment:
// Printify/Tapstitch apparel -> supplier order + WARDROBE codes.
// Clikey items -> emailed to the owner for manual fulfillment (see
// sendClikeyOrderEmail above), and excluded from WARDROBE codes since
// they aren't clothing.
app.post('/api/payment', async (req, res) => {
  const { token, idempotencyKey, items, shippingAddress, email, couponCode } = req.body;
  if (!token || !idempotencyKey || !items?.length) return res.status(400).json({ error: 'Missing data' });
  try {
    const { subtotalCents, shippingCents, totalCents } = computeTotals(items, shippingAddress);

    // Coupon is (re-)validated here, server-side — this is the authoritative
    // discount, a client-sent amount is never trusted, only the code is. This
    // check is still a dry run: the coupon's use isn't consumed until the
    // card charge actually succeeds below, so a declined card never burns it.
    let couponDiscountCents = 0;
    if (couponCode) {
      try {
        const result = await validateCoupon(couponCode, subtotalCents, { dryRun: true });
        couponDiscountCents = Math.round(Number(result.discount_amount) * 100);
      } catch (err) {
        return res.status(err.status || 400).json({ error: err.message });
      }
    }

    const square = getSquareClient();
    const locationId = process.env.SQUARE_LOCATION_ID;

    // Build a real Square Order so shipping shows up as its own line item
    // (an OrderServiceCharge) in the Square Dashboard/reports instead of
    // being folded silently into one lump payment amount.
    const { order: createdOrder, errors: orderErrors } = await square.orders.create({
      idempotencyKey: `${idempotencyKey}-order`,
      order: {
        locationId,
        referenceId: idempotencyKey,
        lineItems: items.map(i => ({
          name: i.name || 'Item',
          quantity: '1',
          basePriceMoney: { amount: BigInt(Math.round(Number(i.price) * 100)), currency: 'USD' },
          note: i.notes || undefined,
        })),
        serviceCharges: shippingCents > 0 ? [{
          name: 'Shipping',
          amountMoney: { amount: BigInt(shippingCents), currency: 'USD' },
          calculationPhase: 'SUBTOTAL_PHASE',
          taxable: false,
        }] : undefined,
        discounts: couponDiscountCents > 0 ? [{
          name: `Coupon: ${couponCode}`,
          amountMoney: { amount: BigInt(couponDiscountCents), currency: 'USD' },
          scope: 'ORDER',
        }] : undefined,
      },
    });
    if (orderErrors?.length || !createdOrder) {
      console.error('Square order error:', orderErrors);
      const { message, code, status } = friendlyPaymentError({ errors: orderErrors });
      return res.status(status).json({ error: message, declineCode: code });
    }

    const { payment, errors } = await square.payments.create({
      sourceId: token,
      idempotencyKey,
      orderId: createdOrder.id,
      amountMoney: createdOrder.totalMoney,
      locationId,
      buyerEmailAddress: email || undefined,
      note: '2AM order',
    });
    if (errors?.length || !payment) {
      console.error('Square payment error:', errors);
      const { message, code, status } = friendlyPaymentError({ errors });
      return res.status(status).json({ error: message, declineCode: code });
    }
    if (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED') {
      return res.status(402).json({ error: 'Your payment could not be confirmed. Please try again.', declineCode: payment.status });
    }
    const transactionId = payment.id;
    console.log('✅ Square payment:', transactionId, payment.status);

    // Now that the card actually charged, consume the coupon's use for real
    // (the check above was a dry run). Best-effort — a mambru hiccup here
    // must not undo an already-completed, already-charged order; worst case
    // is a coupon's use count under-counts during an outage.
    if (couponCode && process.env.MAMBRU_BACKEND_URL && process.env.MAMBRU_API_KEY) {
      validateCoupon(couponCode, subtotalCents, { dryRun: false }).catch(err =>
        console.error(`mambru coupon consume failed for ${couponCode} (non-fatal, order already charged):`, err.message)
      );
    }

    // Log the sale to mambru-backend for coupon/revenue stats + auto-coupon
    // rules. Fire-and-forget with a .catch — a mambru outage must never break
    // a real, already-charged order.
    if (process.env.MAMBRU_BACKEND_URL && process.env.MAMBRU_API_KEY) {
      const chargedAmount = Number(createdOrder.totalMoney?.amount ?? totalCents) / 100;
      fetch(`${process.env.MAMBRU_BACKEND_URL}/api/sales/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.MAMBRU_API_KEY },
        body: JSON.stringify({
          amount: chargedAmount.toFixed(2),
          coupon_used: couponCode || null,
          app_source: '2am',
          email,
          notes: `transactionId=${transactionId}`,
        }),
      }).catch(err => console.error('mambru sales log failed (non-fatal):', err.message));
    }

    const clikeyItems    = items.filter(i => i.type === 'clikey');
    const hardwareItems  = items.filter(i => i.type === 'hardware'); // e.g. the Veynor Solis — not a Printify product at all
    // apparelItems is the WARDROBE-eligible set (real clothing/POD items) —
    // hardware and Clikey pieces never get a WARDROBE code.
    const apparelItems   = items.filter(i => i.type !== 'clikey' && i.type !== 'hardware');
    // Preorders (a "preorder" Printify tag, or any hardware item — the phone
    // has nothing to ship yet either way) skip real fulfillment below and
    // get logged + emailed to the owner to fulfill manually once ready.
    const preorderItems  = [...apparelItems, ...hardwareItems].filter(i => i.preorder);
    const printifyItems  = apparelItems.filter(i => i.fulfillment !== 'tapstitch' && !i.preorder);
    const tapstitchItems = apparelItems.filter(i => i.fulfillment === 'tapstitch' && !i.preorder);
    let printifyOrderId  = null;
    let tapstitchOrderId = null;
    let printifyFailed   = false;

    // Printify order
    if (printifyItems.length && shippingAddress) {
      const pr = await fetch(`${PRINTIFY_BASE}/shops/${SHOP_ID}/orders.json`, {
        method: 'POST', headers: pHeaders(),
        body: JSON.stringify({
          external_id: `2am-${transactionId}`,
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
      else {
        const printifyError = await pr.text();
        console.error('⚠️ Printify failed:', printifyError);
        printifyFailed = true;
        sendFulfillmentFailureAlert({ items: printifyItems, shippingAddress, email, transactionId, printifyError }).catch((err) =>
          console.error('Fulfillment-failure alert failed (non-fatal, order already charged):', err.message)
        );
      }
    }

    // TapStitch (manual fulfillment)
    if (tapstitchItems.length) {
      tapstitchOrderId = `ts-${transactionId}`;
      console.log('🧵 TapStitch order:', { orderId: tapstitchOrderId, customer: { email, ...shippingAddress }, items: tapstitchItems.map(i => ({ name: i.name, size: i.size, color: i.color, notes: i.notes, price: i.price })) });
    }

    // Clikey (manual fulfillment via email + STL pipeline)
    let clikeyEmailed = false;
    if (clikeyItems.length) {
      try {
        const r = await sendClikeyOrderEmail({ items: clikeyItems, shippingAddress, email, transactionId });
        clikeyEmailed = r.emailed;
      } catch (err) {
        console.error('Clikey order email failed:', err.message);
      }
    }

    // Preorders (manual fulfillment once the item is actually ready)
    let preorderEmailed = false;
    let preorderNote = null;
    if (preorderItems.length) {
      const record = {
        transactionId, email, shippingAddress,
        items: preorderItems.map(i => ({ productId: i.id, name: i.name, size: i.size, color: i.color, price: i.price, shipsAt: i.shipsAt || null })),
        createdAt: new Date().toISOString(),
      };
      appendPreorder(record);
      preorderNote = preorderItems
        .map(i => `${i.name}${i.shipsAt ? ` ships ~${i.shipsAt}` : ' ships once ready'}`)
        .join('; ');
      try {
        const r = await sendPreorderOwnerEmail(record);
        preorderEmailed = r.emailed;
      } catch (err) {
        console.error('Preorder owner email failed:', err.message);
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

    const subtotal = (subtotalCents / 100).toFixed(2);
    const shipping = (shippingCents / 100).toFixed(2);
    const discount = (couponDiscountCents / 100).toFixed(2);
    const total    = (Number(createdOrder.totalMoney?.amount ?? totalCents) / 100).toFixed(2);

    // Customer-facing confirmation email — best-effort, never blocks the
    // response (the order already charged; a Gmail hiccup can't undo that).
    let customerEmailed = false;
    try {
      const r = await sendCustomerOrderEmail({ email, items, wardrobeCodes, transactionId, subtotal, shipping, discount, total, preorderNote, printifyFailed });
      customerEmailed = r.emailed;
    } catch (err) {
      console.error('Customer order email failed:', err.message);
    }

    res.json({
      success: true, transactionId, printifyOrderId, tapstitchOrderId, clikeyEmailed, preorderEmailed, customerEmailed,
      subtotal, shipping, discount, total,
      wardrobeCodes,
      wardrobeMessage: `You have ${wardrobeCodes.length} WARDROBE activation code${wardrobeCodes.length !== 1 ? 's' : ''}. Open WARDROBE → Add Clothes → Enter Code.`,
      preorder: preorderItems.length ? { note: preorderNote, items: preorderItems.map(i => ({ name: i.name, shipsAt: i.shipsAt || null })) } : null,
    });
  } catch (err) {
    console.error('Payment error:', err.message, err.errors || '');
    const { message, code, status } = friendlyPaymentError(err);
    res.status(status).json({ error: message, declineCode: code });
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
