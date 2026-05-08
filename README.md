# cungus — 2AM Store

Full-stack 2AM streetwear storefront. Printify fulfillment + Square payments.

## Stack
- **Frontend** `frontend/index.html` — vanilla HTML/CSS/JS
- **Backend** `backend/server.js` — Node.js/Express on Railway
- **Payments** — Square Web Payments SDK
- **Fulfillment** — Printify (auto-routes on checkout)

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
PRINTIFY_API_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIzN2Q0YmQzMDM1ZmUxMWU5YTgwM2FiN2VlYjNjY2M5NyIsImp0aSI6ImE0ZGJhNmM1ZWEyNjMwNTMyZWVlYTc0YTYxOWViYTk0NjEzMTE4NmUxMWY3NjIzZjUxMmU4YTg2N2JkOGM4ODE0NGI5NDI5NDZmZGZkMzZmIiwiaWF0IjoxNzc4MTk3NDgxLjkxNTU4LCJuYmYiOjE3NzgxOTc0ODEuOTE1NTgyLCJleHAiOjE4MDk3MzM0ODEuOTA3MzA0LCJzdWIiOiI3MzUwNjMzIiwic2NvcGVzIjpbInNob3BzLnJlYWQiLCJjYXRhbG9nLnJlYWQiLCJvcmRlcnMucmVhZCIsIm9yZGVycy53cml0ZSIsInByb2R1Y3RzLnJlYWQiLCJwcm9kdWN0cy53cml0ZSIsInVwbG9hZHMucmVhZCIsInVwbG9hZHMud3JpdGUiLCJwcmludF9wcm92aWRlcnMucmVhZCJdfQ.HyvTkk20tCHTrLkcZW8lIImlLQjiDymnmlQCyARbrK9-SiIgzFdFFNVRNYjJytLQmFtxrftS0yeC40o-Y2VyFcIU9CuBKOpfMy23pvHKbOVXO3R96Rtk27aUMndWPrSuysLc1UA3NR95pvQWsm_iEQ5iRtSk6ZhGb1JwCcPxV6p68z87Ok8RM-WCoq80-xIDgqu6XyXrs3U5G96AabR_cjzhKHzNW4SWshA8DKwZ_cfbSVsw0cF5QRn7LScDBTHn94BFi4YS5_Hq6RrANbb8D1Pu8h2A1ylDbMq_2zXAlU011tQXgnL1ca2-rXOTT0hsNxqNAaGVHcDLA2WMG2m37GBCnXgT-4FYWKTD7bZ5GuXDcu5I31NFShDFYUpuoHrK7uObes1r9e22TdV1Db6jaqTsPaKG5eQqktw2HTgILfpvDC4n8Z5tIKeosx38of9Vl5w0hes0ql9L3BYnmQ7nDjb-MZpqbuyXjVvbSwArRYcJ6oSH01YHAic_K_QQk6Xs8dbvBtmYtt3kCR2ifhlaE0T-VX2Q8MrPCNcbXmXumUFCIdcOt_-vbgOqzbzOIGuS14okMD9AtiV18FhJdQtjO6Ne-j56XDxp3nJA7ROvOljpo5M5KHozHyyZaT7KJRmT15OY-jfaE4Y-VrX1nkMwiB2xpkltIsJ2XQN1NTQtg6U
PRINTIFY_SHOP_ID=1
SQUARE_ACCESS_TOKEN=EAAAl9gu222JU2jC71_qnTAGWxYpRAeQ_CvMawmKopTvlTVzdYMFaIWBT6OkamX4
SQUARE_LOCATION_ID=LXMD56RWM6PV7
SQUARE_ENV=sandbox
```

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
Open `frontend/index.html`, find the CONFIG block and update:
```js
const CONFIG = {
  BACKEND_URL: 'https://cungus-production.up.railway.app',
  SQUARE_APP_ID: 'sandbox-sq0idb-...',
  SQUARE_LOCATION_ID: 'YOUR_LOCATION_ID',
};
```

### 6. Deploy frontend to GitHub Pages
- Repo Settings → Pages → Branch: main → Folder: `/frontend`
- For custom domain: add `2amcases.com` in Pages settings
- In your DNS (Namecheap): CNAME → `chriscancod.github.io`

### 7. Go live
1. Switch Square to production keys
2. Change `SQUARE_ENV=production` in Railway vars
3. Swap Square script tag in index.html:
   - Sandbox: `https://sandbox.web.squarecdn.com/v1/square.js`
   - Production: `https://web.squarecdn.com/v1/square.js`

---

## API
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| GET | `/api/products` | All Printify products |
| GET | `/api/products/:id` | Single product |
| POST | `/api/payment` | Charge Square + create Printify order |
| POST | `/api/upload-graphic` | Upload custom graphic to Printify |
| POST | `/api/drop-signup` | Save email |

---

## File structure
```
cungus/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── railway.toml
│   ├── .env.example
│   └── .gitignore
├── frontend/
│   └── index.html
├── .gitignore
└── README.md
```
