# Rotation 1 — cungus / 2AM: 45-item audit (2026-09-09)

Audit written **before** any edits, so the scope is visible first.

## The project

- **Repo:** `~/Desktop/Bruce/dropbox/fluffy unicorns/cungus/`
- **Stack:** hand-written static HTML + one shared CSS file + five small vanilla-JS
  files. No framework, no build step, no `package.json` at the site root. Deployed
  via GitHub Pages (`CNAME` → **2amcases.online**).
- **Pages:** `index` · `catalog` · `product` · `about` · `privacy` · `terms` ·
  `404` · `order-confirmation` · `payment-declined` · `revive` (a redirect stub).
- **Shared JS:** `cart.js` (cart + newsletter + support chat + rewards),
  `checkout.js` (Square Web Payments), `consent.js` (cookie banner),
  `cursor.js` (footer year), `reveal.js` (scroll fade-in).
- **Backends (both Railway):** `cungus-production` (products, shipping, coupons,
  payment, loyalty — source is `cungus/backend/server.js`) and
  `mega-backend-production` (drop signups, support chat — source is
  `mambru-backend/`). Note: `cungus/backend/server.js` **is** live for the store
  API; only its `/api/drop-signup` route is dead, which matches the earlier
  roadmap note rather than contradicting it.
- **Git:** yes, but with a dirty tree — 10 modified and 6 untracked files sitting
  uncommitted before this session started.

## Prior work — this list overlaps three passes already done on 2026-09-08

I read `MILLIONAIRE_ROADMAP.md` first. Yesterday's three passes already closed
several items on today's list, verified rather than assumed:

| Today's item | Status coming in |
|---|---|
| 3. Privacy policy | Done — `privacy.html`, real content |
| 4. Terms | Done — `terms.html` |
| 7. Custom 404 | Done — `404.html` |
| 8. Fake reviews | Done — grepped again today, genuinely zero |
| 13. Cookie banner | Done — `consent.js` |
| 24. Favicon | Done — inline SVG data-URI on all 9 pages |
| 25/26. Titles + meta descriptions | Done, incl. per-product dynamic on `product.html` |
| 29. Clickable email | Done — `mailto:` in every footer |
| 30. Clickable logo | Done on 7 pages |
| 44. Auto copyright year | Done — `cursor.js` fills `#fyear` |

So the real work today is the ~20 items below that are genuinely still open.

---

## Findings

### 🔴 Severity 1 — ship-blockers

**F1. The return policy is a promise the business cannot keep.**
Every surface says *"Free returns within 30 days on unworn, unwashed pieces.
Email us and we'll send a label."* — `about.html` (policy band + FAQ),
`terms.html`, and the cart drawer on `index/catalog/product/about`.

Printify's actual policy (fetched today, cited below):
- Made-to-order, so **returns and exchanges are not supported** for wrong size,
  wrong colour, or change of mind.
- Damaged / misprinted / manufacturing error → **free reprint or refund within
  30 days of delivery**, photo required, **no need to return the item**.
- Failed delivery → reprint at extra cost, or partial refund.
- DTG print placement has a **0.5" tolerance** — not a defect.
- Refunds land in the *merchant's* Printify balance, not the customer's card.

There is no warehouse and no return label to send. As written the claim is
false, and under FTC rules a posted policy has to be honoured. **This needs
Chris's decision (Q1) before the copy can be finalised.**

**F2. Product-card text is invisible — 1.23:1 contrast, on every phone.**
The 2026-09-03 "old money" repaint flipped `--white` from a real white to ink
brown `#2a2419`, but `.pc-shade` / `.pc-badge` / `.pc-img-cnt` kept their old
near-black backgrounds (`rgba(2,2,4,.94)`, `rgba(2,2,4,.65)`). Result — measured
with real relative-luminance math, not eyeballed:

| Element | Ratio | WCAG AA needs |
|---|---|---|
| `.pc-name` / `.pc-price-txt` on `.pc-shade` | **1.23:1** | 4.5:1 |
| `.pc-tag-txt` on `.pc-shade` | **1.08:1** | 4.5:1 |
| `.pc-btn` ("Select Options"/"Quick Add") | **1.22:1** | 4.5:1 |
| `.pc-badge` ("New"/"Preorder"/"Sold Out") | **2.05:1** | 4.5:1 |
| `.pc-img-cnt` ("3 photos") | **1.45:1** | 4.5:1 |

On desktop this only bites on hover. But `base.css`'s `(hover:none)` block forces
`.pc-info` and `.pc-shade` to `opacity:1` permanently on touch — so **on every
phone, every product name, price and buy button on the homepage and the whole
catalog is dark-on-dark**. Yesterday's contrast pass fixed two `:root` tokens and
never looked at these hard-coded literals.

**F3. There is no mobile navigation at all.**
`base.css:435` — `@media(max-width:900px){ .nav-center{display:none} }`, with no
hamburger, no drawer, nothing put in its place. Below 900px a visitor can reach
Home (via the logo) and the Bag. **Shop and About are unreachable from the nav on
every phone.** Item 34 isn't "the mobile menu is buggy", it's "there isn't one."

### 🟠 Severity 2 — real gaps

**F4. Six more contrast failures from the same repaint**, all hard-coded low-alpha
literals that the token-level fix never reached: `.footer-links` 1.64:1,
`.footer-copy` 1.33:1, `.ticker-item` 1.64:1, `.mq2-item` 1.48:1, `.field-label`
1.89:1, `.secure-note` 1.92:1, `.wc-how` 2.06:1, `.about-sub` 1.64:1. Also
`--green` (`#5c8a5c`, used for the Printify fulfilment tag) at 3.44:1.

**F5. No consent notice on any form.** The newsletter band, the Rewards lookup and
the checkout all collect an email with no line saying what happens to it and no
link to the privacy policy. (Item 12.)

**F6. `/api/loyalty/lookup` has no rate limit.** `cungus/backend/server.js:911` —
an unauthenticated GET that takes an email and returns whether an account exists
plus its points balance. That's unlimited email enumeration. Every *other* public
write route already has a limiter (`paymentLimiter`, `codeAttemptLimiter`,
`dropSignupLimiter`, `supportChatLimiter`); this one was missed. (Item 35.)

**F7. Checkout email validation is weaker than the newsletter's.** Yesterday's fix
tightened `cart.js` to a real regex but `checkout.js:88` still does
`.includes('@')` — a bare `"@"` passes and the order goes through with an
undeliverable address. (Item 37.)

**F8. Colour swatches have no accessible name.** `.color-btn` is an empty
`<button>` carrying only `title="Navy"`. Screen readers announce "button". Same
for the cart-close `✕` (no `aria-label`, unlike the modal close which has one) and
the catalog sort `<select>` (no label). (Items 20–21.)

**F9. `404.html` will break on any nested URL.** All its links, its stylesheet and
its scripts are page-relative (`shared/base.css`, `index.html`,
`shared/cursor.js`). GitHub Pages serves the same 404 document for
`/anything/deep/` — where those relative paths resolve to
`/anything/deep/shared/base.css`, giving an unstyled page with dead links and no
footer year (since `cursor.js`, which fills `#fyear`, also fails to load). On a
top-level 404 it's fine; one directory down it falls apart. It's also the only
page with no meta description. (Items 7, 26, 44.)

*(Correction made while fixing: an earlier draft of this line said 404.html
doesn't load `cursor.js` at all. It does — the year is fine on top-level 404s. The
real defect is only the relative-path resolution described above.)*

**F10. Footer links differ on every page.** `index` has Home/Shop/Shipping/
Returns/Privacy/Terms/Contact; `catalog` drops Shop; `404`/`privacy`/`terms` drop
Shipping and Returns; `about` uses same-page `#shipping` anchors while others use
`about.html#shipping`. Nothing is *broken* — a link check across every `href` on
every page found zero dead internal targets — but it's inconsistent. (Item 31.)

**F11. Missing pages.** No services/offering page (1), no dedicated FAQ page (2 —
it exists only as an accordion buried at the bottom of About), no cookie policy
(5), no refund policy (6).

### 🟡 Severity 3 — audit results, no defect found

**F12. Tracking audit (item 14) — clean.** Grepped every page and script for
analytics, pixels, GTM, `gtag`, `fbq`, beacons. **Zero tracking of any kind.** No
cookies are set by this site at all; `localStorage`/`sessionStorage` hold only the
cart, the last-used email and the order/decline hand-off. That's genuinely a
strong privacy position, and it's worth saying so on the cookie page rather than
writing generic boilerplate that implies trackers exist.

**F13. Third-party embeds (item 15) — three, all documented below.**

| What | From | Why | Privacy impact |
|---|---|---|---|
| Google Fonts CSS + WOFF2 | `fonts.googleapis.com`, `fonts.gstatic.com` | 4 typefaces | Sets no cookies, but **Google receives every visitor's IP**. A German court (LG München I, 2022) held that hotlinking Google Fonts breaches GDPR. Self-hosting removes this entirely. |
| Square Web Payments SDK | `web.squarecdn.com` | card tokenisation | Necessary for checkout; loaded **only** when the payment step opens, not on page load. Correct behaviour. |
| Product images | Printify CDN | catalog imagery | Fetched at runtime; Printify sees the visitor's IP on any page showing products. Unavoidable with POD. |

Verified `SQUARE_ENV` is `production` and the production SDK URL is used on all
four checkout-capable pages — no sandbox/production mismatch (the class of bug
that broke checkout on 2026-08-29).

**F14. Image licensing (item 16) — clean, and simpler than expected.** The site
ships **zero local raster images**. The only files in `assets/` are the 53 KB
`og-image.png`, its SVG source, and a `.bak`. Everything else is Printify mockups
served from their CDN, which the Printify ToS licenses to the merchant selling
those products, and the brand mark is Chris's own inline SVG. Nothing sourced from
a stock site, nothing to attribute.

**F15. Image compression (item 23) — nothing to do.** Following from F14: one
53 KB PNG at 1200×630 is already reasonable for an OG card. The real page-weight
lever here is Printify's CDN images, which the site doesn't control (it does
already set `loading="lazy"` below the fold). One piece of dead weight:
`assets/og-image-OLD-STALE-20260830.png.bak`, 58 KB, committed but unused.

**F16. Data minimisation (item 11) — already correct.** Checkout collects name,
email and address; the newsletter and Rewards forms collect email only; support
chat takes a message and an optional order code. No phone, no date of birth, no
gender, no marketing profile. Nothing to strip.

**F17. Proofreading (item 45).** No lorem/placeholder text anywhere (item 38
clean), no broken buttons found (item 39 — every `onclick` target resolves to a
defined function). Two small real defects: two of the five FAQ `<summary>`
elements are missing the `<span class="faq-icon">` the other three have, so their
+/– indicator just doesn't render; and the About page's brand statement runs five
sentences into one 90-word paragraph.

**F18. Horizontal scroll (items 40–41).** `body{overflow-x:hidden}` is set
globally, which *hides* overflow rather than preventing it — it suppresses the
symptom and can mask a real overflow. Reviewing the layout rules I found no
element that actually exceeds the viewport (grids collapse at 1100/900/720/480px,
type is `clamp()`-fluid). I'd rather Chris confirm on a real phone than claim it
from static analysis.

---

## Jurisdiction (item 17)

The business details needed to answer this properly don't exist yet (Q2). What
can be said now:

- The site sells only to the **US** — `checkout.js` hard-codes `country:'US'` and
  the address form has US state/ZIP fields. So it isn't *targeting* the EU, which
  is the test that matters for GDPR; GDPR applies where you offer goods to people
  in the EU, not merely where someone can load your page. Current exposure is low.
- The one real EU-facing item today is the **Google Fonts hotlink** (F13), which
  transmits every visitor's IP to Google regardless of where they are.
- **US state law is the more relevant risk.** California and New York both require
  a refund/return policy to be conspicuously posted, and where it isn't, a
  customer may be entitled to a fuller refund than the merchant intended. That
  makes the refund page (item 6) a genuine legal item, not a checkbox.
- `terms.html` currently says governing law is *"the United States and the
  seller's home state"* with a bracketed note to Chris. That placeholder is still
  sitting on the live site (Q2).

**I'm not a lawyer and this isn't legal advice** — it's what the code and the
vendor policies actually say. Anything with real money attached is worth running
past a trusted adult.

---

## Plan

**Batch A — pages:** services/offerings, FAQ, cookie policy, refund policy; fix
`404.html`'s relative paths, year and meta description.
**Batch B — trust:** correct the return-policy copy sitewide, form consent
notices, rate-limit the loyalty route, tighten checkout email validation.
**Batch C — accessibility:** product-card contrast, the eight low-alpha literals,
`aria-label`s, focus states.
**Batch D — nav/UX:** mobile menu, footer-link consistency, FAQ icons, proofread.

Analytics recommendation for item 43 is in the report back, not built — it needs
an account Chris creates.

---

## Sources

- [How does Printify handle refunds and returns? — Printify Help Center](https://help.printify.com/hc/en-us/articles/4483630299025-How-does-Printify-handle-refunds-and-returns)
- [When is a product eligible for a reprint? — Printify Help Center](https://help.printify.com/hc/en-us/articles/4483625769105-When-is-a-product-eligible-for-a-reprint)
- [How to Handle Print-on-Demand Returns — Printify](https://printify.com/knowledge-hub/how-to-handle-print-on-demand-returns/)
