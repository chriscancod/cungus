# Revive drop — run this on 8/18

Drop time: **2026-08-19, 02:00 ET**. Do this the evening before, not at 1:55am.

---

## 1. Confirm the Revive products are hidden (30 seconds)

**No Printify work needed any more.** The gate used to require a `revive` tag
that never got added, so the three drop products sat public and buyable for
weeks. It now also matches any product whose **name** contains "revive", which
all three already do — so the drop gates itself off what they're called.

Just confirm it's still true:

```bash
curl -s "https://cungus-production.up.railway.app/api/products" | grep -c -i revive
```

**Expect `0`.** The public catalog should show **25** products, not 28.

Rehearsed 2026-08-14 against real Printify data with the clock moved past the
drop: the gate opened and returned all three — Revive phone case $30.00, Revive
hoodie $47.77, Revive shirt $27.25, with photos. The drop is loaded.

⚠️ One consequence: **any** product with "revive" in its name is now hidden
until 8/19. If you add an unrelated "Revive something" before then, it will
disappear from the shop until the drop opens.

## 2. Both services agree on the drop time

Two separately-configured Railway services, one env var, no shared source of
truth. They must match exactly.

```bash
curl -s https://cungus-production.up.railway.app/api/drops/revive
curl -s https://mega-backend-production.up.railway.app/api/drops/revive
```

Both must return the identical `dropAt` and `"live":false`:

```
{"live":false,"collection":"revive","dropAt":"2026-08-19T02:00:00-04:00"}
```

The services now log their gate state on boot, so you can also check:

```bash
railway logs | grep REVIVE_DROP_AT
```

`⏳ … drop opens in Nh` is what you want. A `⚠️` means the var is missing and
revive products would be **public**; a `❌` means it's malformed and the drop
would **never** open.

---

## 3. The countdown page survives a bad moment

The page now retries with backoff instead of dying on one failed request, and
gives up only after 8 attempts. To see it work, open the site with the network
throttled or offline for a few seconds — the status line should read
`Connecting… (retrying, attempt N)` and then recover on its own, not freeze on
an error.

---

## 4. Prices are still server-derived

Never trust a green checkout — confirm the tampering guard is live:

```bash
curl -s -X POST https://cungus-production.up.railway.app/api/calculate-shipping \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"id":"6a774c823f2ef72968022a24","variantId":61521,"name":"Revive phone case","price":"0.01"}],"shippingAddress":{"zip":"78701","country":"US","state":"TX"}}'
```

**Expect `"subtotal":"30.00"`**, not `0.01`. If it ever says `0.01` again, the
backend has been rolled back to a version anyone can buy from for a penny —
stop and redeploy before opening the drop.

---

## 5. The waitlist is real

Signups now go to Postgres (`drop_signups`), not a file that redeploys erase.
Check who is actually waiting:

```bash
cd mambru-backend && node scripts/notify-drop.js --dry-run
```

This sends nothing. It lists exactly who would get the email. The four
`@example.com` rows are test data and are already marked notified, so they're
skipped.

---

## On the night, in this order

1. **Watch the page flip on its own at 02:00.** It re-fetches when the countdown
   hits zero — you shouldn't need to touch anything.
2. **Load the site yourself and confirm products are actually in the grid.**
3. **Buy one thing** with a real card, cheapest item. Confirm the Square charge,
   the Printify order, and the confirmation email. This is the only way to know
   the whole path works.
4. **Only then**, send the waitlist email:

```bash
cd mambru-backend && node scripts/notify-drop.js
```

It refuses to run before the drop time, stamps each address as it sends, and
skips anyone already emailed — so if it dies halfway, just run it again.

**Don't send the email before step 2.** A blast into an empty or broken grid is
worse than one that goes out ten minutes late.

---

## If something breaks at 2am

- **Empty grid** → two different causes, and the response tells you which.
  Check it directly:

  ```bash
  curl -s "https://cungus-production.up.railway.app/api/drops/revive"
  ```

  - `"productsUnavailable": true` → Printify is erroring or rate-limiting. The
    drop IS open; the page says "new pieces coming online shortly" and keeps
    polling. Wait it out — the 60s cache and the retry will pick it up. Do not
    redeploy into the traffic.
  - no `productsUnavailable`, empty `products` → the `revive` tag isn't on the
    products. Fix in Printify; the cache is 60s so it self-corrects within a
    minute. No redeploy needed.
- **Site slow / erroring** → Printify is rate-limiting. The 60s cache should
  absorb it; wait it out rather than redeploying into the traffic.
- **Drop didn't open** → check `dropAt` on both endpoints (step 2). If one
  service has a bad value, fix that env var in Railway and redeploy just it.
- **Anything involving money looks wrong** → stop taking orders and check step 4
  before doing anything else.
