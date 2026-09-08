# DU Verify

DU Verify is a payment-receipt verification platform for Ethiopian merchants.
It combines receipt OCR, direct provider confirmation, merchant receiving-account
matching, staff access, billing, and a developer API in one MERN application.

## Live Services

| Surface | URL | Purpose |
| --- | --- | --- |
| Merchant and staff app | <https://duverifay.vercel.app> | Registration, owner dashboard, staff receipt verification |
| Developer portal | <https://developer-duverifay.vercel.app> | Developer registration, API keys, balance, usage, top-up, documentation |
| Backend API | <https://du-verify-api.onrender.com/api> | Shared API for both frontends |
| Health check | <https://du-verify-api.onrender.com/api/health> | Render and monitoring probe |

The two Vercel projects intentionally use one frontend codebase with different
`VITE_APP_SURFACE` build values. They share the same Render API and MongoDB data.

## What Is Implemented

### Merchant And Staff Journey

- Email/password registration with OTP verification.
- Google sign-in and profile completion for merchant and developer surfaces.
- Owner, staff, platform-admin, and developer access controls.
- Owners can choose solo mode or team mode, configure receiving accounts, add or
  disable staff, review verification activity, and manage DU PT.
- Staff sign in using their phone and password. Ethiopian forms such as
  `09XXXXXXXX`, `2519XXXXXXXX`, and `+2519XXXXXXXX` resolve to the same account.
- Staff can use the live browser camera, the device camera, or browse for an image
  on mobile and desktop.
- Receipt OCR uses Gemini, then the server checks the relevant provider and
  compares the confirmed receiver against the merchant's configured accounts.
- Cross-provider transfers are supported by matching the confirmed receiving
  account independently of the receipt's sending provider, for example Telebirr
  to Awash or Awash to CBE.

### Verification Results

The UI uses one outcome treatment, without an extra status badge:

| Color | Result | Meaning |
| --- | --- | --- |
| Green | `VALID` | The receipt was found and its receiver/expected details passed verification. |
| Red | `NOT_VERIFIED` | The provider answered, but no matching receipt was confirmed. |
| Red | `ALREADY_USED` | The same receipt/reference was submitted previously. |
| Yellow | `AMOUNT_MISMATCH` | The confirmed amount differs from the expected amount. |
| Yellow | `RECEIVER_MISMATCH` | The payment is real but the receiver does not match the merchant. |
| Black | `OCR_FAILED`, `PROVIDER_ERROR`, `PROVIDER_UNAVAILABLE`, `INVALID_FORMAT`, `SITE_ERROR` | The check could not be completed; retry or enter the reference manually. |

CBE has an additional safety rule: USSD screenshots and old reference-only
receipts are not accepted. A CBE mobile-banking receipt must provide the complete
official receipt link, normally through its QR code.

### Billing And Communication

- DU PT is charged by completed verification usage.
- Provider outages and unavailable checks are not charged or are refunded.
- Chapa top-ups are verified server-side and credited idempotently.
- Manual transfer top-ups can be reviewed by platform administrators.
- OTP and purchase-receipt email use Brevo HTTPS and SMTP as fallbacks for one
  another, depending on which transport is available.
- Low-balance warnings are visible to owners and staff.

### Developer API

- Developers register on the dedicated developer portal, not in platform admin.
- Keys are shown once, hashed at rest, revocable, and expire according to platform
  policy.
- Each request uses `Authorization: Bearer <api-key>` and a unique
  `Idempotency-Key`.
- Receiver account number, receiver name, and expected amount are optional.
- When receiver expectations are supplied, the response returns the verification
  outcome/badge without exposing the full receipt. Without them, the full
  confirmed receipt details are returned.
- Developer balances, usage, request history, top-ups, and manual admin credits
  use the same shared backend.
- Platform admin can enable/suspend developer accounts, manage keys and balance,
  inspect usage, and configure developer API policy.

See [DEVELOPER_API.md](./DEVELOPER_API.md) for request and response examples.

### Platform Administration

- Platform totals and monochrome operational charts.
- Searchable business and developer account management.
- Manual DU PT credit/debit with an audit reason.
- Business and developer suspension/reactivation.
- Payment-review controls for unconfirmed top-ups.
- Provider configuration and operational status visibility.
- Announcement management and platform content controls.

## Staff PWA

Only authenticated staff are offered the installable PWA. The merchant dashboard,
platform admin, and developer portal are not advertised as standalone apps.

- App name: `DU Verify Staff`
- Start page: `/verify`
- Desktop/Android: use the **Install staff app** action when the browser offers it.
- iPhone/iPad: open the staff verification page in Safari, tap **Share**, then
  **Add to Home Screen**.
- The PWA caches only the frontend shell and static assets.
- API calls, receipts, OCR results, and payment account data are never written to
  the service-worker cache.
- A network connection is still required to authenticate and verify a payment.

Relevant files:

```text
client/public/staff-manifest.webmanifest
client/public/staff-sw.js
client/src/components/StaffPwaRegistration.jsx
client/src/components/InstallStaffApp.jsx
```

## Architecture

```text
Merchant/staff Vercel app ----\
                               >---- Render Express API ---- MongoDB Atlas
Developer Vercel app ---------/             |
                                             +-- Gemini OCR
                                             +-- Provider receipt endpoints
                                             +-- Chapa
                                             +-- Brevo / SMTP
```

```text
digital-verification-fixed_2/
  client/                    React 18, Vite, Tailwind, staff PWA
  server/                    Express 5, Mongoose, verification providers
  .github/workflows/         GitHub Actions CI/CD
  docker-compose.yml         Local full-stack containers
  Jenkinsfile                Jenkins CI/CD alternative
  render.yaml                Render backend blueprint
  DEVELOPER_API.md           Public API documentation
```

## Local Development

Requirements:

- Node.js 22.12 or newer (Node.js 24 recommended)
- npm
- MongoDB Atlas or a local MongoDB instance

### 1. Configure The Backend

```bash
cd server
cp .env.example .env
npm ci
npm run dev
```

The API defaults to <http://localhost:5000>.

### 2. Start The Merchant/Staff Frontend

```bash
cd client
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the local API. The API
client can fail over between the local API and configured remote endpoint for
network/server failures; normal `4xx` responses are not retried against another
backend.

### 3. Preview The Developer Surface

```bash
cd client
VITE_APP_SURFACE=developer npm run dev -- --port 5174
```

Open <http://localhost:5174/developers>.

## Environment Variables

Never commit `.env` files. Use the included `.env.example` files and configure
production secrets in Render/Vercel.

### Required Backend Values

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Use `production` in production. |
| `PORT` | API port; defaults to `5000`. |
| `MONGO_URI` | MongoDB connection string. |
| `JWT_SECRET` | Random signing secret of at least 32 characters. |
| `BASE_URL` | Public API origin, such as `https://du-verify-api.onrender.com`. |
| `FRONTEND_URL` | Primary merchant frontend origin. |
| `FRONTEND_URLS` | Comma-separated extra trusted origins, including developer frontend. |
| `GOOGLE_CLIENT_ID` | Google OAuth web-client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_CALLBACK_URL` | Primary callback ending in `/api/auth/google/callback`. |
| `GOOGLE_CALLBACK_URLS` | Optional extra callbacks, including localhost. |
| `GEMINI_API_KEY` | Gemini OCR access. |
| `BREVO_API_KEY` | HTTPS transactional email transport. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP fallback transport. |
| `EMAIL_FROM` | Sender name/address for OTPs and receipts. |

### Billing And Optional Backend Values

| Variable | Purpose |
| --- | --- |
| `CHAPA_SECRET_KEY` | Chapa checkout and verification. |
| `CHAPA_WEBHOOK_SECRET` | Verifies Chapa webhook signatures. |
| `CHAPA_MODE` | `test` or `live`. |
| `GEMINI_MODEL` | Optional Gemini model override. |
| `CBE_APP_ID`, `CBE_APP_VERSION` | Optional CBE token API overrides. |
| `PUPPETEER_EXECUTABLE_PATH` | Optional system Chromium path. |
| `DEVELOPER_TEST_MONGO_URI` | Isolated MongoDB URI for the developer integration suite. |

### Frontend Build Values

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Direct API fallback URL. Production normally uses same-origin Vercel rewrites first. |
| `VITE_APP_SURFACE` | `merchant` or `developer`. |
| `VITE_DEVELOPER_PORTAL_URL` | Public developer portal URL. |

Check production configuration before deployment:

```bash
cd server
npm run check:production
```

## Tests And Builds

```bash
cd server
npm test

cd ../client
npm test
npm run build
```

The backend suite covers Ethiopian phone normalization and receipt holder/account
matching, including cross-provider cases. The frontend check validates the PWA
manifest, icon inventory, start route, and API cache exclusion.

The isolated developer API integration test is intentionally separate because it
creates and drops a temporary database:

```bash
cd server
DEVELOPER_TEST_MONGO_URI='mongodb://...' node scripts/testDeveloperApi.js
```

Do not point that command at the production database.

## Docker

The repository contains production-style multi-container support:

- `server/Dockerfile`: non-root Node API with a health check.
- `client/Dockerfile`: Vite build served by Nginx with SPA routing and `/api`
  reverse proxy.
- `docker-compose.yml`: MongoDB, API, merchant/staff frontend, and developer
  frontend.

Create `server/.env`, then start the complete stack:

```bash
docker compose up --build
```

| Service | Local URL |
| --- | --- |
| Merchant/staff | <http://localhost:5173> |
| Developer portal | <http://localhost:5174/developers> |
| API | <http://localhost:5000/api> |
| API health | <http://localhost:5000/api/health> |

Stop it without deleting MongoDB data:

```bash
docker compose down
```

Delete local container data only when intentionally resetting the environment:

```bash
docker compose down --volumes
```

## CI/CD

### GitHub Actions

`.github/workflows/ci-cd.yml` runs on pull requests, pushes to `main`, and manual
dispatches. It performs:

1. Backend install, tests, and syntax checks.
2. Frontend install, PWA checks, and production build.
3. API, merchant, and developer Docker image builds.
4. Production deployment on successful `main` builds.

Vercel and Render can deploy directly from the connected GitHub `main` branch.
For explicit deployment from Actions, create these GitHub **production**
environment secrets using deploy-hook URLs from each provider:

```text
RENDER_DEPLOY_HOOK
VERCEL_MERCHANT_DEPLOY_HOOK
VERCEL_DEVELOPER_DEPLOY_HOOK
```

The workflow never stores those URLs in the repository. Missing hooks are safely
skipped so Git-connected deployments continue to work.

### Jenkins

`Jenkinsfile` provides the same install, test, build, container-validation, and
main-branch deployment stages. Create a Pipeline job from this repository and
provide deploy hooks as masked build parameters or through your Jenkins
credentials policy.

The Jenkins agent needs Node.js 22.12+, npm, Docker, and `curl`.

## Production Deployment

### Render API

`render.yaml` defines the Node service, health endpoint, root directory, and
required environment-variable placeholders. The live service currently uses the
free Render instance, so the first request after inactivity can be delayed while
the instance wakes up.

### Vercel Frontends

Use `client` as the root directory for both projects.

Merchant/staff project:

```text
VITE_APP_SURFACE=merchant
VITE_API_URL=https://du-verify-api.onrender.com
VITE_DEVELOPER_PORTAL_URL=https://developer-duverifay.vercel.app
```

Developer project:

```text
VITE_APP_SURFACE=developer
VITE_API_URL=https://du-verify-api.onrender.com
VITE_DEVELOPER_PORTAL_URL=https://developer-duverifay.vercel.app
```

`client/vercel.json` provides SPA rewrites, same-origin API proxying, camera
permissions, security headers, and correct no-cache handling for service-worker
updates.

## Google OAuth Checklist

The Google Cloud OAuth web client must contain the exact backend callback URL:

```text
https://du-verify-api.onrender.com/api/auth/google/callback
```

Keep both frontend origins in the OAuth consent-screen authorized domains and in
the backend `FRONTEND_URLS`. The backend carries the requested merchant/developer
surface through signed OAuth state so developer sign-up returns to the developer
portal instead of the merchant dashboard.

## Operational Notes

- Provider page structures can change. Monitor black provider-error outcomes and
  update the relevant adapter under `server/src/services/providers/` when needed.
- M-Pesa receipt lookup may reject non-Ethiopian/Kenyan server IP ranges.
- Render free instances sleep during inactivity and are not suitable for strict
  low-latency guarantees.
- Uploaded images are processed in memory and are not retained as a permanent
  dispute archive.
- Before live payments, set Chapa to live mode, register the HTTPS webhook, and
  test one real low-value top-up end to end.
- Rotate any secret that has ever been pasted into chat, logs, screenshots, or a
  committed file. Keep replacements only in provider secret stores and local
  ignored `.env` files.

## Major Work Completed

- Built merchant, staff, platform-admin, and developer experiences.
- Added dedicated developer frontend deployment with shared backend/API billing.
- Added direct receipt-provider verification, Gemini OCR, CBE QR/link rules, and
  cross-provider receiver matching.
- Added consistent green/red/yellow/black result states.
- Added camera capture and device upload support for mobile and desktop.
- Added Chapa top-ups, manual review, DU PT ledgering, refunds, low-balance alerts,
  and purchase receipts.
- Added Brevo/SMTP email failover.
- Added smooth Google OAuth routing for merchant and developer sign-up.
- Added Ethiopian phone normalization for staff and admin access.
- Refined responsive dashboards, dark-mode controls, and branded dropdowns.
- Added staff-only PWA support, Docker images, Docker Compose, GitHub Actions,
  Jenkins CI/CD, production checks, and consolidated documentation.
