# cungus — 2AM Store

Full-stack 2AM streetwear storefront. Printify fulfillment + Stripe payments.

## Stack
- **Frontend** `index.html` (home) + `catalog.html` (shop all) + `studio.html` (2AM Creative Studio) — vanilla HTML/CSS/JS
- **Backend** `backend/server.js` — Node.js/Express on Railway
- **Payments** — Stripe (Payment Intents + Stripe.js)
- **Fulfillment** — Printify / Tapstitch (auto-routes apparel on checkout), manual for Clikey

## 2AM Creative Studio
`studio.html` lets customers design their own piece before checking out through the same cart/Stripe flow as the catalog:
- **Apparel mode** — a 3D configurator (Three.js, drag to orbit / scroll to zoom, like configuring a car): pick a blank/color/size, describe a design in the AI prompt box, and the generated artwork is texture-mapped onto a live 3D shirt. Color swatches rebuild the garment material in real time. "Add to Cart" snapshots the 3D view as the cart thumbnail and saves the prompt + generated image via `/api/designs`. Fulfills through Printify automatically, same as a regular order.
  - AI art comes from `/api/generate-design` (Stability AI's text-to-image REST API) — requires `STABILITY_API_KEY`. Without it, the endpoint returns an error and the studio shows "Design generation is not available right now" instead of failing silently.
  - The 3D garment is a stylized procedural mesh (Three.js primitives), not a licensed 3D asset — good for orbiting/previewing color + print placement, not photorealistic.
- **Clikey mode** — customize a 4-key stress reliever (base color + per-key color/engraving). Designs are saved via `/api/designs`, then on checkout the order is emailed to `OWNER_EMAIL` for manual fulfillment instead of going to Printify.
  - The real per-key STL export is still pending — drop the blank model at `backend/blanks/clikey-blank.stl` and it'll auto-attach to future Clikey order emails (see `sendClikeyOrderEmail` in `backend/server.js`). Until then, orders email the design spec only.

---

## Setup

### 1. Clone
```bash
git clone https://github.com/Chriscancod/cungus.git
cd cungus/backend
npm install
```

### 2. Environment variables
```bash
cp .env.example .env
# Fill in your keys
```

```env
PRINTIFY_API_KEY=your_printify_api_key
PRINTIFY_SHOP_ID=your_shop_id
STRIPE_SECRET_KEY=your_stripe_secret_key
STABILITY_API_KEY=your_stability_ai_api_key
OWNER_EMAIL=chrisclm713@gmail.com
EMAIL_USER=your_sender_email
EMAIL_PASS=your_email_app_password
PORT=3000
```

`STABILITY_API_KEY` comes from [platform.stability.ai](https://platform.stability.ai) (Stability AI — the company behind Stable Diffusion) — create an account, generate an API key, and add billing since image generation is metered per request.

### 3. Run locally
```bash
node server.js
# http://localhost:3000
# Test: http://localhost:3000/api/products
```

### 4. Deploy to Railway
1. railway.app → New Project → Deploy from GitHub → select `cungus`
2. Set root directory to `backend`
3. Add env vars in Railway → Settings → Variables
4. Copy your Railway URL (e.g. `https://cungus-production.up.railway.app`)

### 5. Update frontend
Open `index.html` and `catalog.html`, find the CONFIG block in each and update:
```js
const CONFIG = {
  BACKEND_URL: 'https://cungus-production.up.railway.app',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_...',
};
```

### 6. Deploy frontend to GitHub Pages
- Repo Settings → Pages → Branch: main → Folder: `/` (root)
- For custom domain: add `2amcases.com` in Pages settings (already set via `CNAME`)
- In your DNS (Namecheap): CNAME → `chriscancod.github.io`

### 7. Go live
1. Swap `STRIPE_SECRET_KEY` (backend) and `STRIPE_PUBLISHABLE_KEY` (frontend) for live keys
2. Confirm webhook/checkout flows against a real Stripe test order before flipping DNS

---

## API
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| GET | `/api/products` | All Printify products |
| POST | `/api/calculate-shipping` | Flat-rate shipping + tax estimate for the cart |
| POST | `/api/create-payment-intent` | Create a Stripe Payment Intent for the cart total |
| POST | `/api/payment` | Confirm Stripe payment; routes apparel items to Printify, Clikey items to `OWNER_EMAIL` |
| POST | `/api/drop-signup` | Save an email for drop notifications |
| POST | `/api/designs` | Save a Studio design (apparel mockup or Clikey config), returns `id` |
| GET | `/api/designs/:id` | Read a saved design back |
| POST | `/api/generate-stl` | Reports whether the Clikey blank model is available for a saved design |
| POST | `/api/generate-design` | AI shirt artwork from a text prompt (Stability AI), returns a `data:image` |

---

## File structure
```
cungus/
├── index.html          # home page
├── catalog.html         # full product catalog
├── studio.html           # 2AM Creative Studio (apparel + Clikey designer)
├── CNAME                # 2amcases.com
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── railway.toml
│   ├── .env.example
│   ├── data/            # designs.json (gitignored, auto-created)
│   ├── blanks/           # drop clikey-blank.stl here (gitignored)
│   └── .gitignore
├── .gitignore
└── README.md
```
