# Cujo AI / Spectrum Security Shield block on 2amcases.online — ready-to-submit appeal

Written 2026-09-17 (rotation 1, brand). This is the concrete next step for the
block first found 2026-09-15 and re-confirmed still live today (see
`MILLIONAIRE_ROADMAP.md`'s dated entries). It needs a trusted adult to submit
it — that's the one part no session can do — everything else below is ready
to paste.

## What's confirmed, re-verified today (2026-09-17)

- `http://2amcases.online/` still 302-redirects to
  `block.charter-prod.hosted.cujo.io/warn.html?url=http://2amcases.online/&token=de7938bc`.
- `https://2amcases.online/` still fails the TLS handshake outright
  (`SSL routines::wrong version number`) — the block happens before a real
  HTTPS connection is even established.
- Control domains on the exact same network/minute load clean:
  `https://mambru.online/` returns a normal `HTTP 200`. This isn't a general
  network filter — it's specific to `2amcases.online`.
- Re-tested today from yet another independent network (this session's own
  sandbox) — same redirect target, same `charter-prod` hostname, even though
  this network has no known relationship to Charter/Spectrum. That's the
  9/16 finding holding up again: this is very likely Cujo AI's own
  domain-reputation blocklist, which multiple ISPs/security vendors pull
  from, not a single ISP's own setting — so it's worth appealing through
  both channels below, not just one.

## Real facts to state in the appeal (don't add anything not on this list)

- Domain: `2amcases.online`
- What it is: 2AM, a real, live, legitimate streetwear/essentials
  e-commerce storefront, in operation and taking real orders (Square
  checkout, real Printify fulfillment).
- Hosting: GitHub Pages (static site), custom domain via `CNAME`.
- Nothing on the site handles malware, phishing, or anything that should
  trigger a security block — it's a normal Shopify-style storefront (product
  catalog, cart, checkout, FAQ/policy pages).
- Owner: Chris (site contact: chrisclm713@gmail.com).

## Channel 1 — Spectrum's own unblock-request form (primary, since the
redirect target itself is Charter-branded)

URL: https://www.spectrum.net/support/internet/how-unblock-website-security-shield

Real, documented process, stated turnaround up to 5 business days.

**Suggested text for the form:**

> Domain: 2amcases.online
>
> This is a real, legitimate e-commerce website (2AM — an apparel
> storefront) that I own and operate. It is being incorrectly blocked by
> Security Shield / CUJO AI as if it were malicious — visiting it redirects
> to your warn.html block page. The site contains no malware, phishing, or
> harmful content; it's a standard online store (product catalog, shopping
> cart, checkout, and standard policy pages). Please review and remove this
> domain from the blocklist. Happy to provide any additional verification of
> ownership you need.

## Channel 2 — CUJO AI directly (secondary — no public false-positive form
exists, so this goes through their general contact page)

URL: https://cujo.com/contacts/

CUJO AI doesn't publish a dedicated false-positive submission form (checked
directly, 2026-09-17) — the contacts page is the real, current path. Some
site owners have reported success reaching CUJO AI this way for the same
kind of block. Use the same suggested text as above, adjusted to address
CUJO AI directly:

> We operate 2amcases.online, a legitimate e-commerce storefront (2AM —
> apparel). Your service appears to be flagging this domain as
> malicious/blocked across multiple networks (confirmed via
> block.charter-prod.hosted.cujo.io's warn page, and via a direct TLS
> handshake failure on other networks too). The site is a standard online
> store with no malicious content. Requesting this domain be reviewed and
> removed from your blocklist. Happy to verify ownership if needed.

## Why this matters (impact, not urgency-inflation)

This isn't a "some customers on one ISP can't see the site" issue — the
9/16 re-test suggests this may be a broader Cujo-reputation-feed block that
could affect visitors on any ISP/network whose security vendor subscribes to
Cujo's list, not just Charter/Spectrum customers. Real, quantified impact
unknown from here (no way to check traffic/analytics from this sandbox), but
worth prioritizing over most other open Brand-lane items precisely because
it can silently zero out a slice of real customer traffic with no error
shown to Chris — the customer just sees a block page and leaves.

## What's still not done

Nothing further is executable from this session — submitting either form
needs a real Google reCAPTCHA / contact-form flow in a real browser, plus
follow-up email access, which is Chris's (or a trusted adult's) to do. Once
submitted, re-check with `curl -v https://2amcases.online/` — a clean TLS
handshake means it's cleared.

---

## Update, 2026-09-23 — re-verified, form found, hit a real wall only Chris can clear

**Block still live, unchanged.** Re-checked right now: `http://2amcases.online/` still 302s to `block.charter-prod.hosted.cujo.io/warn.html`; `https://` still fails the TLS handshake before it completes; control domain `mambru.online` still returns a clean `200` from the same network in the same minute. Same pattern as 9/15–9/21, nothing has changed on its own.

**Channel 1 (Spectrum) — found the real form and got it ready.** The article at `spectrum.net/support/internet/how-unblock-website-security-shield` links to the actual tool: `spectrum.net/support/forms/verify_url_security` ("Website Block Verification"). It's genuinely a public, no-account-needed form. I navigated to it and filled in `https://2amcases.online`. **It hit a real Google reCAPTCHA ("I'm not a robot") that I did not attempt to solve or bypass** — that's a hard rule, not a caution. The form is sitting ready in this session's browser pane: URL filled in, one checkbox and one click away from a result. Open the browser pane and finish it, or redo it fresh at the URL above (30 seconds).

**Channel 2 (CUJO AI directly) — narrower than the 9/17 draft assumed.** `cujo.com/contacts/` no longer has any general contact form at all — just `sales@cujo.com` and `press@cujo.com`. No support, abuse or false-positive address exists. Some other site owners online report getting CUJO to act by emailing `sales@cujo.com` anyway (it's the only address that reaches a human there), so it's still worth trying, just with that caveat — it's a sales inbox, not a dedicated channel. Use the same message as before.

**A third path exists but needs a Spectrum account:** `community.spectrum.net` has at least one real, on-topic thread ("Security Shield falsely blocking my legitimate website — recategorization request") where Spectrum staff sometimes respond. It's behind a Spectrum account login (`id.spectrum.net`) — worth a look if you already have Spectrum service and an account, not something this session can access.

**The DNS fix (`www` CNAME typo) is still not done** — still resolves to `chriscanod.github.io.` (missing the second "c"), re-confirmed via `dig` right now. This session cannot log into Namecheap to fix it (a password/login action, off-limits regardless of being asked) — see `TRUST-FIXES.md` step 1 for the exact fix.

**Bottom line: every piece that needs a CAPTCHA, a password, or a Spectrum account login is now the only thing left — and all of those are yours to do, not something any session can push further.**

---

## Update, 2026-09-23 (later) — Chris submitted the Spectrum form

Chris finished the Website Block Verification form (`spectrum.net/support/forms/verify_url_security`) this session had filled in and left at the CAPTCHA — solved the reCAPTCHA and submitted it himself. Spectrum's response: **"It may take up to 5 business days to review and process your request. You will receive an email once this is done."** Real, standard turnaround language for this form, matching what the 2026-09-17 draft expected.

**Still blocked right now** (re-checked the same minute: `http://2amcases.online/` still 302s to the Cujo warn page; control domain `mambru.online` still clean) — expected, since Spectrum said up to 5 business days, not immediate. **Nothing to re-check until Chris gets the confirmation email, or ~5 business days from today (2026-09-23) pass with no email — i.e. around 2026-09-30.**

**Still open, unchanged:**
- Channel 2 (`sales@cujo.com`) — not yet sent, still worth doing in parallel since it's a separate reviewer.
- The Namecheap `www` CNAME fix (`TRUST-FIXES.md` step 1) — still the most likely actual root-cause fix (a dangling CNAME is a real reputation signal, independent of whatever review Spectrum runs), and still blocked on Chris's own Namecheap login. Worth doing regardless of how the Spectrum review comes back.

**When the email arrives:** re-check with `curl -sI http://2amcases.online/` — a normal response (no redirect to `cujo.io`) and `curl -v https://2amcases.online/` completing a real TLS handshake both mean it's cleared. If the email says the request was denied or the site is still blocked after ~5 business days, channel 2 and the Namecheap fix become the real next steps, not just backups.

---

## Update, 2026-09-24 — the block is gone, but not from the DNS fix Chris said

Chris said "dns works now we good." Checked independently rather than taken on faith:

- **The Cujo/Spectrum block is genuinely gone.** `http://` and `https://` both now resolve normally (301 → HTTPS, then a real `200` with a complete TLS handshake — no more redirect to `block.charter-prod.hosted.cujo.io`, no more handshake failure). Confirmed past headers too: fetched the real homepage (36KB, correct title) and `product.html?id=2am-the-mainstay` in this session's own browser on the real domain — **The Mainstay Jeans page renders for real, at $80.00, image loaded, correct fulfillment tag.** This was the browser that got a flat `navOk: false` two days ago; today it loaded clean.
- **The `www` CNAME typo is NOT fixed.** `dig +short www.2amcases.online CNAME` still returns `chriscanod.github.io.` — the same missing-"c" dangling record from `TRUST-FIXES.md` step 1. So whatever cleared the block, it wasn't that fix. Most likely explanation: the Spectrum review from yesterday's form submission came back faster than the stated 5 business days, or a separate reputation-feed refresh cleared it independently — either way, **the underlying dangling-CNAME risk this whole investigation started with is still live** and worth fixing regardless, since it's a real subdomain-takeover-style signal, not just a Cujo-specific one.
- **Bonus confirmation:** `_config.yml` (the fix that stops internal docs/backend source from being publicly served) is now verified working on the real domain too — `2amcases.online/CUJO-APPEAL-DRAFT.md` and `.../backend/server.js` both correctly 404.

**Net: the immediate problem (customers on Spectrum can't reach the site) is resolved. The root-cause DNS issue is not — it's just not currently the thing blocking anyone. Still worth the one-field Namecheap fix in TRUST-FIXES.md step 1 when Chris has a minute.**
