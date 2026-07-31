# cungus — 2AM Store

Full-stack 2AM streetwear storefront. Printify / Tapstitch fulfillment + Square payments.

## Ownership
2AM is a brand of **Mambru Inc.**, founded and wholly owned by **Christopher Mambru** (Founder & Owner). This is stated on the site in three places, all of which should stay in sync if the entity or owner ever changes:
- **`company.html`** — the ownership page: the ownership statement, an entity record (brand / operating entity / owner / 100% sole ownership / established / domain / contact), the Mambru Inc. structure (2AM, Veynor Solis, WARDROBE), and trademark + copyright notices. Linked from every nav and footer.
- **Every footer** — `.footer-legal` in `shared/base.css`: "A Mambru Inc. company — owned by Christopher Mambru", plus "© YEAR Mambru Inc. 2AM™ is a trademark of Mambru Inc." The standalone `order-confirmation.html` / `payment-declined.html` pages carry the same line as an `.ownership-bar` (they don't load the shared design system).
- **Structured data** — schema.org JSON-LD in `index.html` and `company.html` sharing one `@id` graph (`#organization` / `#mambru` / `#owner`), so crawlers and rich results read `parentOrganization: Mambru Inc.` and `owner/founder: Christopher Mambru`. `og:site_name` says "2AM — a Mambru Inc. company".

## Stack
- **Frontend** `index.html` (home) + `catalog.html` (shop all) + `studio.html` (2AM Creative Studio) + `company.html` (ownership / corporate) — vanilla HTML/CSS/JS, no build step
- **Shared frontend code** `shared/base.css` + `shared/cart.js` + `shared/checkout.js` + `shared/cursor.js` — one design system and one cart/checkout/payment implementation, included via plain `<link>`/`<script>` tags on all three pages instead of being duplicated per file
- **Backend** `backend/server.js` — Node.js/Express on Railway
- **Payments** — Square: Web Payments SDK tokenizes the card client-side; the backend builds a real Square Order (line items + a Shipping service charge) via `orders.create`, then charges it via `payments.create`
- **Fulfillment** — Printify / Tapstitch (auto-routes apparel on checkout, plus WARDROBE activation codes for the companion app), manual for Clikey

## Design system
All three pages share one token set and component library defined in `shared/base.css` — colors (`--black/--ice/--white/...`), type (`--d` Bebas Neue display / `--s` Cormorant Garamond serif / `--m` Space Mono), nav (scroll-reactive, underline-on-hover), cart drawer, checkout steps, product card, modal, footer, and cursor. Each page's own inline `<style>` block only holds page-specific layout (index's cinematic hero, catalog's filter controls, studio's 3D stage and console panels).

## Brand identity
- **Mark** — a crescent moon + spark glyph (an inline SVG, not a raster file) used as the favicon and next to the "2AM" wordmark in every nav and footer. Same shapes power the `404.html` illustration and `assets/og-image.svg` (the social share card wired into `og:image`/`twitter:image` on all three pages).
- **Voice** — "Built for the hours no one sees" / cold-city, quiet-hours energy. Keep new copy (meta descriptions, error states, emails) in that register rather than generic e-commerce copy.
- **`404.html`** — GitHub Pages serves this automatically for any broken/mistyped URL; keep it in sync with the shared design system since it intentionally doesn't load `shared/cart.js` (no cart UI on an error page).
- **Newsletter capture** — `shared/cart.js`'s `submitSignup()` posts to `/api/drop-signup` (already persists to `backend/data/signups.json`, deduped). The `.signup-band` section above the footer is the only UI for it — it existed as a backend endpoint with no way for a customer to actually reach it before this.
- **Footer** — Shipping/Returns links jump to `index.html#shipping` / `#returns` (a real policy blurb section, not a dead `#` link); Contact is a `mailto:` link.

## 2AM Creative Studio
`studio.html` lets customers design their own piece before checking out through the same shared cart/checkout as the catalog:
- **Apparel mode** — a 3D configurator (Three.js, drag to orbit / scroll to zoom, like configuring a car): pick a blank/color/size, describe a design in the AI prompt box, and the generated artwork is texture-mapped onto a live 3D shirt. Color swatches rebuild the garment material in real time. "Add to Cart" snapshots the 3D view as the cart thumbnail and saves the prompt + generated image via `/api/designs`. Fulfills through Printify automatically, same as a regular order.
  - AI art comes from `/api/generate-design` (Stability AI's text-to-image REST API) — requires `STABILITY_API_KEY`. Without it, the endpoint returns an error and the studio shows "Design generation is not available right now" instead of failing silently.
  - The 3D garment is a stylized procedural mesh (Three.js primitives), not a licensed 3D asset — good for orbiting/previewing color + print placement, not photorealistic.
- **Clikey mode** — customize a 4-key stress reliever (base color + per-key color/engraving), $5. Designs are saved via `/api/designs`, then on checkout the order is emailed to `OWNER_EMAIL` for manual fulfillment instead of going to Printify. **The cart thumbnail is a generic placeholder avatar, not real product art** — swap it in `studio.html` once real photography exists.
  - The real per-key STL export is still pending — drop the blank model at `backend/blanks/clikey-blank.stl` and it'll auto-attach to future Clikey order emails (see `sendClikeyOrderEmail` in `backend/server.js`). Until then, orders email the design spec only.

## WARDROBE codes
Every apparel item purchased (not Clikey) generates a `WARDROBE-XXXX-###` activation code, shown on the order-success screen and validated via `POST /api/wardrobe/validate-code`. Codes are stored in-memory on the backend (`WARDROBE_CODES`) — they don't survive a server restart. `GET /api/wardrobe/catalog` exposes the full product catalog shaped for clothing recognition (optionally gated behind `WARDROBE_API_KEY`).

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

SQUARE_ACCESS_TOKEN=your_square_sandbox_access_token
SQUARE_APPLICATION_ID=your_square_application_id
SQUARE_LOCATION_ID=your_square_location_id
SQUARE_ENV=sandbox

STABILITY_API_KEY=your_stability_ai_api_key
OWNER_EMAIL=chrisclm713@gmail.com
EMAIL_USER=your_sender_email
EMAIL_PASS=your_email_app_password
PORT=3000
```

- **Square**: create a developer account at [developer.squareup.com](https://developer.squareup.com), make a sandbox app to get `SQUARE_ACCESS_TOKEN` (secret, server-side only) + `SQUARE_APPLICATION_ID` (client-safe, goes in the frontend `CONFIG` too) + `SQUARE_LOCATION_ID`. Test cards and nonces are documented in Square's sandbox testing guide. Switch `SQUARE_ENV` to `production` and swap all three values for their live-app equivalents when you're ready to take real payments.
- **Stability AI**: `platform.stability.ai` — create an account, generate an API key, add billing (image generation is metered per request).

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
Each of `index.html`, `catalog.html`, `studio.html` has its own small inline `CONFIG` block — update all three the same way:
```js
const CONFIG = {
  BACKEND_URL: 'https://cungus-production.up.railway.app',
  SQUARE_APPLICATION_ID: 'sq0idp-...',
  SQUARE_LOCATION_ID: 'L...',
  SQUARE_ENV: 'sandbox', // or 'production'
};
```
Everything else (cart, checkout steps, the Square card form, cursor) is shared code in `shared/` — no need to touch it per page.

### 6. Deploy frontend to GitHub Pages
- Repo Settings → Pages → Branch: main → Folder: `/` (root)
- For custom domain: add `2amcases.online` in Pages settings (already set via `CNAME`) — confirm your registrar's DNS has a CNAME record for `2amcases.online` → `chriscancod.github.io`
- In your DNS (Namecheap): CNAME → `chriscancod.github.io`
- The `shared/` folder deploys automatically with everything else — it's just static files, no build step.

### 7. Go live
1. Swap Square sandbox credentials for live-app credentials (backend `.env` + all three frontend `CONFIG` blocks), and set `SQUARE_ENV=production` everywhere.
2. Place a real order end-to-end before flipping DNS — Square has no webhook wired up here (payment confirmation is synchronous via `payments.create`'s response), so a live test order is the only way to confirm the full Printify/Tapstitch/Clikey/WARDROBE flow actually fires.

---

## API
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| GET | `/api/products` | Showfloor-tagged Printify products |
| GET | `/api/wardrobe/catalog` | Full catalog shaped for clothing recognition (optionally gated by `WARDROBE_API_KEY`) |
| POST | `/api/wardrobe/validate-code` | Claim a WARDROBE activation code |
| POST | `/api/calculate-shipping` | Flat-rate shipping + tax estimate for the cart |
| POST | `/api/payment` | Tokenize-and-charge with Square, then route each item to its fulfiller (Printify / Tapstitch / Clikey email) and mint WARDROBE codes |
| POST | `/api/drop-signup` | Save an email for drop notifications (deduped, persisted to `backend/data/signups.json`) |
| POST | `/api/designs` | Save a Studio design (apparel mockup or Clikey config), returns `id` |
| GET | `/api/designs/:id` | Read a saved design back |
| POST | `/api/generate-stl` | Reports whether the Clikey blank model is available for a saved design |
| POST | `/api/generate-design` | AI shirt artwork from a text prompt (Stability AI), returns a `data:image` |

---

## File structure
```
cungus/
├── index.html            # home page (cinematic hero + featured grid + policies + signup)
├── catalog.html           # full product catalog
├── studio.html             # 2AM Creative Studio (3D apparel configurator + Clikey designer)
├── 404.html                # branded not-found page (served automatically by GitHub Pages)
├── shared/
│   ├── base.css            # design tokens + shared components (nav, cart, checkout, cards, modal, signup)
│   ├── cart.js              # cart state, persistence, rendering, newsletter signup
│   ├── checkout.js           # checkout step navigation + Square Web Payments SDK
│   └── cursor.js              # custom cursor + scroll-reactive nav + footer year
├── assets/
│   └── og-image.svg         # social share card (og:image / twitter:image)
├── CNAME                  # 2amcases.online
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── railway.toml
│   ├── .env.example
│   ├── data/              # designs.json, signups.json (gitignored, auto-created)
│   ├── blanks/              # drop clikey-blank.stl here (gitignored)
│   └── .gitignore
├── .gitignore
└── README.md
```
