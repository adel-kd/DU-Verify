import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../lib/api.js";
import { BarChart, SplitBar } from "../components/Charts.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import Toast from "../components/Toast.jsx";

const SECTIONS = [
  { key: "Overview", label: "Overview", description: "Platform health and totals." },
  { key: "Businesses", label: "Businesses", description: "Accounts, balances, and status." },
  { key: "Verify", label: "Verify a receipt", description: "Run a check for a client — handy for self-only clients with no staff." },
  { key: "Top-ups", label: "Top-ups", description: "Chapa funding activity." },
  { key: "Packages", label: "Packages", description: "Package pricing and status." },
  { key: "Ledger", label: "Ledger", description: "Billing audit trail." },
  { key: "Announcements", label: "Announcements", description: "Client messages and broadcasts." },
  { key: "Admins", label: "Admins", description: "Platform admin accounts." },
  { key: "Settings", label: "Settings", description: "Your account and preferences." },
  { key: "Platform Settings", label: "Platform Settings", description: "System-wide billing and provider controls." },
];

export default function AdminDashboard() {
  const { user, updateUser, logout } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [toast, setToast] = useState(null);

  // Settings tab state.
  const [adminForm, setAdminForm] = useState({ ownerName: "", email: "", phone: "", password: "" });
  const [adminSaving, setAdminSaving] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);

  // Announcement client picker search.
  const [annBusinessSearch, setAnnBusinessSearch] = useState("");

  const [overview, setOverview] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState("");
  const [topups, setTopups] = useState([]);
  const [topupStatusFilter, setTopupStatusFilter] = useState("");

  const [packages, setPackages] = useState([]);
  const [pkgForm, setPkgForm] = useState({ key: "", name: "", duptAmount: "", priceETB: "" });
  const [pkgSaving, setPkgSaving] = useState(false);

  const [announcements, setAnnouncements] = useState([]);
  const [annForm, setAnnForm] = useState({ title: "", message: "", severity: "info", businessId: "" });
  const [annSaving, setAnnSaving] = useState(false);

  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("");

  const [platformSettings, setPlatformSettings] = useState(null);
  const [rateInput, setRateInput] = useState("");
  const [platformSaving, setPlatformSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Verify tab — running a receipt check on behalf of a client, mainly
  // for self-only clients (no staff) who have nobody else to do it.
  const [verifyBusinessId, setVerifyBusinessId] = useState("");
  const [verifySelfOnlyOnly, setVerifySelfOnlyOnly] = useState(true);
  const [verifyAccounts, setVerifyAccounts] = useState([]);
  const [verifyAccountsLoading, setVerifyAccountsLoading] = useState(false);
  const [verifyBank, setVerifyBank] = useState("");
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyExpectedAmount, setVerifyExpectedAmount] = useState("");
  const [verifyPhoneNumber, setVerifyPhoneNumber] = useState("");
  const [verifyTransactionRef, setVerifyTransactionRef] = useState("");
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState("");

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

  // Ledger filtering (search + type).
  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();

    return ledger.filter((entry) => {
      if (ledgerTypeFilter && entry.type !== ledgerTypeFilter) return false;

      if (!q) return true;

      const haystack = [
        entry.businessId?.businessName,
        entry.businessId?.ownerName,
        entry.reason,
        entry.internalTxRef,
        entry.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [ledger, ledgerSearch, ledgerTypeFilter]);

  // Client picker for announcements (searchable — there can be many).
  const filteredBusinesses = useMemo(() => {
    const q = annBusinessSearch.trim().toLowerCase();

    if (!q) return businesses;

    return businesses.filter((b) =>
      [b.businessName, b.ownerName, b.email, b.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [businesses, annBusinessSearch]);

  // The same search box also filters sent announcement history,
  // so one query serves both picking a client and reviewing
  // past announcements.
  const filteredAnnouncements = useMemo(() => {
    const q = annBusinessSearch.trim().toLowerCase();

    if (!q) return announcements;

    return announcements.filter((a) =>
      [
        a.title,
        a.message,
        a.businessId?.businessName,
        a.businessId?.ownerName,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [announcements, annBusinessSearch]);

  async function submitNewAdmin(e) {
    e.preventDefault();
    setAdminSaving(true);

    try {
      await api.post("/admin/admins", adminForm);
      setAdminForm({ ownerName: "", email: "", phone: "", password: "" });
      setToast({ type: "success", text: "Admin account created." });
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not create admin" });
    } finally {
      setAdminSaving(false);
    }
  }

  async function changeOwnPassword(e) {
    e.preventDefault();
    setPwSaving(true);

    try {
      await api.patch("/auth/me/password", pwForm);
      setPwForm({ currentPassword: "", newPassword: "" });
      setToast({ type: "success", text: "Password updated." });
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update password" });
    } finally {
      setPwSaving(false);
    }
  }

  // Super Admin's own theme preference. Saved to the same
  // account field clients use; ThemeContext applies it instantly.
  async function chooseTheme(themePreference) {
    setThemeSaving(true);

    try {
      const { data } = await api.patch("/auth/me/preferences", {
        themePreference,
      });

      updateUser(data.user);

      setToast({ type: "success", text: "Theme updated." });
    } catch (err) {
      setToast({
        type: "error",
        text: err.response?.data?.error || "Could not update theme",
      });
    } finally {
      setThemeSaving(false);
    }
  }

  async function loadAnnouncements() {
    const { data } = await api.get("/admin/announcements");
    setAnnouncements(data.items || []);
  }

  async function loadAdmins() {
    const { data } = await api.get("/admin/admins");
    setAdmins(data.admins || []);
  }

  async function submitAnnouncement(e) {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.message.trim()) {
      setToast({ type: "error", text: "Title and message are required" });
      return;
    }
    setAnnSaving(true);
    try {
      await api.post("/admin/announcements", {
        title: annForm.title,
        message: annForm.message,
        severity: annForm.severity,
        businessId: annForm.businessId || null,
      });
      setAnnForm({ title: "", message: "", severity: "info", businessId: "" });
      setToast({ type: "success", text: "Announcement sent." });
      loadAnnouncements();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not send announcement" });
    } finally {
      setAnnSaving(false);
    }
  }

  async function deactivateAnnouncement(id) {
    try {
      await api.patch(`/admin/announcements/${id}/deactivate`);
      loadAnnouncements();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not deactivate" });
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
    loadAdmins();
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
    if (tab === "Announcements") loadAnnouncements();
    if (tab === "Admins") loadAdmins();
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

  // ==========================================================
  // VERIFY TAB — run a receipt check on behalf of a client
  // ==========================================================

  async function loadVerifyAccounts(businessId) {
    if (!businessId) {
      setVerifyAccounts([]);
      setVerifyBank("");
      return;
    }
    setVerifyAccountsLoading(true);
    try {
      const { data } = await api.get("/payment-accounts", { params: { businessId } });
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      setVerifyAccounts(accounts);
      setVerifyBank((current) =>
        accounts.some((a) => a.provider === current) ? current : (accounts[0]?.provider || "")
      );
    } catch (err) {
      setVerifyAccounts([]);
      setVerifyBank("");
      setToast({ type: "error", text: err.response?.data?.error || "Could not load this client's payment accounts" });
    } finally {
      setVerifyAccountsLoading(false);
    }
  }

  function chooseVerifyBusiness(id) {
    setVerifyBusinessId(id);
    setVerifyResult(null);
    setVerifyError("");
    setVerifyFile(null);
    setVerifyTransactionRef("");
    setVerifyExpectedAmount("");
    setVerifyPhoneNumber("");
    loadVerifyAccounts(id);
  }

  async function submitAdminVerify(e) {
    e.preventDefault();
    setVerifyError("");
    setVerifyResult(null);

    if (!verifyBusinessId) {
      setVerifyError("Choose which client this check is for.");
      return;
    }
    if (!verifyBank) {
      setVerifyError("Choose which provider the receipt is from.");
      return;
    }
    if (!verifyFile && !verifyTransactionRef.trim()) {
      setVerifyError("Upload the receipt image, or paste the transaction reference.");
      return;
    }

    const formData = new FormData();
    formData.append("businessId", verifyBusinessId);
    formData.append("bankName", verifyBank);
    if (verifyFile) formData.append("image", verifyFile);
    if (verifyExpectedAmount.trim()) formData.append("expectedAmount", verifyExpectedAmount.trim());
    if (verifyPhoneNumber.trim()) formData.append("phoneNumber", verifyPhoneNumber.trim());
    if (verifyTransactionRef.trim()) formData.append("transactionRef", verifyTransactionRef.trim());

    setVerifySubmitting(true);
    try {
      const { data } = await api.post("/verify", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVerifyResult(data);
      loadBusinesses();
    } catch (err) {
      setVerifyError(err.response?.data?.error || err.response?.data?.userMessage || "Could not run this verification.");
    } finally {
      setVerifySubmitting(false);
    }
  }

  const verifyPickerBusinesses = verifySelfOnlyOnly
    ? businesses.filter((b) => (b.staffCount || 0) === 0)
    : businesses;

  const verifySelectedBusiness = businesses.find((b) => b._id === verifyBusinessId) || null;

  return (
    <div className="h-screen bg-paper dark:bg-ink flex flex-col overflow-hidden">
      <TopBar dark />
      <Toast toast={toast} onClose={() => setToast(null)} />

      <main className="flex-1 min-h-0 w-full px-4 sm:px-6 pb-4 sm:pb-6 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 sm:gap-6 min-h-0">
          <aside className="bg-white dark:bg-panel border border-black/10 dark:border-line rounded-3xl p-3 sm:p-4 shadow-sm overflow-y-auto">
            <div className="pb-3 border-b border-black/5 dark:border-line mb-3">
              <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">Platform admin</h1>
              <p className="text-sm text-ink/50 dark:text-mist mt-1">
                Oversight and manual controls across every business on DU Verify.
              </p>
            </div>

            <nav className="space-y-2">
              {SECTIONS.map((section) => {
                const active = tab === section.key;

                return (
                  <button
                    key={section.key}
                    onClick={() => setTab(section.key)}
                    className={`w-full text-left rounded-2xl border p-3 transition ${
                      active
                        ? "border-seal bg-seal/10"
                        : "border-black/10 dark:border-line bg-paper/70 dark:bg-[#1a1a1a] hover:border-seal/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm text-ink dark:text-paper">{section.label}</p>
                        <p className="text-xs text-ink/45 dark:text-mist mt-1">{section.description}</p>
                      </div>
                      {active && <span className="text-[11px] uppercase tracking-wide text-sealDark">Active</span>}
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-h-0 overflow-y-auto pr-1 sm:pr-2">
        {tab === "Overview" && overview && (
          <>
            <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard label="Businesses" value={overview.businessCount} />
              <StatCard label="Total checks" value={overview.totalChecks} />
              <StatCard label="Valid checks" value={overview.validChecks} accent="text-seal" />
              <StatCard label="Failed / blocked checks" value={overview.failedChecks} accent="text-alarm" />
              <StatCard label="Successful top-ups" value={overview.totalTopupCount} />
              <StatCard label="Total topped up" value={`${overview.totalTopupAmount} ETB`} accent="text-seal" />
            </section>

            {/* Platform graphs */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4">
                <h2 className="font-display text-sm font-semibold text-ink dark:text-white mb-3">Platform checks</h2>
                <BarChart
                  data={[
                    { label: "Valid", value: overview.validChecks, color: "#12A783" },
                    { label: "Failed", value: overview.failedChecks, color: "#D5573B" },
                  ]}
                />
                <div className="mt-4">
                  <SplitBar
                    segments={[
                      { label: "Valid", value: overview.validChecks, color: "#12A783" },
                      { label: "Failed / blocked", value: overview.failedChecks, color: "#D5573B" },
                    ]}
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4">
                <h2 className="font-display text-sm font-semibold text-ink dark:text-white mb-3">Top-ups (ETB)</h2>
                <BarChart
                  data={[
                    { label: "Top-ups", value: overview.totalTopupCount, color: "#12A783" },
                    { label: "Volume (÷100)", value: Math.round((overview.totalTopupAmount || 0) / 100), color: "#0A0A0A" },
                  ]}
                  unit=""
                />
                <p className="mt-2 text-[11px] text-mist">
                  Total topped up: {overview.totalTopupAmount} ETB across {overview.totalTopupCount} successful top-up(s).
                </p>
              </div>
            </section>
          </>
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

        {tab === "Verify" && (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
            {/* CLIENT PICKER */}
            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
              <h2 className="font-display text-sm font-semibold text-ink dark:text-white mb-1">Choose a client</h2>
              <p className="text-xs text-ink/45 dark:text-mist mb-3">
                Use this when a client has no staff of their own — or their staff — to run a check for.
              </p>
              <label className="flex items-center gap-2 text-xs text-ink/60 dark:text-mist mb-3">
                <input
                  type="checkbox"
                  checked={verifySelfOnlyOnly}
                  onChange={(e) => setVerifySelfOnlyOnly(e.target.checked)}
                />
                Only show self-only clients (no staff)
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by business, owner, email, or phone"
                className="w-full mb-3 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
              />
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {verifyPickerBusinesses.length === 0 && (
                  <p className="text-xs text-ink/30 dark:text-mist py-4 text-center">
                    {verifySelfOnlyOnly ? "No self-only clients match." : "No clients match."}
                  </p>
                )}
                {verifyPickerBusinesses.map((b) => (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => chooseVerifyBusiness(b._id)}
                    className={`w-full text-left rounded-xl border p-3 transition ${
                      verifyBusinessId === b._id
                        ? "border-seal bg-seal/10"
                        : "border-black/10 dark:border-line bg-paper/70 dark:bg-[#1a1a1a] hover:border-seal/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-ink dark:text-paper">{b.businessName}</p>
                        <p className="text-xs text-ink/45 dark:text-mist mt-0.5">{b.ownerName}</p>
                      </div>
                      {(b.staffCount || 0) === 0 ? (
                        <span className="text-[10px] uppercase tracking-wide text-sealDark bg-seal/10 border border-seal/30 rounded-full px-2 py-0.5 shrink-0">
                          No staff
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-ink/40 dark:text-mist shrink-0">
                          {b.staffCount} staff
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink/40 dark:text-mist mt-2">{b.duptBalance} DU PT available</p>
                  </button>
                ))}
              </div>
            </section>

            {/* VERIFICATION FORM + RESULT */}
            <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5 overflow-y-auto">
              {!verifyBusinessId && (
                <p className="text-sm text-ink/40 dark:text-mist py-10 text-center">
                  Pick a client on the left to run a verification for them.
                </p>
              )}

              {verifyBusinessId && (
                <>
                  <div className="pb-3 mb-4 border-b border-black/5 dark:border-line">
                    <h2 className="font-display text-sm font-semibold text-ink dark:text-white">
                      Verifying for {verifySelectedBusiness?.businessName || "this client"}
                    </h2>
                    <p className="text-xs text-ink/45 dark:text-mist mt-1">
                      This uses {verifySelectedBusiness?.businessName || "the client's"} own DU PT balance ({verifySelectedBusiness?.duptBalance ?? "—"} DU PT), exactly as if they ran it themselves.
                    </p>
                  </div>

                  <form onSubmit={submitAdminVerify} className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-ink/60 dark:text-mist mb-2">Provider</p>
                      {verifyAccountsLoading && <p className="text-xs text-ink/30 dark:text-mist">Loading this client's payment accounts…</p>}
                      {!verifyAccountsLoading && verifyAccounts.length === 0 && (
                        <p className="text-xs text-alarm">This client has no payment accounts configured yet.</p>
                      )}
                      {!verifyAccountsLoading && verifyAccounts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {verifyAccounts.map((account) => (
                            <button
                              key={account._id}
                              type="button"
                              onClick={() => setVerifyBank(account.provider)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                verifyBank === account.provider
                                  ? "border-seal bg-seal/10 text-sealDark"
                                  : "border-black/10 dark:border-line text-ink/60 dark:text-mist hover:border-seal/40"
                              }`}
                            >
                              {account.provider}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-ink/60 dark:text-mist mb-1 block">Receipt image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setVerifyFile(e.target.files?.[0] || null)}
                        className="w-full text-xs border border-black/10 dark:border-line rounded-lg px-3 py-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-ink/60 dark:text-mist mb-1 block">Expected amount (ETB)</label>
                        <input
                          value={verifyExpectedAmount}
                          onChange={(e) => setVerifyExpectedAmount(e.target.value)}
                          placeholder="Optional"
                          className="w-full border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      {verifyBank === "CBEBirr" && (
                        <div>
                          <label className="text-xs font-medium text-ink/60 dark:text-mist mb-1 block">Payer phone</label>
                          <input
                            value={verifyPhoneNumber}
                            onChange={(e) => setVerifyPhoneNumber(e.target.value)}
                            placeholder="09xxxxxxxx"
                            className="w-full border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-ink/60 dark:text-mist mb-1 block">
                        Or paste the transaction reference / receipt link
                      </label>
                      <input
                        value={verifyTransactionRef}
                        onChange={(e) => setVerifyTransactionRef(e.target.value)}
                        placeholder="Optional — used instead of / alongside the image"
                        className="w-full border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    {verifyError && (
                      <p className="text-sm text-alarm">{verifyError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={verifySubmitting}
                      className="bg-seal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {verifySubmitting ? "Verifying…" : "Run verification"}
                    </button>
                  </form>

                  {verifyResult && (
                    <div className="mt-6 pt-5 border-t border-black/5 dark:border-line">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs font-medium uppercase tracking-wide rounded-full px-2.5 py-1 ${
                            verifyResult.verified
                              ? "bg-seal/10 text-sealDark border border-seal/30"
                              : "bg-alarm/10 text-alarm border border-alarm/30"
                          }`}
                        >
                          {verifyResult.status || (verifyResult.verified ? "VALID" : "NOT VERIFIED")}
                        </span>
                        {verifyResult.amount !== undefined && verifyResult.amount !== null && (
                          <span className="text-xs text-ink/40 dark:text-mist">{verifyResult.amount} ETB</span>
                        )}
                      </div>
                      <p className="text-sm text-ink dark:text-paper">{verifyResult.userMessage}</p>

                      {/* Client message section — same provider message a client
                          would see, kept here so the admin can copy/relay it. */}
                      {verifyResult.providerName && (
                        <div className="mt-3 bg-paper/70 dark:bg-[#1a1a1a] border border-black/10 dark:border-line rounded-xl p-3">
                          <p className="text-[11px] uppercase tracking-wide text-ink/40 dark:text-mist mb-1">
                            {verifyResult.providerName}
                          </p>
                          {verifyResult.providerMessage && (
                            <p className="text-sm text-ink/70 dark:text-mist">{verifyResult.providerMessage}</p>
                          )}
                          {verifyResult.providerLink && (
                            <a
                              href={verifyResult.providerLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sealDark underline underline-offset-2 mt-1 inline-block"
                            >
                              Open receipt link
                            </a>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-ink/40 dark:text-mist mt-3">
                        {verifySelectedBusiness?.businessName || "Client"}'s balance after this check: {verifyResult.duptBalance ?? "—"} DU PT
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <h2 className="font-display font-semibold text-ink dark:text-white mr-auto">Platform billing ledger</h2>
              {/* Search + type filter — the ledger grows fast. */}
              <input
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                placeholder="Search business / reason…"
                className="border border-black/20 dark:border-line bg-white dark:bg-[#1a1a1a] text-ink dark:text-white text-sm px-3 py-1.5 w-full sm:w-64"
              />
              <select
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                className="border border-black/20 dark:border-line bg-white dark:bg-[#1a1a1a] text-ink dark:text-white text-sm px-2 py-1.5"
              >
                <option value="">All types</option>
                {[...new Set(ledger.map((l) => l.type))].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-left text-mist border-b border-black/10 dark:border-line">
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
                    <tr><td colSpan={6} className="py-6 text-center text-mist">Loading…</td></tr>
                  )}
                  {!ledgerLoading && filteredLedger.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-mist">No matching ledger entries</td></tr>
                  )}
                  {filteredLedger.map((entry) => (
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
        {tab === "Announcements" && (
          <div className="space-y-6">
            {/* Compose */}
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">Send alert / message</h2>
              <p className="text-xs text-mist mb-4">
                Delivered directly to client accounts (business owners and their staff). Leave the
                business blank to broadcast to ALL clients.
              </p>
              <form onSubmit={submitAnnouncement} className="space-y-3">
                <input
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  placeholder="Title (e.g. Scheduled maintenance)"
                  className="w-full border border-black/15 dark:border-line px-3 py-2 text-sm"
                />
                <textarea
                  value={annForm.message}
                  onChange={(e) => setAnnForm({ ...annForm, message: e.target.value })}
                  placeholder="Message shown to the client…"
                  rows={4}
                  className="w-full border border-black/15 dark:border-line px-3 py-2 text-sm"
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={annForm.severity}
                    onChange={(e) => setAnnForm({ ...annForm, severity: e.target.value })}
                    className="border border-black/15 dark:border-line px-3 py-2 text-sm"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                  {/* Searchable client picker + history filter — one box, both jobs. */}
                  <input
                    value={annBusinessSearch}
                    onChange={(e) => setAnnBusinessSearch(e.target.value)}
                    placeholder="Search clients or announcements…"
                    className="border border-black/15 dark:border-line px-3 py-2 text-sm w-full sm:w-48"
                  />
                  <select
                    value={annForm.businessId}
                    onChange={(e) => setAnnForm({ ...annForm, businessId: e.target.value })}
                    className="border border-black/15 dark:border-line bg-white dark:bg-[#1a1a1a] text-ink dark:text-white px-3 py-2 text-sm w-full sm:w-auto"
                  >
                    <option value="">All clients (broadcast)</option>
                    {filteredBusinesses.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.businessName || b.ownerName || b.email}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={annSaving}
                    className="bg-seal text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 sm:ml-auto"
                  >
                    {annSaving ? "Sending…" : "Send announcement"}
                  </button>
                </div>
              </form>
            </section>

            {/* History */}
            <section className="space-y-2">
              <h2 className="font-display text-sm font-semibold text-ink dark:text-white">Sent announcements</h2>
              {!filteredAnnouncements.length && (
                <p className="text-sm text-mist">
                  {announcements.length
                    ? "No announcements match your search."
                    : "No announcements yet."}
                </p>
              )}
              {filteredAnnouncements.map((a) => (
                <div
                  key={a._id}
                  className={`border px-4 py-3 flex items-start justify-between gap-3 ${
                    a.active ? "border-black/15 dark:border-line" : "border-black/10 opacity-50 dark:border-line"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink dark:text-white">
                      {a.severity !== "info" && (a.severity === "critical" ? "⚠ " : "• ")}
                      {a.title}
                      {!a.active && " (inactive)"}
                    </p>
                    <p className="text-xs text-mist mt-0.5 whitespace-pre-line">{a.message}</p>
                    <p className="text-[11px] text-mist mt-1">
                      To: {a.businessId?.businessName || a.businessId?.ownerName || "All clients"} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {a.active && (
                    <button
                      onClick={() => deactivateAnnouncement(a._id)}
                      className="text-xs font-semibold border border-alarm text-alarm px-2 py-1 whitespace-nowrap"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === "Admins" && (
          <div className="space-y-6">
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">Platform admins</h2>
              <p className="text-xs text-mist">
                Admin accounts can sign in with either email or phone. Phone-only admins are supported.
              </p>
              <div className="mt-4 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                    <tr>
                      <th className="py-2 font-medium">Name</th>
                      <th className="font-medium">Email</th>
                      <th className="font-medium">Phone</th>
                      <th className="font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-ink/30">No admins found</td></tr>
                    )}
                    {admins.map((admin) => (
                      <tr key={admin._id} className="border-b border-black/5 dark:border-line last:border-0">
                        <td className="py-2.5">{admin.ownerName}</td>
                        <td>{admin.email || "—"}</td>
                        <td>{admin.phone || "—"}</td>
                        <td className={admin.isActive ? "text-seal" : "text-alarm"}>
                          {admin.isActive ? "Active" : "Inactive"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">Add another admin</h2>
              <p className="text-xs text-mist mb-4">
                Creates a new platform admin, or promotes an existing account that matches the phone or email.
              </p>
              <form onSubmit={submitNewAdmin} className="grid sm:grid-cols-2 gap-3">
                <input
                  required
                  value={adminForm.ownerName}
                  onChange={(e) => setAdminForm({ ...adminForm, ownerName: e.target.value })}
                  placeholder="Admin name"
                  className="border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  placeholder="Email (optional)"
                  className="border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <input
                  required
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  placeholder="Phone"
                  className="border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <input
                  required
                  minLength={8}
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder="Temporary password (min 8)"
                  className="border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <button
                  disabled={adminSaving}
                  className="bg-seal text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 sm:col-span-2 sm:w-auto sm:justify-self-start"
                >
                  {adminSaving ? "Creating…" : "Create admin"}
                </button>
              </form>
            </section>
          </div>
        )}

        {tab === "Settings" && (
          <div className="space-y-6 max-w-3xl">
            {/* My Account */}
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">My Account</h2>
              <p className="text-xs text-mist mb-4">Platform administrator account.</p>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-mist text-xs uppercase">Name</dt><dd>{user?.ownerName}</dd></div>
                <div><dt className="text-mist text-xs uppercase">Email</dt><dd>{user?.email}</dd></div>
                <div><dt className="text-mist text-xs uppercase">Phone</dt><dd>{user?.phone}</dd></div>
                <div><dt className="text-mist text-xs uppercase">Role</dt><dd>Super Admin</dd></div>
              </dl>
              <button
                onClick={logout}
                className="mt-4 border border-alarm text-alarm text-sm font-semibold px-4 py-2"
              >
                Log out
              </button>
            </section>

            {/* Privacy & Security */}
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">Privacy & Security</h2>
              <p className="text-xs text-mist mb-4">Change your own password.</p>
              <form onSubmit={changeOwnPassword} className="space-y-3 max-w-sm">
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  placeholder="Current password"
                  className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  placeholder="New password (min 8 characters)"
                  className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2 text-sm"
                />
                <button
                  disabled={pwSaving}
                  className="bg-seal text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
                >
                  {pwSaving ? "Updating…" : "Update password"}
                </button>
              </form>
            </section>

            {/* Theme */}
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-1">Theme</h2>
              <p className="text-xs text-mist mb-4">
                Your own display preference for this admin account — same system client accounts use.
              </p>
              {(() => {
                const current = user?.themePreference || "system";

                const OPTIONS = [
                  { key: "light", label: "Light", hint: "Always light" },
                  { key: "dark", label: "Dark", hint: "Always dark" },
                  { key: "system", label: "System", hint: "Match your device" },
                ];

                return (
                  <div className="grid grid-cols-3 gap-3 max-w-md">
                    {OPTIONS.map((o) => (
                      <button
                        key={o.key}
                        disabled={themeSaving}
                        onClick={() => chooseTheme(o.key)}
                        className={`border p-4 text-center transition disabled:opacity-50 ${current === o.key
                          ? "border-seal bg-seal/15"
                          : "border-black/20 dark:border-line bg-white dark:bg-[#1a1a1a] hover:border-seal"
                          }`}
                      >
                        <p className="font-medium text-sm text-ink dark:text-white">{o.label}</p>
                        <p className="text-xs text-mist mt-0.5">{o.hint}</p>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </section>

            {/* Notifications */}
            <section className="bg-white dark:bg-panel border border-black/10 dark:border-line p-4 sm:p-5">
              <h2 className="font-display font-semibold text-ink dark:text-white mb-3">Notifications</h2>
              <p className="text-xs text-mist">
                Platform admins receive critical alerts inline. Client-facing notification preferences are
                managed by each account under their own Settings.
              </p>
            </section>
          </div>
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
          </section>
        </div>
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
