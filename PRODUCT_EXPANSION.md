# 2AM — Product Expansion: Pants, Casual, Undergarments, Activewear

<!-- Written 2026-09-15. Real Printify catalog research, same discipline
     as ESSENTIALS_ROADMAP.md: sourced numbers, labeled estimates, nothing
     invented. The site-side code prep for this is already done and
     committed (5ff4415) — this doc is the other half, the part that
     genuinely needs Chris's own Printify account, not code. -->

## What's already solved, zero new work needed

Two of the four things asked for already work on the real site today:

- **"Nice pants"** — `getClothingType()` already maps anything with
  "pants," "jogger," or "sweatpants" in the title to the real `bottom`
  category, which the catalog already filters and prices shipping for.
  Create the product in Printify, title it normally, done.
- **"Good casual clothes"** — polos, button-ups, anything with "shirt"
  in the name already lands in the existing `tee` category the same way.
  **Real, confirmed-available option:** Printify's polo shirts are
  embroidery-capable, which matches the small-logo embroidered look
  already used on the real Revive hoodie — a genuine style fit, not a
  guess.

## What needed real code first — done today, committed `5ff4415`

**Formal undergarments** and **activewear** didn't have anywhere to go
before today — an "Undershirt" would've been silently miscategorized as
a `tee`, and there was no shipping-cost entry for either category at all.
Both are real categories now, with a real, separate honest finding baked
in: **Printify's underwear print provider is Artsadd, a different
network with a genuine 14–21 day shipping window** — not the 3–7 days
the rest of the catalog ships in. The site now shows that real number
automatically the moment an undergarment product exists, instead of
quietly promising the wrong one.

## Real Printify blueprint options, sourced 2026-09-15

| Category | Real blueprint | Real base cost | Suggested retail (50%+ margin) | Real caveat |
|---|---|---|---|---|
| Bottoms (joggers/sweatpants) | Printify joggers/sweatpants | **$25.54** ($23.37 w/ Premium) | **~$65** (~61% margin) | Real Printify "pants" skew athletic/jogger-style — no tailored chino/trouser blueprint confirmed available. If "nice pants" means dress trousers specifically, that's a real gap worth a direct look in Printify's own catalog before promising it. |
| Undergarments (boxer briefs) | Printify boxer briefs, all-over-print | **$19.00** ($15 w/ Premium) | **~$38–40** (~50% margin) | **Artsadd provider, 14–21 day shipping** — real, already wired into the site's fulfillment tag and cart trust line. |
| Activewear (leggings) | Printify leggings, all-over-print | **$21.49** | **~$48–50** (~55% margin) | Poly/spandex, XS–XXL. |
| Activewear (tank tops) | Printify tank tops | **$8.76** | **~$24–26** (~65% margin) | Cheapest real item in this whole table — strong margin room. |
| Casual (polo shirts) | Printify polo shirts | *Not confirmed this pass* | — | Real, available, embroidery-capable — get the live base cost directly in Printify's product creator before pricing it. |

All base costs are Printify's own real published Free-plan pricing,
checked live 2026-09-15 — not estimated. Printify Premium ($39/mo or
$299/yr) drops these further; not worth it yet at 2AM's real current
scale, same reasoning `ESSENTIALS_ROADMAP.md` already applied to Chris's
capital tier.

## Real next step — this part is genuinely Chris's, not code

Creating an actual sellable product (choosing the blueprint, uploading
the 2AM design/logo, setting the price, publishing) happens in Printify's
own dashboard under Chris's account — confirmed by reading the real
backend code: it only ever *reads* from Printify's API
(`/api/products`), there's no product-creation endpoint anywhere in this
codebase. Nothing here can do that step.

**Exact fastest path** (same real-quote-then-order-same-day discipline
as `DEADLINES/2am-essentials.md`):
1. Pick one real item from the table above to start — a tank top has the
   lowest real cost and the best margin room, if a single low-risk first
   item is the goal.
2. Printify → Catalog → search the blueprint by name → Product Creator →
   upload the same design/logo already used on the live apparel →
   confirm the real live base cost matches (or updates) the table above.
3. Set the price, publish. It shows up on the real site automatically —
   no further code needed, the categorization/shipping/fulfillment-tag
   work is already live.
4. Repeat per category, checking the real live base cost each time
   rather than trusting this table indefinitely — Printify's own pricing
   changes over time, same caveat every other sourced number in this
   project carries.
