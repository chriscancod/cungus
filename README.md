# cungus — 2AM Store

Full-stack 2AM streetwear storefront. Printify / Tapstitch fulfillment + Square payments.

## Stack
- **Frontend** `index.html` (home) + `catalog.html` (shop all) + `about.html` — vanilla HTML/CSS/JS, no build step
- **Shared frontend code** `shared/base.css` + `shared/cart.js` + `shared/checkout.js` + `shared/cursor.js` + `shared/reveal.js` — one design system and one cart/checkout/payment implementation, included via plain `<link>`/`<script>` tags on every page instead of being duplicated per file
- **Backend** `backend/server.js` — Node.js/Express on Railway
- **Payments** — Square: Web Payments SDK tokenizes the card client-side; the backend builds a real Square Order (line items + a Shipping service charge) via `orders.create`, then charges it via `payments.create`
- **Fulfillment** — Printify / Tapstitch (auto-routes apparel on checkout, plus WARDROBE activation codes for the companion app)

## Design system
Every page shares one token set and component library defined in `shared/base.css` — colors (`--black/--ice/--white/...`), type (`--d`/`--s` Inter / `--dh` Space Grotesk display / `--m` Space Mono), nav (scroll-reactive, underline-on-hover), cart drawer, checkout steps, product card, modal, footer, cursor, and scroll-reveal animation (`shared/reveal.js`). Each page's own inline `<style>` block only holds page-specific layout.

**Brand-first pass (2026-08-27):** Chris — "i want 2am to be 2am" / "make the site around the actual brand." The homepage used to open on a Revive countdown with no 2AM identity anywhere above it; Revive stayed a special "it's here" takeover section even after it launched (2026-08-19) — long after the drop, the site was still treating it as the main event instead of normal catalog. Fixed: `index.html`'s countdown/live-drop machinery is gone entirely — the homepage opens on a real 2AM brand hero (ported from `about.html`'s `#hero`), then a normal shop section pulling straight from `/api/products`, same as everywhere else. Future drops use a lighter "New" badge instead of a countdown-gate production each time.

**Ecosystem unity pass (2026-08-23):** repainted from 2AM's original ice-red/cool-white/Bebas Neue identity to mambru-inc's dark-luxury anchor palette + type system — `--ice` now resolves to mambru's brand red (`#e2263a`) rather than the old `#ff4455`, `--white`/`--black`/`--card`/`--border` all match mambru's warm near-black recipe, and `--d`/`--s`/`--dh` now load Inter/Space Grotesk instead of Bebas Neue/Cormorant Garamond. `--red` (checkout error states) and `--purple` (Tapstitch badge) were deliberately left unchanged — they're semantic, not brand-identity colors.

**Old-money pass (2026-09-03):** full pivot away from the above, per Chris's explicit call after being asked directly whether he really meant it given the ecosystem-unity red/black/white system was only 11 days old at that point. New identity: warm ivory/cream surfaces (`--black`/`--deep`/`--card`/`--card2`), ink-brown text (`--white`), hunter-green primary accent (`--ice`, `#2e4a35`), antique-brass restored as a real color (`--gold`, was aliased to white since 2026-08-26), deep-burgundy `--red`, sage `--green`, muted plum `--purple`. Type is now Cormorant Garamond (`--dh` display) / EB Garamond (`--d`/`--s` body) / Courier Prime (`--m`, a heritage "ledger" mono for prices/codes/badges instead of Space Mono). The custom cursor (`.cur`/`.cur-ring`, `cursor:none` everywhere) is retired — hidden via CSS rather than ripped out of every page's markup, so nothing else had to change. Folded into the same pass: calmer entrance/scroll-reveal motion and a slower ticker (items #94/#95 — restraint is part of the new brand, not a separate ask), and smaller hero/404 display type (was `clamp(96px,20vw,240px)`-scale, now capped well under half that). `order-confirmation.html` and `payment-declined.html` each carry their own separate legacy token set (never synced to the shared system even in 2026-08-23) — repainted by hand to match. `assets/og-image.svg` repainted too, same mark geometry. Left alone on purpose: the Clikey free-gift design payload in `backend/server.js` (`baseColor`/`key.color` sent to fulfillment) — that's a physical product colorway, not site chrome, and changing it is a product decision for Chris, not a CSS reskin.

## Brand identity
- **Mark** — a crescent moon + spark glyph (an inline SVG, not a raster file) used as the favicon and next to the "2AM" wordmark in every nav and footer. Same shapes power the `404.html` illustration and `assets/og-image.svg` (the social share card wired into `og:image`/`twitter:image` on all three pages).
- **Voice** — "Built for the hours no one sees" / cold-city, quiet-hours energy. Keep new copy (meta descriptions, error states, emails) in that register rather than generic e-commerce copy.
- **`404.html`** — GitHub Pages serves this automatically for any broken/mistyped URL; keep it in sync with the shared design system since it intentionally doesn't load `shared/cart.js` (no cart UI on an error page).
- **Newsletter capture** — `shared/cart.js`'s `submitSignup()` posts to the **mega backend's** `/api/drop-signup` (`CONFIG.MEGA_BACKEND_URL`, Postgres-backed `drop_signups` table), not this storefront's own `/api/drop-signup` below — that one only fires as a same-process fallback if `MEGA_BACKEND_URL` isn't set on the page, and every page (`index.html`/`catalog.html`/`about.html`/`product.html`) does set it. *(Corrected 2026-09-04 — this section previously described the storefront's own JSON-file endpoint as the real destination; that was true until 2026-08-27's fix, when it was deliberately moved to Postgres specifically because the storefront's JSON file lives in an ephemeral Railway container with no volume and every signup was one redeploy from being gone — see `cart.js`'s own comment on `submitSignup()`. The code got fixed, this doc just never caught up, which is exactly the kind of stale-doc gap worth catching before it sends someone looking in the wrong place.)* The `.signup-band` section above the footer is the only UI for it.
- **Footer** — Shipping/Returns links jump to `index.html#shipping` / `#returns` (a real policy blurb section, not a dead `#` link); Contact is a `mailto:` link.

## Clikey (free gift, not a product)
Used to be "2AM Creative Studio" — a customer-facing page with an AI apparel design generator (Stability AI text-to-image onto a 3D shirt) and a configurable Clikey stress-reliever, $5, both saved via `/api/designs`. Removed entirely 2026-08-27 (Chris: remove the AI tool; Clikey isn't worth keeping as its own product). What's left: any order with a server-computed subtotal ≥ `FREE_CLIKEY_THRESHOLD_CENTS` ($100) automatically gets a free, non-configurable Clikey added to fulfillment in `/api/payment` — no cart line item, no price impact, it can't touch what Square actually charges. It's emailed to `OWNER_EMAIL` the same way a purchased Clikey used to be (`sendClikeyOrderEmail`). Drop the blank model at `backend/blanks/clikey-blank.stl` and it auto-attaches to that email; until then, orders just email the gift note.

## Product pages & stock validation
Every product also has its own page at `product.html?id=<printify_product_id>` — same content as the quick-view modal (gallery, variant picker, description), given real page space, a shareable URL, plus a generic size guide and a related-products row. Product cards' images link there; the quick-view modal itself keeps working everywhere it already did, for fast add-to-cart without leaving the page.

**Stock validation (2026-08-27):** a real checkout failure traced to the frontend's size/color picker checking a different Printify stock flag (`is_available`) than the backend's actual gate in `priceItems()` (`is_enabled`) — a variant could look pickable client-side and still get rejected server-side. Both now check both flags consistently. Sold-out sizes stay visible but disabled (not silently hidden) so a size doesn't just vanish; a fully sold-out product shows a "Sold Out" badge and drops Quick Add. The cart drawer also re-checks every item against the live catalog whenever it's opened (`shared/cart.js`'s `refreshStock()`), so a cart that's gone stale over days/weeks flags the dead item right there instead of failing deep in checkout.

## WARDROBE codes
Every apparel item purchased (not Clikey) generates a `WARDROBE-XXXX-###` activation code, shown on the order-success screen and validated via `POST /api/wardrobe/validate-code`. Codes are persisted to Postgres via mambru-backend (`storeWardrobeCodesRemote`/`claimWardrobeCodeRemote`, gated on `MAMBRU_BACKEND_URL`/`MAMBRU_API_KEY`) — that's the source of truth, so a code survives a server restart. The in-memory `WARDROBE_CODES` object is kept only as a same-process fallback so a mambru outage can't break a checkout that's already charged a card. `GET /api/wardrobe/catalog` exposes the full product catalog shaped for clothing recognition (optionally gated behind `WARDROBE_API_KEY`).

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

OWNER_EMAIL=chrisclm713@gmail.com
EMAIL_USER=your_sender_email
EMAIL_PASS=your_email_app_password
PORT=3000
```

- **Square**: create a developer account at [developer.squareup.com](https://developer.squareup.com), make a sandbox app to get `SQUARE_ACCESS_TOKEN` (secret, server-side only) + `SQUARE_APPLICATION_ID` (client-safe, goes in the frontend `CONFIG` too) + `SQUARE_LOCATION_ID`. Test cards and nonces are documented in Square's sandbox testing guide. Switch `SQUARE_ENV` to `production` and swap all three values for their live-app equivalents when you're ready to take real payments.

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
Each of `index.html`, `catalog.html`, `about.html` has its own small inline `CONFIG` block — update them the same way:
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
1. Swap Square sandbox credentials for live-app credentials (backend `.env` + every frontend `CONFIG` block), and set `SQUARE_ENV=production` everywhere.
2. Place a real order end-to-end before flipping DNS — Square has no webhook wired up here (payment confirmation is synchronous via `payments.create`'s response), so a live test order is the only way to confirm the full Printify/Tapstitch/WARDROBE flow actually fires.

---

## API
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| GET | `/api/products` | Showfloor-tagged Printify products |
| GET | `/api/wardrobe/catalog` | Full catalog shaped for clothing recognition (optionally gated by `WARDROBE_API_KEY`) |
| POST | `/api/wardrobe/validate-code` | Claim a WARDROBE activation code |
| POST | `/api/calculate-shipping` | Flat-rate shipping + tax estimate for the cart |
| POST | `/api/payment` | Tokenize-and-charge with Square, then route each item to its fulfiller (Printify / Tapstitch), mint WARDROBE codes, and email a free Clikey gift on $100+ orders |
| POST | `/api/drop-signup` | Save an email for drop notifications (deduped, persisted to `backend/data/signups.json`) — **fallback only**; the frontend's real signup flow posts to the mega backend's Postgres-backed route instead, see "Newsletter capture" above |

---

## File structure
```
cungus/
├── index.html            # home page (2AM brand hero + ticker + shop section)
├── catalog.html           # full product catalog
├── product.html            # dedicated product page (product.html?id=X) — gallery, variant picker, size guide, related products
├── about.html              # brand story page (hero, statement, policies)
├── 404.html                # branded not-found page (served automatically by GitHub Pages)
├── shared/
│   ├── base.css            # design tokens + shared components (nav, cart, checkout, cards, modal, signup, scroll-reveal)
│   ├── cart.js              # cart state, persistence, rendering, newsletter signup
│   ├── checkout.js           # checkout step navigation + Square Web Payments SDK
│   ├── cursor.js              # custom cursor + scroll-reactive nav + footer year
│   └── reveal.js               # IntersectionObserver scroll-reveal animation
├── assets/
│   └── og-image.svg         # social share card (og:image / twitter:image)
├── CNAME                  # 2amcases.online
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── railway.toml
│   ├── .env.example
│   ├── data/              # signups.json, preorders.json (gitignored, auto-created)
│   ├── blanks/              # drop clikey-blank.stl here (gitignored)
│   └── .gitignore
├── .gitignore
└── README.md
```
