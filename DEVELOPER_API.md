# DU Verifay developer portal

Portal: https://duverifay.vercel.app/developers

API base: https://duverifay.vercel.app/api/developer/v1

The portal's Documentation tab contains the integration guide and curl example.
No separate hosting subscription or custom domain is required. The existing
Vercel frontend proxies requests to the existing Render backend.

## Developer workflow

1. Open the portal and sign up, or sign in with an existing owner account.
2. Verify the email address and complete the account profile.
3. Register an application name to create a developer profile.
4. Generate a key in API keys. Save it in the integrating server's secret store.
   Only its SHA-256 hash is stored. The secret is returned once and expires in
   90 days. Generate a replacement before revoking the old key.
5. Top up the shared DU PT wallet using the existing payment methods.
6. POST JSON to /verify using Authorization: Bearer and Idempotency-Key headers.
7. Check Usage and the wallet ledger for charges.

## API contract

POST /verify accepts `provider`, `reference`, and the merchant's optional
`expectedAmount`, `receiverAccountNumber`, and `receiverAccountHolderName`.
This endpoint supports reference/link lookups, not receipt image uploads.
Provider names: CBE, Telebirr, Dashen, Abyssinia, CBEBirr, MPesa, Awash.
`phoneNumber` is required for CBE Birr. Abyssinia uses the last five digits of
`receiverAccountNumber`. CBE accepts only the complete official
`https://mbreciept.cbe.com.et/<token>` mobile-banking receipt link: old FT
references, USSD screenshots, and raw tokens are intentionally rejected.

When merchant matching fields are sent, the response returns a compact
`verification` object with the status badge: green `VALID`, yellow
`AMOUNT_MISMATCH`/`RECEIVER_MISMATCH`, red `NOT_VERIFIED`/`ALREADY_USED`, and
black provider or OCR errors. This is the safe default for a checkout. Set
`returnDetails: true` to include the provider receipt object for a manual
review workflow. If no matching fields are sent, receipt details are returned
so the merchant can perform their own comparison.

`VALID` means the provider found the receipt and every supplied merchant check
matched. `NOT_VERIFIED` means the provider responded but did not find the
receipt. Provider outages are not payment-rejection evidence. A confirmed
receipt is blocked from reuse within the same developer account.

VALID and NOT_VERIFIED responses are billable. Provider errors, invalid input,
authentication errors, and rate-limit rejections are not charged. GET /balance
returns balance, currency (DU_PT), and costPerCall at no charge.

Idempotency-Key must contain 8-100 letters, digits, underscores or hyphens.
Keys are scoped to the developer account, across all their API keys. Replaying
an identical completed request returns the saved response without charging again.
A different payload or a still-pending request returns HTTP 409. After a completed
provider failure, use a new idempotency key to run a fresh lookup.

HTTP codes: 400 input, 401 API key, 402 balance, 403 access, 409 conflict/pending,
429 rate limit (Retry-After: 60), 503 provider/API unavailable, 500 internal error.
Retry ambiguous network/500 failures with the SAME idempotency key.

## Platform administration

Open Platform admin > Developers to:

- Enable/pause the API and developer enrollment independently.
- Set integer DU PT cost per completed lookup (1-1000).
- Set per-account verification requests per minute (1-120) and active key limit
  (1-10). Start conservatively on free hosting.
- Search by application name, suspend/reactivate an account's API access,
  revoke all its keys, and view its latest 100 requests.
- Credit/debit the shared wallet with a mandatory audit reason.
- Resolve an interrupted pending request older than 15 minutes without charging.
  Tell the developer to retry using a NEW idempotency key afterward.

Bank availability, packages, payment methods and rates remain in existing
Platform Settings. All developer wallet adjustments and administrative actions
are recorded in the existing ledger/audit collections.

## Operations

MongoDB replica-set transactions are required (Atlas supports these). Request
completion, conditional wallet debit, and ledger insertion commit together.
No charge is applied before a provider result is available. An interrupted
provider request can remain pending; the admin resolution above is safe because
it cannot race a successful charge without a transaction conflict.

API keys never grant wallet top-up/admin permissions. Management uses existing
JWT account authentication. Provider-specific URLs are validated on input.
There is no separate paid OCR dependency for this reference-based endpoint.

Free Render can sleep and timeout; this release does not guarantee high-volume
capacity. Use actual request metrics before raising limits. MongoDB request
history grows over time; do not delete idempotency records casually because
deleting them removes replay protection.

## Verification

Run `npm run build` in client. Run `node scripts/testDeveloperApi.js` in server
with DEVELOPER_TEST_MONGO_URI set to a replica-set connection string. The runner
creates a randomly named isolated database, mocks all bank calls, tests real
HTTP/auth/database transactions, and drops only that test database afterward.
No existing application accounts or wallet balances are touched by this runner.
