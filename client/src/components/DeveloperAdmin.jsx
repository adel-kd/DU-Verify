import { useEffect, useState } from 'react';
import api from '../lib/api.js';

export default function DeveloperAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [usage, setUsage] = useState(null);
  async function load() { const r = await api.get('/developer/admin/accounts', { params: { search } }); setData(r.data); }
  useEffect(() => { load().catch(() => setError('Could not load developer accounts.')); }, []);
  async function act(fn) { setBusy(true); setError(''); try { await fn(); await load(); } catch (e) { setError(e.response?.data?.error || 'Please try again.'); } finally { setBusy(false); } }
  if (!data) return <p>{error || 'Loading developer accounts...'}</p>;
  const field = 'rounded-lg border border-black/20 bg-white p-2 text-black';
  return <section className="space-y-5 min-w-0">
    <h2 className="text-2xl font-semibold">Developer API</h2>
    {error && <p role="alert">{error}</p>}
    <form className="flex flex-wrap items-end gap-4 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); act(() => api.patch('/developer/admin/settings', data.settings)); }}>
      {['enabled', 'signupEnabled'].map(k => <label key={k}><input type="checkbox" checked={data.settings[k]} onChange={e => setData(d => ({ ...d, settings: { ...d.settings, [k]: e.target.checked } }))} /> {k === 'enabled' ? 'API enabled' : 'Developer signup enabled'}</label>)}
      {[['cost', 'DU PT per lookup'], ['requestsPerMinute', 'Requests per minute'], ['maxKeys', 'Active keys per account']].map(([k, label]) => <label key={k}>{label}<input className={`${field} block w-24`} type="number" min="1" required value={data.settings[k]} onChange={e => setData(d => ({ ...d, settings: { ...d.settings, [k]: Number(e.target.value) } }))} /></label>)}
      <button disabled={busy} className="rounded-lg bg-seal px-4 py-2 text-black">Save settings</button>
    </form>
    <p className="text-sm">Provider availability and top-up methods follow Platform Settings. Wallet changes below are recorded in the billing ledger and admin audit trail.</p>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); act(async () => {}); }}><input className={`${field} min-w-0 flex-1`} placeholder="Search application name" value={search} onChange={e => setSearch(e.target.value)} /><button disabled={busy}>Search</button></form>
    {data.profiles.length === 0 && <p>No developer accounts found.</p>}
    {data.profiles.map(p => p.userId && <article className="rounded-xl border p-4" key={p._id}>
      <h3 className="font-semibold">{p.applicationName}</h3><p className="break-all text-sm">{p.userId.email} / {p.userId.duptBalance} DU PT / {p.enabled ? 'Enabled' : 'Suspended'}</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <button disabled={busy} className="underline" onClick={() => { const reason = window.prompt('Reason for changing API access:'); if (reason) act(() => api.patch(`/developer/admin/accounts/${p.userId._id}`, { enabled: !p.enabled, reason })); }}>{p.enabled ? 'Suspend API' : 'Enable API'}</button>
        <button disabled={busy} className="underline" onClick={() => { if (window.confirm('Revoke all keys for this developer? Their integrations will stop.')) act(() => api.post(`/developer/admin/accounts/${p.userId._id}/revoke`)); }}>Revoke all keys</button>
        <button disabled={busy} className="underline" onClick={() => { const raw = window.prompt('DU PT adjustment: positive to credit, negative to debit'); if (!raw) return; const reason = window.prompt('Reason (required for audit):'); if (reason) act(() => api.post(`/developer/admin/accounts/${p.userId._id}/balance`, { amount: Number(raw), reason })); }}>Adjust balance</button>
        <button disabled={busy} className="underline" onClick={() => act(async () => { const r = await api.get(`/developer/admin/accounts/${p.userId._id}/usage`); setUsage(r.data.requests); })}>View requests</button>
      </div>
    </article>)}
    {usage && <div className="space-y-2"><h3 className="font-semibold">Latest requests</h3>{usage.length === 0 && <p>No requests yet.</p>}{usage.map(r => <div className="rounded-lg border p-3" key={r._id}><p className="break-all text-sm">{r._id} / {r.provider} / {r.state} / {r.charged} DU PT</p>{r.state === 'pending' && Date.now() - new Date(r.createdAt).getTime() > 900000 && <button disabled={busy} className="underline" onClick={() => act(async () => { await api.post(`/developer/admin/requests/${r._id}/resolve`); setUsage(null); })}>Resolve interrupted request without charge</button>}</div>)}</div>}
    <a href="/developers" className="inline-block underline">Open developer documentation</a>
  </section>;
}
