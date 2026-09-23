# 2amcases.online — trust fixes (2026-09-19)

Spectrum's Security Shield (Cujo AI) blocks the site: `http://` 302s to
`block.charter-prod.hosted.cujo.io/warn.html`, `https://` dies at the TLS
handshake. Root causes we can see, and what fixes each.

## Why it looks suspicious to a reputation engine

| Signal | Status |
|---|---|
| Domain registered 2026-06-02 (brand new) on `.online` (heavily abused TLD) | Can't fix — only time + a clean record does. Appeal helps. |
| `www` CNAME → `chriscanod.github.io` — that GitHub user **does not exist** (yours is `chriscancod`). Dangling CNAME = anyone can register it and serve content on your domain. | **Fix in Namecheap (step 1)** |
| Contact is a personal Gmail on 47 places; no domain email | **Steps 2 + 3** |
| No DMARC record; SPF only covers forwarding | **Step 4** |
| Checkout API is `cungus-production.up.railway.app` (generic host receiving names/addresses/emails) | **Steps 5 + 6** |
| Internal docs / backend source served publicly (public repo + Pages) | **Done** — `_config.yml` (needs deploy) |

## Done in the repo (not deployed yet)

- `_config.yml` — stops Pages publishing `*.md`, `backend/`, etc.

## Steps for Chris (Namecheap → Domain List → Manage → Advanced DNS)

1. **Fix `www`**: change the `www` CNAME value from `chriscanod.github.io.`
   to `chriscancod.github.io.` (one missing "c").
2. **Create the mailbox**: Namecheap → Domain → Redirect Email / Email
   Forwarding → add alias `support` → forwards to your Gmail. (MX records for
   forwarding already exist, but a 2026-09-04 note says this alias was never
   created.) Then send a test email to support@2amcases.online and confirm it
   arrives. **Do not skip the test.**
3. Tell Claude "alias works" → it swaps the Gmail for `support@2amcases.online`
   across the site and adds `.well-known/security.txt`.
4. **DMARC**: add TXT record, Host `_dmarc`, Value
   `v=DMARC1; p=none; rua=mailto:support@2amcases.online`
5. **API subdomain**: add CNAME, Host `api`, Value = the target Railway shows
   for the custom domain `api.2amcases.online` (Claude can add the domain on
   the Railway `cungus` service in project `spectacular-curiosity` and read the
   exact target from `domain-status`).
6. When `api.2amcases.online` returns HTTP 200, Claude switches `BACKEND_URL`
   in index/about/product/catalog to it. **Don't switch earlier — checkout
   would break.**
7. Optional: GitHub → Settings → Pages → verify `2amcases.online` (TXT record)
   so nobody else can ever claim it.

## Then appeal

Submit `CUJO-APPEAL-DRAFT.md` (Spectrum form + Cujo contact) *after* steps
1–4, so a reviewer who looks at the domain sees a clean setup. The form uses
reCAPTCHA — a person has to submit it (adult sign-off recommended).
Re-test: `curl -sI http://2amcases.online` should stop redirecting to cujo.io.

## Not changed on purpose

- Checkout flow itself — already correct: Square Web Payments SDK (card fields
  are Square's iframe, card numbers never touch our domain), server-side
  charge, idempotency key, decline page, order confirmation.
- Backend CORS is `cors()` (open). Worth locking to the storefront origins
  *after* the api subdomain cutover — separate change, needs a backend deploy.
