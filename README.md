# Digital Verification

Payment receipt verification for Ethiopian merchants — cafés, retail counters,
hotels, and supermarkets. Owners register a business, delegate verification
to staff, and every check scans a screenshot with Gemini Vision OCR, then
confirms the transaction by querying the relevant bank/telecom's own public
receipt-lookup endpoint directly (CBE, Telebirr, Dashen, Bank of Abyssinia,
CBE Birr, M-Pesa) — no third-party verification API is involved.

Full MERN stack: **M**ongoDB, **E**xpress, **R**eact (Vite), **N**ode.


## Project layout

```
digital-verification/
  server/   Express + MongoDB API (auth, staff, verification, billing)
  client/   React (Vite) frontend — staff verification screen + owner dashboard
```

## Setup

**1. Backend**

```bash
cd server
cp .env.example .env
# edit .env: MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run dev        # runs on http://localhost:4000
```

**2. Frontend**

```bash
cd client
npm install
npm run dev         # runs on http://localhost:5173, proxies /api to :4000
```

Open `http://localhost:5173`. Register a business (owner account, 10 ETB
free credit), then either verify directly or add a staff login from the
dashboard.

For production, run `npm run build` in `client/` and serve the resulting
`dist/` folder from any static host (or from Express itself, if you'd
rather keep everything on one origin — happy to wire that up on request).

## What's implemented

- **Auth** — owner registration, owner/staff login (JWT + bcrypt), RBAC via
  `role: owner | staff`.
- **Staff management** — owners create/list/disable cashier logins scoped to
  their business.
- **Verification engine** (`POST /api/verify`, multipart image upload):
  1. Zero-balance guard (HTTP 402 if wallet < 2 ETB).
  2. Gemini Vision OCR extracts the reference, amount, and sender name from
     the screenshot — works for both USSD text screens and mobile-app
     confirmation screens, since the prompt asks for the same fields
     regardless of layout.
  3. Duplicate check against MongoDB (`transactionRef` is indexed).
  4. Live confirmation by scraping the bank/telecom's own public receipt
     endpoint directly (`server/src/services/providers/`) — routed to the
     correct provider by `bankName`. CBE and Bank of Abyssinia additionally
     use the business's own saved receiving-account suffix (set once in
     Settings); CBE Birr additionally needs the payer's phone number. For
     CBE specifically, a QR code on the receipt image (the newer template's
     verification mechanism) is decoded and tried first — it needs no
     account suffix and can't be misread the way OCR text can — falling
     back to the OCR-read FT-reference + suffix method if no QR is found or
     it doesn't resolve.
  5. Every attempt is logged as `VALID`, `ALREADY_USED`, `OCR_FAILED`,
     `AMOUNT_MISMATCH`, or `PROVIDER_ERROR`.
- **Billing** — wallet balance/usage stats, and a real Chapa top-up flow:
  `POST /api/billing/topup` initiates a Chapa checkout, and both Chapa's
  server-to-server webhook (`POST /api/billing/webhook`, HMAC-verified) and
  the browser return callback (`GET /api/billing/verify-chapa/:tx_ref`)
  independently re-verify the transaction against Chapa's own API before
  crediting — idempotently, so a retried webhook can never double-credit.
  See `server/src/routes/billing.js`.
- **Low-balance alerts** — when a business's wallet drops below its
  configurable threshold (`lowBalanceThreshold`, default 20 ETB), an
  in-app banner appears on both the owner dashboard (with a one-click
  top-up shortcut) and the staff verification screen.
- **Super admin panel** (`role: admin`, `/admin` in the client) — DU-side
  oversight across every business: platform-wide totals, a searchable
  business table with balance/status/usage, and manual overrides (credit
  or debit a wallet with a logged reason, suspend/reactivate a business,
  override a single verification's status). All manual actions are
  recorded in an audit log (`AdminAction` model) visible per-business in
  the admin UI. There is no public admin-signup route — create the first
  admin with `node server/scripts/createAdmin.js "Name" email phone
  password`, run directly on the server.
- **Frontend** — a mobile-first staff verification screen, a desktop owner
  dashboard (stats, filterable log table, staff management), a settings
  page, and the admin panel above, built with React + Tailwind. Every
  confirmed check renders a stamped "seal" graphic — the app's signature
  visual, echoing the bank/notary stamps merchants already trust.

## Things to wire up before production use

- **Image storage** — uploaded screenshots are OCR'd in memory and
  discarded (`screenshotUrl` is a placeholder). Add Cloudinary or similar
  if you need to retain images for dispute resolution.
- **Chapa webhook URL** — set `BASE_URL` to your real public backend URL in
  production, and register that same `/api/billing/webhook` URL (plus
  `CHAPA_WEBHOOK_SECRET`) in your Chapa dashboard's Webhooks tab so top-ups
  get credited even if a customer closes the tab before the browser
  redirect fires.
- **Awash & Coopbank** — neither publishes a public receipt-lookup endpoint
  the way CBE/Telebirr/Dashen/Abyssinia/CBE Birr/M-Pesa do, so these two
  currently return an "unsupported, verify manually" result rather than a
  real check.
- **M-Pesa (Safaricom Ethiopia) geo-restriction** — their receipt endpoint
  only accepts requests from Ethiopia/Kenya IP ranges. If this server is
  hosted elsewhere, M-Pesa verification will typically fail with a
  connection/timeout error — that's a hosting limitation, not a bug. Host
  this server (or at least outbound traffic for that one call) from within
  Ethiopia/Kenya if you need M-Pesa support to work reliably.
- **CBE legacy PDF slips without Puppeteer** — the direct PDF fetch covers
  the common case; the original reference implementation falls back to a
  headless-browser fetch when the direct request is blocked, which this
  version intentionally omits to avoid a heavy Chromium dependency. The
  QR-based new mechanism (tried first) sidesteps this for receipts that
  have a QR code at all. If you see CBE legacy verifications failing where
  a direct browser visit to the same URL succeeds, that fallback is the
  reason — worth adding Puppeteer back in if it becomes a common case.
- **Not live-tested against the real bank endpoints** — the scraping logic
  (regex/HTML-structure based, ported from the open-source reference project
  at github.com/Vixen878/verifier-api) was validated against synthetic HTML
  samples and a real generated QR code, but this sandbox's network egress
  doesn't allow reaching the actual bank/telecom domains, so it hasn't been
  exercised against a real live bank response yet. Test each provider
  against a real receipt after deploying, since bank page markup can and
  does drift over time.
- **Rate limiting** would be worth adding on both `/api/verify` (each call
  hits a third-party bank system) and `/api/auth/login` (brute-force
  protection).
- **HTTPS/CORS** — `cors()` currently allows any origin; lock
  `FRONTEND_URL` down as an explicit allowed origin before going live, and
  make sure both `client` and `server` are served over HTTPS (Chapa
  requires HTTPS callback/webhook URLs in live mode).
- **First admin account** — run `node server/scripts/createAdmin.js "Name"
  email phone password` on the server once deployed; there's intentionally
  no public signup path for `role: admin`.
# DU-Verify
