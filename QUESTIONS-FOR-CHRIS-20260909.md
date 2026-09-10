# Rotation 1 — what I need from you (2026-09-09)

Nine things. Nothing on this list was guessed at or invented; each one either
needs a fact only you have, or is a business call that isn't mine to make.

Q1 and Q2 are the ones that matter. The rest can wait.

---

## 🔴 Q1 — Returns: honest baseline, or goodwill policy?

**Why this came up:** the site said *"Free returns within 30 days on unworn,
unwashed pieces. Email us and we'll send a label."* on five surfaces. Printify's
actual published policy (fetched today, linked in the audit) is:

- Made to order → **no returns or exchanges** for wrong size, wrong color, or
  change of mind.
- Damage / misprint / manufacturing error → free reprint or refund within 30
  days of delivery, photo required, **customer keeps the item**.
- Refunds land in *your* Printify balance, not the customer's card.

So there is no warehouse and no return label. The claim was one you physically
could not honor, and the FTC requires a posted policy to be honored — that's why
I couldn't leave it as-is while waiting for you.

**What I did:** wrote `refunds.html` to the safe baseline — defects fully
covered, size/change-of-mind not accepted — and matched the copy on About,
Terms and all four cart drawers.

**Your call:** you could instead offer a **goodwill return** — refund out of your
own margin and let them keep the piece (nothing to ship back either way). Lots of
POD sellers do this; it's a genuinely better experience and it costs you the full
item every time someone uses it. On $30–40 pieces with your current volume that's
probably survivable and probably worth it for the trust. But it's real money, so
it's yours to decide.

→ **Baseline as-is, or goodwill?** One word and I'll rewrite the section.

---

## 🔴 Q2 — Is WARDROBE claimable yet?

The site promises the app **thirty-plus times** across every page: the ticker
says "WARDROBE App Ready", every product ships an activation code, the
confirmation page has an "Open WARDROBE" button.

`UPDATES.md` says the only App Store Connect records are **Bettermade** and
**carspootz**, neither publicly released. And the confirmation page's App Store
fallback pointed at `apps.apple.com/app/nightinc-wardrobe` — not a valid App
Store URL (real ones need the numeric id), so it **404s**. Someone who just paid,
without the app installed, hit an Apple error page seconds after checkout.

**What I did:** fixed only the dead link (now an App Store search URL that
actually resolves, plus a guard so it doesn't yank you out of the app if the deep
link worked). I did **not** touch the app messaging — that's a product call.

→ Three things: **(a)** is WARDROBE a section inside Bettermade, or its own app?
**(b)** is it shipping, and when? **(c)** what's the real App Store id once it's
live? Until then the site is selling a benefit nobody can collect, which is the
same category of problem as Q1.

---

## 🟠 Q3 — Real business details (items 10, 17)

You asked for real business details on the site. I have none of these and did not
invent any:

- **Legal name** — is 2AM a registered entity, a DBA, or just you personally?
  Terms currently says "2AM" with no entity behind it.
- **State** — `terms.html` still literally reads *"the laws of the United States
  and the seller's home state. (Chris — confirm your actual state here…)"*.
  That placeholder from 2026-09-08 is live on the site right now.
- **Contact address** — you don't need a storefront, but a mailing address is
  what most "real business details" checklists actually mean. A PO box is fine.
  If you'd rather not publish one at all, say so and I'll leave it off rather
  than half-do it.

Given you're 13 and running this solo, the entity question is worth ten minutes
with a trusted adult before you put a name on a legal page. I left the site
saying "independently run" with no name, age or photo, which is the right call.

---

## 🟠 Q4 — Phone + WhatsApp (items 27, 28)

Both are on your list; I can't build either without a number, and I'm not going
to put a fake one on a live storefront.

- `tel:` link — do you want your actual number public? Think about it honestly:
  it's permanent, it's scrapeable, and it's your phone.
- WhatsApp `wa.me/<number>` click-to-chat — same question, plus WhatsApp's own
  minimum age is 13 in most regions.

**My read:** email is doing the job fine, your response time is genuinely good,
and the support widget covers the instant-answer case. Adding a personal phone
number to a public site is the one item on the 45 I'd push back on. If you still
want it, send the number and it's a five-minute change. A Google Voice number
would be the middle path.

---

## 🟡 Q5 — "Services page" — did I read this right?

2AM sells clothes; it has no services. A literal Services page would mean
inventing offerings that don't exist. I read item 1 as *"one page listing
everything 2AM actually offers"* and built `services.html` — "What We Do":
the collection, made-to-order, WARDROBE, Rewards, defect cover, support, plus a
"what 2AM doesn't do" section.

→ Right read? If you meant something else, tell me and I'll rebuild it.

---

## 🟡 Q6 — Claims I left alone

Nothing on the site is a *fake review* — grepped for stars, "verified buyer",
"trusted by", counts. Genuinely clean, same as yesterday's finding. But these are
unverifiable claims I chose to flag rather than silently edit:

- **"Est. 2024"** — on every page, in the ticker and hero. True?
- **"Every Stitch Intentional"** / **"Premium Heavyweight"** / **"Quality Over
  Everything"** (the scrolling marquee) — standard fashion puffery, legally fine.
  Slightly odd for print-on-demand, since you don't control the stitching. Your
  call whether it still fits the brand.
- **"usually answered the same day"** — a real commitment now labeled as a
  response-time promise. Keep it only if it's true on your worst week too.

---

## 🟡 Q7 — Analytics (item 43)

You asked for "a way to see active users." I didn't sign you up for anything.

**Recommendation: Plausible or Umami.** Both are cookieless, GDPR-safe by
default, don't collect personal data, and won't undercut the "we track nothing"
position that's now written into your privacy and cookie pages — which is a real
differentiator, not a filler line. Plausible is ~$9/mo hosted; **Umami is free if
you self-host it on the Railway account you already have**, which fits the $40
budget and the Stark Rule better.

Google Analytics would work too, but it's the one option that forces you to
rewrite both new legal pages and turn the consent banner into a real gate. Not
worth it for a storefront this size.

`shared/consent.js` already exposes `window.hasAnalyticsConsent()` — whatever you
pick, the snippet gates on that and it's a ten-minute job.

---

## 🟡 Q8 — Google Fonts is the only real privacy leak

Four typefaces load from Google's servers, so **Google gets every visitor's IP on
every page view**. No cookie, but a German court has held that hotlinking Google
Fonts breaches GDPR. It's now disclosed on both the privacy and cookie pages.

The clean fix is self-hosting the four font files (~200 KB, one-time). Also makes
the site faster by removing a third-party round-trip. Want me to do that next
rotation?

---

## 🔵 Q9 — Two things only you can do

- **`.git/index.lock` is still stuck — re-confirmed 2026-09-10, same diagnosis
  as yesterday, now with a live test behind it.** Re-tried this morning with
  direct shell access: `rm -f .git/index.lock` reports success and `ls`/`stat`
  briefly agree, but the moment git itself touches the index again it hits
  `fatal: Unable to create '.../index.lock': File exists`, and a fresh 0-byte
  lock file reappears immediately. That matches yesterday's finding exactly —
  this environment can't durably delete files inside your connected folder
  from a Cowork session, period, which is also why a `.git/index.lock.stale`
  and two other abandoned lock artifacts from the 2026-09-05 crash are still
  sitting in there too. No session running in this environment will ever be
  able to clear it, no matter how many times "run rm" gets suggested — only a
  real terminal on your own Mac has an unrestricted filesystem. Run this in
  Terminal.app (not through Claude/Cowork):
  ```
  rm "$HOME/Desktop/Bruce/dropbox/fluffy unicorns/cungus/.git/index.lock"
  ```
  Everything currently sitting uncommitted in this repo (yesterday's full 45-item
  pass, today's font self-host + about.html paragraph split) commits normally
  the moment that one file is gone.
- **Open it on your actual phone.** I fixed the mobile menu and the product-card
  contrast from the CSS and the math, but the browser here was blocked from
  loading the live site, so nobody has *looked* at it yet. Check: the menu opens
  and closes, product names/prices are readable on the catalog, and nothing
  scrolls sideways.
