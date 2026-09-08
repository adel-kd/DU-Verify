import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import TopBar from '../components/TopBar.jsx';
import BillingPanel from '../components/BillingPanel.jsx';
import DeveloperDocs from '../components/DeveloperDocs.jsx';

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

  useEffect(() => {
    if (user?.isVerified && user.profileComplete !== false) sessionStorage.removeItem('developer_signup');
    load().catch(error => setError(error.response?.data?.error || 'Could not load developer portal. Please try again.'));
  }, [user?._id]);

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (error) {
      setError(error.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(false);
    }
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
        {['Overview', 'API keys', 'Usage', 'Top up', 'Documentation'].map(sectionName => <button key={sectionName} onClick={() => setSection(sectionName)} className={`shrink-0 rounded-full border px-4 py-2 text-sm ${section === sectionName ? 'border-black bg-black text-white' : 'border-black/15 bg-white'}`}>{sectionName}</button>)}
      </nav>

      {error && <p role="alert" className="mb-5 rounded-xl bg-black p-4 text-white">{error}</p>}
      {!user && <div className="mb-6 rounded-2xl border border-black/15 bg-white p-6"><h2 className="text-xl font-semibold">Create your developer account</h2><p className="my-3 text-black/60">Sign up and verify your email, then register your application to generate a private API key.</p><Link onClick={() => sessionStorage.setItem('developer_signup', '1')} className={button} to="/login?mode=register">Sign up</Link> <Link onClick={() => sessionStorage.setItem('developer_signup', '1')} className="ml-3 underline" to="/login">Sign in</Link></div>}
      {user && (!user.isVerified || user.profileComplete === false) && <p className="mb-6">Complete signup and email verification in <Link className="underline" to="/dashboard">your account</Link> before creating keys.</p>}
      {data && !data.profile && <form className="mb-6 space-y-4 rounded-2xl border border-black/15 bg-white p-6" onSubmit={event => { event.preventDefault(); act(() => api.post('/developer/enroll', { applicationName })); }}><h2 className="text-xl font-semibold">Register your application</h2><label className="block">Application name<input required maxLength={100} className={`${input} mt-2`} value={applicationName} onChange={event => setApplicationName(event.target.value)} /></label><button className={button} disabled={busy || !config?.settings.signupEnabled}>Create developer profile</button></form>}
      {data?.profile && !data.profile.enabled && <p role="alert">API access is suspended. Contact platform support.</p>}

      {section === 'Overview' && <section className="grid gap-4 md:grid-cols-3">{[['01 / Create a key', 'Keys are private server credentials. Each expires after 90 days and can be revoked instantly.'], ['02 / Add DU PT', 'Use your existing wallet, top-up packages, or direct bank transfer when available.'], ['03 / Start verifying', 'Send a reference and an Idempotency-Key. Provider outages are not charged.']].map(([title, text]) => <article key={title} className="rounded-2xl border border-black/15 bg-white p-6"><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-black/60">{text}</p></article>)}</section>}

      {section === 'API keys' && data?.profile && <section className="space-y-5">
        <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); act(async () => { const result = await api.post('/developer/keys', { name }); setSecret(result.data.secret); }); }}><label className="grow">Key name<input className={input} required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button className={button} disabled={busy || !data.profile.enabled}>Generate key</button></form>
        {secret && <div className="rounded-xl border border-black bg-white p-5"><p className="font-semibold">Save this key now. It will never be shown again.</p><code className="my-3 block break-all select-all">{secret}</code><button className="underline" onClick={() => setSecret('')}>I saved it, hide key</button></div>}
        {data.keys.map(key => <article key={key._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><strong>{key.name}</strong><p className="text-sm">{key.prefix}... / {key.revokedAt ? 'Revoked' : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}</p></div>{!key.revokedAt && <button disabled={busy} className="underline" onClick={() => { if (window.confirm(`Revoke ${key.name}? Integrations using it will stop.`)) act(() => api.delete(`/developer/keys/${key._id}`)); }}>Revoke</button>}</article>)}
      </section>}

      {section === 'Usage' && data && <section className="space-y-3"><button className="underline" onClick={() => act(async () => {})}>Refresh usage</button><p className="text-sm text-black/50">Latest 50 requests. Charges also appear in your wallet ledger.</p>{data.requests.length === 0 && <p>No API calls yet.</p>}{data.requests.map(request => <div key={request._id} className="rounded-xl border bg-white p-4"><p className="font-semibold">{request.provider} / {request.outcome || request.state} / {request.charged} DU PT</p><p className="break-all text-xs text-black/50">{request._id} / {new Date(request.createdAt).toLocaleString()} / HTTP {request.httpStatus || 'pending'}</p></div>)}</section>}
      {section === 'Top up' && data?.profile && <BillingPanel duptBalance={data.balance} onBalanceChange={balance => { setData(current => ({ ...current, balance })); updateWallet(balance); }} showLedger />}
      {section === 'Documentation' && <DeveloperDocs base={base} config={config} />}
    </main>
  </div>;
}
