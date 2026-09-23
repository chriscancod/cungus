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
