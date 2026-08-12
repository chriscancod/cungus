# Revive drop — run this on 8/18

Drop time: **2026-08-19, 02:00 ET**. Do this the evening before, not at 1:55am.

---

## 1. The one that matters: tag the products (5 min, only you can do it)

Right now **all three Revive products are public and buyable** in the normal
catalog, tagged `Accessories` / `Men's Clothing`. Nothing carries the tag the
drop gate looks for, so on 8/19 the gate opens onto an empty grid.

In Printify, add the exact lowercase tag **`revive`** to:
- Revive phone case
- Revive hoodie
- Revive shirt

Then confirm they've *disappeared* from the public catalog:

```bash
curl -s "https://cungus-production.up.railway.app/api/products" | grep -c -i revive
```

**Expect `0`.** Anything else means the tag didn't take — the match is exact and
case-insensitive on the whole tag, so `Revive Drop` or `revive-2026` won't work.

---

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

- **Empty grid** → the tag isn't on the products. Fix in Printify; the cache is
  60s, so it self-corrects within a minute. No redeploy needed.
- **Site slow / erroring** → Printify is rate-limiting. The 60s cache should
  absorb it; wait it out rather than redeploying into the traffic.
- **Drop didn't open** → check `dropAt` on both endpoints (step 2). If one
  service has a bad value, fix that env var in Railway and redeploy just it.
- **Anything involving money looks wrong** → stop taking orders and check step 4
  before doing anything else.
