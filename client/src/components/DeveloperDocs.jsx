import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

function CodeBoard({ label, code }) {
  const [copied, setCopied] = useState(false);

  function copyWithTextarea() {
    const textArea = document.createElement('textarea');
    textArea.value = code;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copiedSuccessfully = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (!copiedSuccessfully) throw new Error('Clipboard unavailable');
  }

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        copyWithTextarea();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      try {
        copyWithTextarea();
        setCopied(true);
        window.setTimeout(() => setCopied(false), 3000);
      } catch {
        setCopied(false);
      }
    }
  }

  return <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#111513] shadow-[0_18px_44px_-30px_rgba(0,0,0,0.8)]">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</span>
      <button type="button" onClick={copyCode} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.12]" aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} className="text-seal" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <pre className="max-h-[32rem] overflow-auto p-5 font-mono text-[13px] leading-6 text-[#e8eee9]"><code>{code}</code></pre>
  </div>;
}

const statusRows = [
  ['bg-seal', 'Green', 'VALID', 'Receipt found and every merchant check you supplied passed. Safe to fulfill.'],
  ['bg-[#e4b83f]', 'Yellow', 'AMOUNT_MISMATCH / RECEIVER_MISMATCH', 'The receipt exists, but its amount differs or neither supplied receiver field matches.'],
  ['bg-alarm', 'Red', 'NOT_VERIFIED / ALREADY_USED', 'The provider did not confirm the receipt, or this receipt was used before. Do not fulfill.'],
  ['bg-black', 'Black', 'PROVIDER_UNAVAILABLE / OCR_FAILED / SITE_ERROR', 'A technical check failed. Show Please try again and offer manual reference entry when relevant.'],
];

export default function DeveloperDocs({ base, config }) {
  const requestFields = [
    ['provider', 'string', 'Required', `The provider that issued the receipt. It may differ from the receiving bank. One of: ${config?.providers.join(', ') || 'supported provider list'}.`],
    ['reference', 'string', 'Required', "Transaction reference or the provider's supported official receipt link."],
    ['expectedAmount', 'number', 'Optional', 'Expected ETB amount. A difference above 0.01 returns AMOUNT_MISMATCH.'],
    ['receiverAccountNumber', 'string', 'Optional', 'Expected receiving account. Spaces and separators are normalized.'],
    ['receiverAccountHolderName', 'string', 'Optional', 'Expected account-holder name. Case and repeated spaces are normalized.'],
    ['phoneNumber', 'string', 'CBE Birr', 'Payer phone number; required only for CBE Birr.'],
    ['returnDetails', 'boolean', 'Optional', 'Set true to include provider receipt data. Defaults to false.'],
  ];
  const curlExample = `curl -X POST '${base}/verify' \\
  -H "Authorization: Bearer $DU_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: order_12345_attempt_1' \\
  -d '{
    "provider": "CBE",
    "reference": "https://mbreciept.cbe.com.et/v2-example-token",
    "expectedAmount": 250,
    "receiverAccountNumber": "100012345678",
    "receiverAccountHolderName": "DU Verifay"
  }'`;
  const verifiedResponse = JSON.stringify({
    requestId: '68c...',
    status: 'VALID',
    charged: 1,
    currency: 'DU_PT',
    provider: 'CBE',
    verification: {
      badge: 'green',
      receiptFound: true,
      amountMatched: true,
      receiverAccountMatched: true,
      receiverAccountHolderMatched: true,
      receiverMatched: true,
      duplicate: false,
      merchantChecksProvided: true,
    },
    message: 'Verified. The receipt was found and matched the merchant checks provided.',
  }, null, 2);
  const detailsExample = JSON.stringify({
    provider: 'Telebirr',
    reference: 'REFERENCE_FROM_RECEIPT',
    returnDetails: true,
  }, null, 2);
  const balanceExample = `curl '${base}/balance' \\
  -H "Authorization: Bearer $DU_API_KEY"`;
  const nodeExample = `import crypto from 'node:crypto';

// Save idempotencyKey with your own order/payment record.
// Call without one for a new lookup; pass the saved one to retry it.
export async function verifyPayment(payment, idempotencyKey = crypto.randomUUID()) {
  const response = await fetch('${base}/verify', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.DU_API_KEY}\`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payment),
  });

  return { idempotencyKey, result: await response.json() };
}

// New customer payment: a new UUID is created automatically.
const firstAttempt = await verifyPayment(payment);
await savePayment({ ...payment, idempotencyKey: firstAttempt.idempotencyKey });

// Timeout or network error: retry with the SAME saved key.
const retry = await verifyPayment(payment, savedPayment.idempotencyKey);`;

  return <article className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_28px_80px_-54px_rgba(16,25,20,0.55)]">
    <header className="border-b border-black/10 bg-[#eef2ec] px-6 py-8 sm:px-9 sm:py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/45">API reference / v1</p>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">From receipt to a safe decision.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Send the payment reference with your expected amount and receiver. DU Verifay confirms the receipt with its issuing provider, then checks the destination independently, including cross-provider transfers.</p>
      <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 font-mono text-xs">
        <span className="h-2 w-2 shrink-0 rounded-full bg-seal" />
        <span className="truncate">{base}</span>
      </div>
    </header>

    <div className="space-y-12 px-6 py-8 sm:px-9 sm:py-10">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">01 / Authentication</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Keep your API key on the server</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">Use HTTPS from your backend. Never put a DU API key in browser JavaScript, a mobile app, a public repository, or a URL. Keys are displayed once, stored as hashes, expire after 90 days, and can be revoked from the API keys tab.</p>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">02 / Verification</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">POST /verify</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">Send JSON with a unique order-based Idempotency-Key. If you supply both receiver account and holder name, a match on either one is enough. Receipt image uploads and OCR belong to the merchant app, not this server API.</p>
        </div>
        <CodeBoard label="cURL / verification request" code={curlExample} />
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">Idempotency / Node.js</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">Generate it for them</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">Use this server-side helper in your integration. It makes a new key for a new payment and returns it so you can save it with your order. On a retry, pass the saved key back in unchanged.</p>
        </div>
        <CodeBoard label="Node.js / safe verification helper" code={nodeExample} />
      </section>

      <section>
        <h3 className="font-display text-xl font-semibold">Request fields</h3>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-black/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f4f6f2] text-[11px] uppercase tracking-[0.12em] text-black/45">
              <tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Use</th><th className="px-4 py-3">Meaning</th></tr>
            </thead>
            <tbody>{requestFields.map(([field, type, use, meaning]) => <tr key={field} className="border-t border-black/[0.07]"><td className="px-4 py-4 font-mono text-xs font-semibold">{field}</td><td className="px-4 py-4 text-black/50">{type}</td><td className="px-4 py-4 font-medium">{use}</td><td className="px-4 py-4 leading-5 text-black/60">{meaning}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">03 / Decision</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">Use one clear outcome</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">Green is returned only when the receipt was found and every merchant check you supplied passed. Use the returned badge color and message as the single result in your interface.</p>
        </div>
        <CodeBoard label="JSON / verified response" code={verifiedResponse} />
        <div className="grid gap-3 sm:grid-cols-2">{statusRows.map(([color, name, status, meaning]) => <div key={name} className="rounded-2xl border border-black/10 p-5"><div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${color}`} /><strong>{name}</strong></div><code className="mt-3 block text-xs font-semibold">{status}</code><p className="mt-2 text-sm leading-6 text-black/60">{meaning}</p></div>)}</div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-[#f4f6f2] p-6"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">Privacy default</p><h3 className="mt-2 text-lg font-semibold">Badge only with merchant checks</h3><p className="mt-3 text-sm leading-6 text-black/60">When receiver or amount fields are supplied, raw provider data is hidden by default. Your checkout receives only the decision it needs.</p></div>
        <div className="rounded-2xl border border-black/10 bg-[#f4f6f2] p-6"><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">Manual review</p><h3 className="mt-2 text-lg font-semibold">Request complete details when needed</h3><p className="mt-3 text-sm leading-6 text-black/60">Set <code>returnDetails: true</code> to include the provider receipt object. If no merchant checks are supplied, details return automatically and no green merchant-match badge is claimed.</p></div>
      </section>
      <CodeBoard label="JSON / request complete details" code={detailsExample} />

      <section className="rounded-2xl bg-black p-6 text-white sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">CBE requirement</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Use the complete mobile-banking receipt link</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">CBE accepts only <code className="text-white">https://mbreciept.cbe.com.et/&lt;token&gt;</code>. Old FT references, raw tokens, USSD screenshots, and screenshots without a readable official receipt QR are rejected.</p>
      </section>

      <section className="space-y-5">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">04 / Wallet</p><h3 className="mt-2 font-display text-2xl font-semibold">GET /balance</h3><p className="mt-3 text-sm leading-6 text-black/60">Balance checks are free. The wallet is shared with your normal DU Verifay owner account.</p></div>
        <CodeBoard label="cURL / wallet balance" code={balanceExample} />
      </section>

      <section className="grid gap-7 border-t border-black/10 pt-10 md:grid-cols-2">
        <div><h3 className="font-semibold">Billing and duplicates</h3><p className="mt-3 text-sm leading-6 text-black/60">Completed provider answers cost {config?.settings.cost ?? 1} DU PT. Validation, authentication, rate-limit, and provider failures are free. A previously confirmed reference returns <code>ALREADY_USED</code> without another charge.</p></div>
        <div><h3 className="font-semibold">Retries and limits</h3><p className="mt-3 text-sm leading-6 text-black/60">Retry an interrupted request with the same Idempotency-Key and identical body. Use a new key only for a fresh lookup. Current limit: {config?.settings.requestsPerMinute ?? '--'} requests per minute. HTTP 429 includes Retry-After.</p></div>
        <div><h3 className="font-semibold">Receiver matching</h3><p className="mt-3 text-sm leading-6 text-black/60">Account number OR holder name is sufficient. Full account numbers match exactly; masked receipt accounts such as <code>1****9571</code> match on the visible final four digits. Holder names ignore case and spacing, tolerate common OCR errors, and accept first-and-last names when the confirmed receipt contains a longer full name.</p></div>
        <div><h3 className="font-semibold">Provider notes</h3><p className="mt-3 text-sm leading-6 text-black/60">CBE Birr requires <code>phoneNumber</code>. Abyssinia requires <code>receiverAccountNumber</code> for its last-five-digit check. For Dashen, send the Transaction Reference, not the Transfer Reference.</p></div>
        <div><h3 className="font-semibold">HTTP responses</h3><p className="mt-3 text-sm leading-6 text-black/60">400 invalid input, 401 invalid key, 402 top-up required, 403 disabled access, 409 idempotency conflict, 429 rate limit, 503 unavailable service, and 500 unexpected error.</p></div>
      </section>
    </div>
  </article>;
}
