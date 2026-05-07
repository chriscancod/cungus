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
PRINTIFY_API_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIzN2Q0YmQzMDM1ZmUxMWU5YTgwM2FiN2VlYjNjY2M5NyIsImp0aSI6ImIzZGFlZjQ2YTBlYjY3Y2U5ZmM1YWM4YzAzMzAxZWRlMjUxZjZkNjA2MjM3NzRjNDM1Nzg0MTc5NGFmYjQwMWUyYTg5YjVkMTUzMjM4NDZjIiwiaWF0IjoxNzc4MTkyMzcyLjI2MjU0LCJuYmYiOjE3NzgxOTIzNzIuMjYyNTQzLCJleHAiOjE4MDk3MjgzNzIuMjU3NzYyLCJzdWIiOiI3MzUwNjMzIiwic2NvcGVzIjpbImNhdGFsb2cucmVhZCIsIm9yZGVycy5yZWFkIiwib3JkZXJzLndyaXRlIiwicHJvZHVjdHMucmVhZCIsInByb2R1Y3RzLndyaXRlIiwid2ViaG9va3MucmVhZCIsIndlYmhvb2tzLndyaXRlIiwidXBsb2Fkcy5yZWFkIiwidXBsb2Fkcy53cml0ZSIsInByaW50X3Byb3ZpZGVycy5yZWFkIl19.Emg8QdgmgD4f1te4GdUusCECmS1WpwUhTTH7rrD-4iBIQfmn70TfnNMh79XsiFyD6ynx1StPUq6GIvG0V1CnEFdf5C2ZzKFk46pKFLRtxCtNayaI3fR7pp3bEr_0cW2gtQah_ubnKXCMDxhPe0N9DvkwE0Mw40M7G3H5gBy6MVn1-BXls5sb65m4fD3MukBpOl6WrluxgxwKcyiTODOvw0oHd807Yo2yt-9vWcWJxMa5zUZKssIe-0iJub_Ps99jyfEAYXFIHS3lPjHSxv-1qziyWWX0GvBsJcpLtIM8K2XqclKnF_bSlHrbF1ybJPCWDrl3c93O1LBNbM-jpH6Ye7WLUmKmz_T_XB8wqTEE7kCJ1Snq2kZor4zN8ma0w-zrcZRd9lu4OfMwPMxK7QifkdylVj2ynASQaPBGhYH7CNgdPwI3yNua82T1snXU14f9dGHVIAWUX_-dDlu7sI9Eo0BS02d8ui2NQonvpNEhpXQ81exfe-uVB5YyKgosvPr8Wortj9NxJjN_JfXei8xFUFmheznicD8-DMIzjtW0bK6Ia5w7HwCz-fXYNpG22FH46UytCVYz5IoG3_fjOK-a9QUxUjm6HhAt9k1zG2LZYc5HGxf9gRac1omk-ELLCbdBZ1orIVW_s4N7O0X7MB-mBBS3d9XEUuaAzPe1aQKRNQA
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
