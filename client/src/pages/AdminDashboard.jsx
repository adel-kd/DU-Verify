import { useEffect, useState } from "react";
import api from "../lib/api.js";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import Toast from "../components/Toast.jsx";

const TABS = ["Overview", "Businesses", "Top-ups", "Packages", "Ledger", "Platform Settings"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("Overview");
  const [toast, setToast] = useState(null);

  const [overview, setOverview] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState("");
  const [topups, setTopups] = useState([]);
  const [topupStatusFilter, setTopupStatusFilter] = useState("");

  const [packages, setPackages] = useState([]);
  const [pkgForm, setPkgForm] = useState({ key: "", name: "", duptAmount: "", priceETB: "" });
  const [pkgSaving, setPkgSaving] = useState(false);

  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [platformSettings, setPlatformSettings] = useState(null);
  const [rateInput, setRateInput] = useState("");
  const [platformSaving, setPlatformSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  async function loadOverview() {
    const { data } = await api.get("/admin/overview");
    setOverview(data);
  }

  async function loadBusinesses() {
    const { data } = await api.get("/admin/businesses", { params: search ? { search } : {} });
    setBusinesses(data.businesses || []);
  }

  async function loadTopups() {
    const { data } = await api.get("/admin/topups", { params: topupStatusFilter ? { status: topupStatusFilter } : {} });
    setTopups(data.items || []);
  }

  async function loadPackages() {
    const { data } = await api.get("/admin/packages");
    setPackages(data.packages || []);
  }

  async function loadLedger() {
    setLedgerLoading(true);
    try {
      const { data } = await api.get("/admin/ledger", { params: { limit: 40 } });
      setLedger(data.items || []);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function loadPlatformSettings() {
    const { data } = await api.get("/admin/platform-settings");
    setPlatformSettings(data.settings);
    setRateInput(String(data.settings.customDuptRateEtb));
  }

  useEffect(() => {
    loadOverview();
    loadBusinesses();
    loadTopups();
    loadPackages();
    loadPlatformSettings();
  }, []);

  useEffect(() => {
    const t = setTimeout(loadBusinesses, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadTopups();
  }, [topupStatusFilter]);

  useEffect(() => {
    if (tab === "Ledger") loadLedger();
  }, [tab]);

  async function submitPackage(e) {
    e.preventDefault();
    if (!pkgForm.key.trim() || !pkgForm.name.trim() || !pkgForm.duptAmount || !pkgForm.priceETB) {
      setToast({ type: "error", text: "All package fields are required" });
      return;
    }
    setPkgSaving(true);
    try {
      await api.post("/admin/packages", pkgForm);
      setPkgForm({ key: "", name: "", duptAmount: "", priceETB: "" });
      setToast({ type: "success", text: `Package "${pkgForm.name}" created.` });
      loadPackages();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not create package" });
    } finally {
      setPkgSaving(false);
    }
  }

  async function togglePackageActive(pkg) {
    try {
      await api.patch(`/admin/packages/${pkg._id}`, { active: !pkg.active });
      loadPackages();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update package" });
    }
  }

  async function deletePackage(pkg) {
    try {
      await api.delete(`/admin/packages/${pkg._id}`);
      setToast({ type: "success", text: `Package "${pkg.name}" deleted.` });
      loadPackages();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not delete package" });
    }
  }

  async function saveRate(e) {
    e.preventDefault();
    const rate = Number(rateInput);
    if (!rate || rate <= 0) {
      setToast({ type: "error", text: "Enter a positive ETB rate" });
      return;
    }
    setPlatformSaving(true);
    try {
      const { data } = await api.patch("/admin/platform-settings", { customDuptRateEtb: rate });
      setPlatformSettings(data.settings);
      setToast({ type: "success", text: `Custom top-up rate updated to ETB ${rate} = 1 DU PT.` });
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update rate" });
    } finally {
      setPlatformSaving(false);
    }
  }

  async function toggleProvider(provider) {
    if (!platformSettings) return;
    const next = !platformSettings.providerEnabled[provider];
    try {
      const { data } = await api.patch("/admin/platform-settings", {
        providerEnabled: { [provider]: next },
      });
      setPlatformSettings(data.settings);
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update provider" });
    }
  }

  async function toggleFeatureFlag(flag) {
    if (!platformSettings) return;
    const next = !platformSettings.featureFlags[flag];
    try {
      const { data } = await api.patch("/admin/platform-settings", {
        featureFlags: { [flag]: next },
      });
      setPlatformSettings(data.settings);
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update feature flag" });
    }
  }

  async function openDetail(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    setAdjustAmount("");
    setAdjustReason("");
    try {
      const { data } = await api.get(`/admin/businesses/${id}`);
      setDetail(data);
    } catch (err) {
      setToast({ type: "error", text: "Could not load business detail" });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitAdjust(e) {
    e.preventDefault();
    const amount = Number(adjustAmount);
    if (!amount) {
      setToast({ type: "error", text: "Enter a non-zero amount (negative to debit), in DU PT" });
      return;
    }
    if (!adjustReason.trim()) {
      setToast({ type: "error", text: "A reason is required for manual DU PT adjustments" });
      return;
    }
    setAdjustSaving(true);
    try {
      await api.post(`/admin/businesses/${detail.business._id}/adjust-balance`, {
        amount,
        reason: adjustReason,
      });
      setToast({ type: "success", text: `${amount > 0 ? "Credited" : "Debited"} ${Math.abs(amount)} DU PT` });
      setAdjustAmount("");
      setAdjustReason("");
      openDetail(detail.business._id);
      loadBusinesses();
      loadOverview();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not adjust balance" });
    } finally {
      setAdjustSaving(false);
    }
  }

  async function toggleStatus(isActive) {
    try {
      await api.patch(`/admin/businesses/${detail.business._id}/status`, { isActive });
      setToast({ type: "success", text: isActive ? "Business reactivated" : "Business suspended" });
      openDetail(detail.business._id);
      loadBusinesses();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update status" });
    }
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <TopBar dark />
      <Toast toast={toast} onClose={() => setToast(null)} />

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">Platform admin</h1>
          <p className="text-sm text-ink/50 dark:text-mist mt-1">Oversight and manual controls across every business on DU Verify.</p>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                tab === t ? "bg-ink text-paper" : "bg-white border border-black/10 dark:border-line text-ink/60 dark:text-mist"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && overview && (
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Businesses" value={overview.businessCount} />
            <StatCard label="Total checks" value={overview.totalChecks} />
            <StatCard label="Valid checks" value={overview.validChecks} accent="text-seal" />
            <StatCard label="Failed / blocked checks" value={overview.failedChecks} accent="text-alarm" />
            <StatCard label="Successful top-ups" value={overview.totalTopupCount} />
            <StatCard label="Total topped up" value={`${overview.totalTopupAmount} ETB`} accent="text-seal" />
          </section>
        )}

        {tab === "Businesses" && (
          <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by business, owner, email, or phone"
              className="w-full mb-4 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
            />
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                  <tr>
                    <th className="py-2 font-medium">Business</th>
                    <th className="font-medium">Owner</th>
                    <th className="font-medium">Balance</th>
                    <th className="font-medium">Checks</th>
                    <th className="font-medium">Topped up</th>
                    <th className="font-medium">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {businesses.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-ink/30">No businesses found</td></tr>
                  )}
                  {businesses.map((b) => (
                    <tr key={b._id} className="border-b border-black/5 dark:border-line last:border-0">
                      <td className="py-2.5">{b.businessName}</td>
                      <td>{b.ownerName}</td>
                      <td className={b.lowBalance ? "text-alarm font-medium" : ""}>
                        {b.duptBalance} DU PT {b.lowBalance && "⚠"}
                      </td>
                      <td>{b.validChecks} / {b.totalChecks}</td>
                      <td>{b.totalToppedUp} ETB</td>
                      <td>
                        <span className={b.isActive ? "text-seal" : "text-alarm"}>{b.isActive ? "Active" : "Suspended"}</span>
                      </td>
                      <td>
                        <button onClick={() => openDetail(b._id)} className="text-xs underline text-ink/50 dark:text-mist">
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "Top-ups" && (
          <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
            <select
              value={topupStatusFilter}
              onChange={(e) => setTopupStatusFilter(e.target.value)}
              className="mb-4 border border-black/10 dark:border-line rounded-lg text-sm px-2 py-1.5"
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                  <tr>
                    <th className="py-2 font-medium">Business</th>
                    <th className="font-medium">Amount</th>
                    <th className="font-medium">Status</th>
                    <th className="font-medium">Initiated</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-ink/30">No top-ups found</td></tr>
                  )}
                  {topups.map((t) => (
                    <tr key={t._id} className="border-b border-black/5 dark:border-line last:border-0">
                      <td className="py-2.5">{t.businessId?.businessName || "—"}</td>
                      <td>{t.amount} ETB</td>
                      <td>
                        <span
                          className={
                            t.status === "success" ? "text-seal" : t.status === "failed" ? "text-alarm" : "text-ink/40 dark:text-mist"
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>{new Date(t.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "Packages" && (
          <div className="space-y-6">
            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-paper mb-4">Discounted packages</h2>
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                    <tr>
                      <th className="py-2 font-medium">Name</th>
                      <th className="font-medium">DU PT</th>
                      <th className="font-medium">Price (ETB)</th>
                      <th className="font-medium">Per verification</th>
                      <th className="font-medium">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {packages.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-ink/30">No packages yet</td></tr>
                    )}
                    {packages.map((p) => (
                      <tr key={p._id} className="border-b border-black/5 dark:border-line last:border-0">
                        <td className="py-2.5">{p.name}</td>
                        <td>{p.duptAmount.toLocaleString()}</td>
                        <td>{p.priceETB.toLocaleString()}</td>
                        <td>{(p.priceETB / p.duptAmount).toFixed(2)}</td>
                        <td>
                          <span className={p.active ? "text-seal" : "text-ink/40 dark:text-mist"}>{p.active ? "Active" : "Inactive"}</span>
                        </td>
                        <td className="flex gap-2 py-2.5">
                          <button onClick={() => togglePackageActive(p)} className="text-xs underline text-ink/50 dark:text-mist">
                            {p.active ? "Deactivate" : "Activate"}
                          </button>
                          <button onClick={() => deletePackage(p)} className="text-xs text-alarm/70 hover:text-alarm">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-paper mb-4">Create package</h2>
              <form onSubmit={submitPackage} className="grid sm:grid-cols-4 gap-3">
                <input
                  value={pkgForm.key}
                  onChange={(e) => setPkgForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="key (e.g. starter)"
                  className="border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={pkgForm.name}
                  onChange={(e) => setPkgForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Name (e.g. Starter)"
                  className="border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={pkgForm.duptAmount}
                  onChange={(e) => setPkgForm((f) => ({ ...f, duptAmount: e.target.value }))}
                  placeholder="DU PT amount"
                  className="border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={pkgForm.priceETB}
                  onChange={(e) => setPkgForm((f) => ({ ...f, priceETB: e.target.value }))}
                  placeholder="Price (ETB)"
                  className="border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={pkgSaving}
                  className="sm:col-span-4 bg-ink text-paper text-sm font-medium rounded-lg py-2.5 disabled:opacity-50"
                >
                  {pkgSaving ? "Creating…" : "Create package"}
                </button>
              </form>
            </section>
          </div>
        )}

        {tab === "Ledger" && (
          <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
            <h2 className="font-display font-semibold text-ink dark:text-paper mb-4">Platform billing ledger</h2>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                  <tr>
                    <th className="py-2 font-medium">Date</th>
                    <th className="font-medium">Business</th>
                    <th className="font-medium">Type</th>
                    <th className="font-medium">DU PT</th>
                    <th className="font-medium">Balance after</th>
                    <th className="font-medium">Reason / ref</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading && (
                    <tr><td colSpan={6} className="py-6 text-center text-ink/30">Loading…</td></tr>
                  )}
                  {!ledgerLoading && ledger.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-ink/30">No ledger entries yet</td></tr>
                  )}
                  {ledger.map((entry) => (
                    <tr key={entry._id} className="border-b border-black/5 dark:border-line last:border-0">
                      <td className="py-2.5 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td>{entry.businessId?.businessName || "—"}</td>
                      <td className="whitespace-nowrap">{entry.type.replaceAll("_", " ")}</td>
                      <td className={entry.duptAmount >= 0 ? "text-seal font-medium" : "text-alarm font-medium"}>
                        {entry.duptAmount >= 0 ? "+" : ""}
                        {entry.duptAmount}
                      </td>
                      <td>{entry.balanceAfter}</td>
                      <td className="text-xs text-ink/50 dark:text-mist max-w-[240px] truncate" title={entry.reason || entry.internalTxRef}>
                        {entry.reason || entry.internalTxRef || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "Platform Settings" && platformSettings && (
          <div className="space-y-6">
            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">Custom top-up rate</h2>
              <p className="text-xs text-ink/40 dark:text-mist mb-4">
                Applies to Custom Top Up only. Discounted packages keep their own independent pricing.
              </p>
              <form onSubmit={saveRate} className="flex items-center gap-2">
                <span className="text-sm text-ink/50 dark:text-mist">ETB</span>
                <input
                  type="number"
                  step="0.01"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-28 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <span className="text-sm text-ink/50 dark:text-mist">= 1 DU PT</span>
                <button
                  disabled={platformSaving}
                  className="ml-2 bg-ink text-paper text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50"
                >
                  {platformSaving ? "Saving…" : "Save"}
                </button>
              </form>
            </section>

            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">Payment providers</h2>
              <p className="text-xs text-ink/40 dark:text-mist mb-4">
                Platform-wide kill switch. Disabling a provider here blocks verification for it across every
                business, regardless of that business's own account configuration.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {Object.entries(platformSettings.providerEnabled).map(([provider, enabled]) => (
                  <div key={provider} className="flex items-center justify-between border border-black/10 dark:border-line rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-ink dark:text-paper">{provider}</span>
                    <button
                      onClick={() => toggleProvider(provider)}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                        enabled ? "bg-seal/10 text-sealDark" : "bg-alarm/10 text-alarm"
                      }`}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">Feature availability</h2>
              <p className="text-xs text-ink/40 dark:text-mist mb-4">Turn purchasing paths on/off platform-wide.</p>
              <div className="space-y-2">
                {Object.entries(platformSettings.featureFlags).map(([flag, enabled]) => (
                  <div key={flag} className="flex items-center justify-between border border-black/10 dark:border-line rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-ink dark:text-paper capitalize">{flag.replace(/([A-Z])/g, " $1")}</span>
                    <button
                      onClick={() => toggleFeatureFlag(flag)}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                        enabled ? "bg-seal/10 text-sealDark" : "bg-alarm/10 text-alarm"
                      }`}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <Footer />

      <Modal open={detailOpen} title={detail?.business?.businessName || "Business"} onClose={() => setDetailOpen(false)}>
        {detailLoading && <p className="text-sm text-ink/40 dark:text-mist">Loading…</p>}
        {!detailLoading && detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Owner" value={detail.business.ownerName} />
              <Info label="Email" value={detail.business.email} />
              <Info label="Phone" value={detail.business.phone} />
              <Info label="Balance" value={`${detail.business.duptBalance} DU PT`} />
              <Info label="Staff accounts" value={detail.staffCount} />
              <Info label="Status" value={detail.business.isActive ? "Active" : "Suspended"} />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => toggleStatus(!detail.business.isActive)}
                className={`text-xs font-medium rounded-lg px-3 py-1.5 ${
                  detail.business.isActive ? "bg-alarm/10 text-alarm" : "bg-seal/10 text-sealDark"
                }`}
              >
                {detail.business.isActive ? "Suspend business" : "Reactivate business"}
              </button>
            </div>

            <form onSubmit={submitAdjust} className="space-y-2 border-t border-black/5 dark:border-line pt-4">
              <h4 className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">Manually adjust balance (DU PT)</h4>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 50 or -10"
                  className="flex-1 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={adjustSaving}
                  className="bg-ink text-paper text-sm font-medium rounded-lg px-4 disabled:opacity-50"
                >
                  {adjustSaving ? "…" : "Apply"}
                </button>
              </div>
              <input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Reason (required, shown in the audit log)"
                className="w-full border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-ink/40 dark:text-mist">Positive credits, negative debits, in DU PT. A reason is required and this can never take a balance below zero.</p>
            </form>

            <div className="border-t border-black/5 dark:border-line pt-4">
              <h4 className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase mb-2">Recent checks</h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {detail.recentChecks.length === 0 && <p className="text-xs text-ink/30">None yet</p>}
                {detail.recentChecks.map((c) => (
                  <div key={c._id} className="text-xs flex justify-between text-ink/60 dark:text-mist">
                    <span>{c.bankName} · {c.transactionRef}</span>
                    <span>{c.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-black/5 dark:border-line pt-4">
              <h4 className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase mb-2">Admin action log</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {detail.adminActions.length === 0 && <p className="text-xs text-ink/30">No manual actions yet</p>}
                {detail.adminActions.map((a) => (
                  <div key={a._id} className="text-xs text-ink/60 dark:text-mist">
                    {a.action} {a.amount ? `(${a.amount} DU PT)` : ""} — {a.reason || "no reason given"}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, accent = "text-ink dark:text-paper" }) {
  return (
    <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4">
      <p className="text-xs text-ink/40 dark:text-mist uppercase tracking-wide">{label}</p>
      <p className={`font-display text-2xl sm:text-3xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink/40 dark:text-mist uppercase tracking-wide">{label}</p>
      <p className="text-ink dark:text-paper font-medium">{value}</p>
    </div>
  );
}
