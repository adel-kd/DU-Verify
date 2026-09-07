import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import BillingPanel from '../components/BillingPanel.jsx';

const button = 'rounded-xl bg-seal px-5 py-3 text-sm font-semibold text-black disabled:opacity-50';
const input = 'w-full rounded-xl border border-black/20 bg-white p-3 text-black';
export default function Developers() {
  const { user, updateWallet } = useAuth();
  const [config, setConfig] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [applicationName, setApplicationName] = useState('');
  const [name, setName] = useState('Production server');
  const [section, setSection] = useState(() => new URLSearchParams(window.location.search).has('topup') ? 'Top up' : 'Overview');
  async function load() {
    const { data: publicData } = await api.get('/developer/config');
    setConfig(publicData);
    if (user && user.role === 'owner' && user.isVerified && user.profileComplete !== false) {
      const result = await api.get('/developer/me');
      setData(result.data);
    }
  }
  useEffect(() => { if (user?.isVerified && user.profileComplete !== false) sessionStorage.removeItem('developer_signup'); load().catch(e => setError(e.response?.data?.error || 'Could not load developer portal. Please try again.')); }, [user?._id]);
  async function act(fn) {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e) { setError(e.response?.data?.error || 'Please try again.'); } finally { setBusy(false); }
  }
  const base = `${window.location.origin}/api/developer/v1`;
  return <div className="min-h-screen bg-[#f6f7f4] text-black">
    <TopBar />
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-black/15 pb-8">
        <div><p className="text-xs uppercase tracking-[0.2em] text-black/50">DU Verifay / Developers</p><h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Payment checks,<br />inside your product.</h1><p className="mt-4 max-w-xl text-black/60">Connect your server to Ethiopian receipt verification. Create a key, fund your wallet, and track every request.</p></div>
        <div className="rounded-2xl border border-black/15 bg-white p-6"><p className="text-sm text-black/50">Available balance</p><p className="mt-2 text-3xl font-semibold">{data?.balance ?? '--'} <span className="text-sm">DU PT</span></p><p className="mt-2 text-xs text-black/50">{config?.settings.cost ?? '--'} DU PT per completed lookup</p></div>
      </div>
      <nav className="my-6 flex gap-2 overflow-x-auto" aria-label="Developer portal">
        {['Overview', 'API keys', 'Usage', 'Top up', 'Documentation'].map(s => <button key={s} onClick={() => setSection(s)} className={`shrink-0 rounded-full border px-4 py-2 text-sm ${section === s ? 'border-black bg-black text-white' : 'border-black/15 bg-white'}`}>{s}</button>)}
      </nav>
      {error && <p role="alert" className="mb-5 rounded-xl bg-black p-4 text-white">{error}</p>}
      {!user && <div className="mb-6 rounded-2xl border border-black/15 bg-white p-6"><h2 className="text-xl font-semibold">Create your developer account</h2><p className="my-3 text-black/60">Sign up and verify your email, then register your application to generate a private API key.</p><Link onClick={() => sessionStorage.setItem('developer_signup', '1')} className={button} to="/login?mode=register">Sign up</Link> <Link onClick={() => sessionStorage.setItem('developer_signup', '1')} className="ml-3 underline" to="/login">Sign in</Link></div>}
      {user && (!user.isVerified || user.profileComplete === false) && <p className="mb-6">Complete signup and email verification in <Link className="underline" to="/dashboard">your account</Link> before creating keys.</p>}
      {data && !data.profile && <form className="mb-6 space-y-4 rounded-2xl border border-black/15 bg-white p-6" onSubmit={e => { e.preventDefault(); act(() => api.post('/developer/enroll', { applicationName })); }}><h2 className="text-xl font-semibold">Register your application</h2><label className="block">Application name<input required maxLength={100} className={`${input} mt-2`} value={applicationName} onChange={e => setApplicationName(e.target.value)} /></label><button className={button} disabled={busy || !config?.settings.signupEnabled}>Create developer profile</button></form>}
      {data?.profile && !data.profile.enabled && <p role="alert">API access is suspended. Contact platform support.</p>}
      {section === 'Overview' && <section className="grid gap-4 md:grid-cols-3">{[['01 / Create a key', 'Keys are private server credentials. Each expires after 90 days and can be revoked instantly.'], ['02 / Add DU PT', 'Use your existing wallet, top-up packages, or direct bank transfer when available.'], ['03 / Start verifying', 'Send a reference and an Idempotency-Key. Provider outages are not charged.']].map(([title, text]) => <article key={title} className="rounded-2xl border border-black/15 bg-white p-6"><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-black/60">{text}</p></article>)}</section>}
      {section === 'API keys' && data?.profile && <section className="space-y-5">
        <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); act(async () => { const r = await api.post('/developer/keys', { name }); setSecret(r.data.secret); }); }}><label className="grow">Key name<input className={input} required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><button className={button} disabled={busy || !data.profile.enabled}>Generate key</button></form>
        {secret && <div className="rounded-xl border border-black bg-white p-5"><p className="font-semibold">Save this key now. It will never be shown again.</p><code className="my-3 block break-all select-all">{secret}</code><button className="underline" onClick={() => setSecret('')}>I saved it, hide key</button></div>}
        {data.keys.map(k => <article key={k._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><strong>{k.name}</strong><p className="text-sm">{k.prefix}... / {k.revokedAt ? 'Revoked' : `Expires ${new Date(k.expiresAt).toLocaleDateString()}`}</p></div>{!k.revokedAt && <button disabled={busy} className="underline" onClick={() => { if (window.confirm(`Revoke ${k.name}? Integrations using it will stop.`)) act(() => api.delete(`/developer/keys/${k._id}`)); }}>Revoke</button>}</article>)}
      </section>}
      {section === 'Usage' && data && <section className="space-y-3"><button className="underline" onClick={() => act(async () => {})}>Refresh usage</button><p className="text-sm text-black/50">Latest 50 requests. Charges also appear in your wallet ledger.</p>{data.requests.length === 0 && <p>No API calls yet.</p>}{data.requests.map(r => <div key={r._id} className="rounded-xl border bg-white p-4"><p className="font-semibold">{r.provider} / {r.state} / {r.charged} DU PT</p><p className="break-all text-xs text-black/50">{r._id} / {new Date(r.createdAt).toLocaleString()} / HTTP {r.httpStatus || 'pending'}</p></div>)}</section>}
      {section === 'Top up' && data?.profile && <BillingPanel duptBalance={data.balance} onBalanceChange={balance => { setData(d => ({ ...d, balance })); updateWallet(balance); }} showLedger />}
      {section === 'Documentation' && <article className="space-y-6 rounded-2xl border border-black/15 bg-white p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Verification API v1</h2><p>Base URL: <code className="break-all">{base}</code></p>
        <p>Use HTTPS from your backend. Never include API keys in browser JavaScript, mobile applications, public repositories, or URL parameters. Keys are displayed once, stored as hashes, expire after 90 days, and can be revoked in API keys. Create a replacement before revoking an old key.</p>
        <h3 className="font-semibold">POST /verify</h3><p>Send JSON containing <code>provider</code> and <code>reference</code>. Supported providers: {config?.providers.join(', ') || 'loading...'}. This version accepts transaction references and supported receipt links; image OCR uploads are not part of this endpoint.</p>
        <pre className="overflow-x-auto rounded-xl bg-[#151515] p-5 text-sm text-white">{`curl -X POST '${base}/verify' \\\n  -H "Authorization: Bearer $DU_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: order_12345_attempt_1' \\\n  -d '{"provider":"CBE","reference":"FT1234567890","accountSuffix":"12345678"}'`}</pre>
        <p><code>accountSuffix</code>: required for legacy CBE FT references (last 8 digits of the receiving account) and Abyssinia lookups (last 5). <code>phoneNumber</code>: required for CBE Birr. CBE receipt links can be used as the reference. For Dashen use the Transaction Reference, not the Transfer Reference.</p>
        <h3 className="font-semibold">Responses and payment acceptance</h3><pre className="overflow-x-auto rounded-xl bg-[#151515] p-5 text-sm text-white">{JSON.stringify({ requestId: '...', status: 'VALID', charged: 1, currency: 'DU_PT', provider: 'CBE', reference: '...', receipt: { success: true } }, null, 2)}</pre>
        <p><code>VALID</code> means the provider confirmed a transaction. Your integration must compare its amount and receiver with your order and prevent reuse of a transaction across orders. The <code>receipt</code> object contains provider-specific fields; field names vary by bank. Missing required payment details must go to manual review.</p>
        <p><code>NOT_VERIFIED</code> means the provider did not confirm the payment. <code>PROVIDER_UNAVAILABLE</code> or other provider errors mean please try again, not that the payment is invalid. Do not fulfill an order on these responses.</p>
        <h3 className="font-semibold">Billing, retries, and limits</h3><p>Completed VALID and NOT_VERIFIED lookups cost {config?.settings.cost ?? 1} DU PT. Validation, authentication, rate-limit, and provider failures are not charged. Balance and request completion are recorded together. Changing the reference or requesting a fresh lookup with a new Idempotency-Key is a new potentially billable call.</p>
        <p>Every POST requires a unique <code>Idempotency-Key</code> (8-100 letters, numbers, underscores or hyphens). Retry network failures with the same key and identical body to retrieve the stored result without another charge. Pending requests return 409. Reusing a key with different input returns 409. After a completed provider failure, use a new key to try the provider again. If a request stays pending for more than 15 minutes, contact support with its key and request time.</p>
        <p>Current limit: {config?.settings.requestsPerMinute ?? '--'} verification requests per minute across all your API keys. HTTP 429 includes Retry-After. HTTP 400: invalid input; 401: invalid key; 403: access disabled; 402: top up required; 409: duplicate/conflicting/pending request; 503: API paused or provider unavailable; 500: unexpected error, retry with the same key.</p>
        <h3 className="font-semibold">GET /balance</h3><p>Send the same Authorization header. Returns <code>balance</code>, <code>currency</code>, and <code>costPerCall</code>. Balance checks are free. Your wallet is shared with your normal DU Verifay account.</p>
        <p>Begin with a real receipt you control. Verification can consume DU PT; no sandbox key is offered in this version. Timeouts and free-hosting cold starts can delay responses, so preserve idempotency keys across retries.</p>
      </article>}
    </main>
  </div>;
}
