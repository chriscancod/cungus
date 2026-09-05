# 2AM — Printify Branding + Custom Packaging Research

Started 2026-09-03. Chris's ask for 2AM this round: "Printify + custom packaging
research." Same discipline as `phone/hardware/BOM.md`/`DURABILITY.md` — real,
checked information, no invented pricing or capability. This is a research
doc, not something requiring a code change here: everything below except the
"what's NOT feasible" section is a setting Chris enables himself in the
Printify dashboard, not something this codebase's `backend/server.js` needs
wired up (it already places real orders via `POST /shops/{shop_id}/orders.json`
— packaging is a store-level Printify setting that applies automatically to
orders placed that way, not a field this backend has to pass per-order).

---

## What's real and available now, no code change needed

Printify's actual branding toolkit (checked directly against
[help.printify.com](https://help.printify.com/hc/en-us/articles/4483609248401-How-can-I-brand-my-products),
2026-09-03):

**Packaging inserts** — a customizable printed card (thank-you note, discount
code, QR code to a review link, social handles) added automatically to every
eligible order once enabled. Set up once in Printify's dashboard: **Store
Settings → Branding → Start designing**, built in the same Product Creator
used for actual merch. No minimum order, no per-order toggle needed — once
saved, it applies to every new order placed after that point, routed
automatically only to Print Providers that support it (Printify calls this
"order routing" — it's automatic, not something Chris picks per order).
Real constraints worth knowing before designing the card: not available on
Express Delivery orders, and there's a real per-insert production cost shown
in the Product Creator before Chris saves it (not zero — this doc isn't
pricing it since that number lives inside Chris's own Printify account, but
it's not free, so budget for it before committing to a design).

**Gift message inserts** — a separate, simpler feature: a printed card with a
personalized message, mainly relevant for Etsy gift orders or manually-entered
orders, not the main lever for 2AM's own storefront checkout flow, but worth
knowing it exists.

**Neck labels + sleeve prints** — real, but Print-Provider-specific, which is
the one thing this doc genuinely can't answer from this sandbox: no Printify
API token or dashboard access here, so there's no way to check which Print
Provider each of 2AM's actual products in the Printify catalog is currently
assigned to. As of this research, the providers that support neck labels are
Dimona Tee, Monster Digital, Print Clever, Stoked On Printing, SwiftPOD, and
Textildruck Europa; sleeve printing is narrower — OPT OnDemand, Fulfill
Engine (sweatshirts only), Textildruck Europa, SwiftPOD. **Chris needs to
check this himself**: Printify dashboard → each product → Print Provider —
if a product isn't on one of those, neck labels/sleeve prints aren't
available for it without switching providers (which can also change base
cost and print quality, so that's a real tradeoff, not a free switch).

---

## What's NOT feasible right now: fully custom shipping boxes

This is the part of "custom packaging" that needed real research rather than
an assumption, because it's easy to conflate two different things:

**Printify itself does not offer custom-printed shipping boxes as a per-order
POD product.** Its own packaging tools stop at the insert-card/neck-label
level above — the actual outer shipping package (poly mailer or plain box,
provider-dependent) isn't something Printify lets a merchant reskin per
order.

**A real custom box vendor exists, but it's a different business model
entirely, and it's easy to confuse with Printify by name alone** — worth
flagging explicitly since a casual search turns up "BoxPrintify"
(boxprintify.com), which despite the name has **no relationship to Printify,
Inc.** (confirmed by fetching the site directly — it's a separately-registered
UK/US packaging manufacturer, "BOX PRINTIFY LTD"). It and vendors like it sell
real custom-printed boxes — but with a real minimum order (BoxPrintify's own
site advertises "Starting from 50 Boxes"), a real per-box cost, and — the
part that actually rules it out for 2AM right now — **it requires holding
physical inventory to hand-pack**. 2AM's whole fulfillment model is
dropshipping through Printify/TapStitch: the site never touches a physical
product, Printify's own Print Provider ships straight to the customer. A
custom box only works if *someone* is packing the order into it — which means
either buying inventory and warehousing/packing it by hand (a real business
model, just not this one, and not a small change), or it not being usable at
all under the current architecture.

**The honest recommendation:** the packaging insert (real, zero-MOQ, works
inside the exact dropship model 2AM already runs) is the actually-available
lever here, not a custom box. A custom shipping box is a real thing a lot of
brands do, but it means changing how 2AM fulfills orders at all, not adding a
line of code — that's a bigger business decision than "add packaging," worth
knowing is on the table for later but not something to default into now.

---

## What this doesn't do

Doesn't design the actual insert card (that's a real next step — Canva or the
Printify Product Creator, once Chris wants to move on it), doesn't check
which Print Provider each current 2AM product is actually on (no dashboard
access from here — Chris needs to look), and doesn't price the insert
(Printify shows that cost live in the Product Creator against Chris's own
account, not published as a flat rate this doc could quote honestly).

## Sources

- [Printify Help Center — How can I brand my products?](https://help.printify.com/hc/en-us/articles/4483609248401-How-can-I-brand-my-products)
- [Printify Help Center — How can I set up packaging inserts?](https://help.printify.com/hc/en-us/articles/15881614986513-How-can-I-set-up-packaging-inserts)
- [boxprintify.com](https://boxprintify.com/) — fetched directly to confirm it's an unrelated third-party packaging manufacturer, not a Printify product.
