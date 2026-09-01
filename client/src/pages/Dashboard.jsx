import { useEffect, useState } from "react";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import Toast from "../components/Toast.jsx";
import BillingPanel from "../components/BillingPanel.jsx";

const STATUS_STYLE = {
  VALID: "bg-seal/10 text-sealDark",
  ALREADY_USED: "bg-alarm/10 text-alarm",
  OCR_FAILED: "bg-black/5 text-ink/50 dark:text-mist",
  AMOUNT_MISMATCH: "bg-flag/15 text-flag",
  RECEIVER_MISMATCH: "bg-flag/15 text-flag",
  NOT_VERIFIED: "bg-black/5 text-ink/50 dark:text-mist",
  PROVIDER_ERROR: "bg-alarm/10 text-alarm",
  INVALID_FORMAT: "bg-alarm/10 text-alarm",
};

const EMPTY_STAFF_FORM = { ownerName: "", phone: "", email: "", password: "" };

export default function Dashboard() {
  const { user, updateWallet } = useAuth();
  const [stats, setStats] = useState({ duptBalance: 0, totalChecks: 0, validChecks: 0 });
  const [income, setIncome] = useState({ daily: 0, weekly: 0, monthly: 0 });
  const [logs, setLogs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");

  const [toast, setToast] = useState(null);

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [staffErrors, setStaffErrors] = useState({});
  const [staffSaving, setStaffSaving] = useState(false);

  const [topUpModalOpen, setTopUpModalOpen] = useState(false);

  // Load all data
  async function loadStats() {
    const { data } = await api.get("/billing/balance");
    setStats(data);
    updateWallet(data.duptBalance);
  }

  async function loadIncome() {
    const { data } = await api.get("/staff/income-stats");
    setIncome(data);
  }

  async function loadLogs() {
    const { data } = await api.get("/verify/history", { params: statusFilter ? { status: statusFilter } : {} });
    setLogs(data.items || []);
  }

  async function loadStaff() {
    const { data } = await api.get("/staff");
    setStaff(data.staff || []);
  }

  useEffect(() => {
    loadStats();
    loadIncome();
    loadStaff();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [statusFilter]);

  // Toggle staff status
  async function toggleStaff(id) {
    try {
      await api.patch(`/staff/${id}/toggle`);
      loadStaff();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not update staff account" });
    }
  }

  // Add staff — inline modal form instead of window.prompt()
  function openStaffModal() {
    setStaffForm(EMPTY_STAFF_FORM);
    setStaffErrors({});
    setStaffModalOpen(true);
  }

  function onStaffFieldChange(e) {
    setStaffForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function submitStaff(e) {
    e.preventDefault();
    const errors = {};
    if (!staffForm.ownerName.trim()) errors.ownerName = "Required";
    if (!staffForm.phone.trim()) errors.phone = "Required";
    if (!staffForm.email.trim()) errors.email = "Required";
    if (!staffForm.password || staffForm.password.length < 6) errors.password = "At least 6 characters";
    if (Object.keys(errors).length) {
      setStaffErrors(errors);
      return;
    }

    setStaffSaving(true);
    try {
      await api.post("/staff", staffForm);
      setStaffModalOpen(false);
      setToast({ type: "success", text: `${staffForm.ownerName} added as staff.` });
      loadStaff();
    } catch (err) {
      setToast({ type: "error", text: err.response?.data?.error || "Could not create staff account" });
    } finally {
      setStaffSaving(false);
    }
  }

  // Top‑up: opens a modal containing the shared BillingPanel (custom
  // top-up + discounted packages), which handles the Chapa redirect itself.
  function openTopUpModal() {
    setTopUpModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <TopBar duptBalance={stats.duptBalance} dark />
      <Toast toast={toast} onClose={() => setToast(null)} />

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {/* ---- Hero Logo + Brand ---- */}
        <div className="flex flex-col items-center justify-center py-4">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-paper mt-2">DU Verify</h1>
          <p className="text-ink/50 dark:text-mist text-sm text-center">Your Trusted Digital Verification Ecosystem</p>
        </div>

        {/* Low balance alert */}
        {stats.lowBalance && (
          <div className="bg-alarm/10 border border-alarm/30 text-alarm rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm font-medium">
              ⚠️ Low balance — {stats.duptBalance} DU PT left (alert threshold: {stats.lowBalanceThreshold} DU PT).
              Top up soon to avoid interrupting staff verifications.
            </p>
            <button
              onClick={openTopUpModal}
              className="text-xs font-semibold bg-alarm text-white rounded-lg px-3 py-1.5 whitespace-nowrap"
            >
              Top up now
            </button>
          </div>
        )}

        {/* Overview & Top‑up button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">Overview</h1>
          <button
            onClick={openTopUpModal}
            className="bg-ink text-paper text-sm font-medium rounded-lg px-4 py-2 w-full sm:w-auto"
          >
            + Top up DU PT
          </button>
        </div>

        {/* Stats Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total checks" value={stats.totalChecks} />
          <StatCard label="Valid" value={stats.validChecks} accent="text-seal" />
          <StatCard label="Blocked / used / failed" value={stats.totalChecks - stats.validChecks} accent="text-alarm" />
        </section>

        {/* Income Stats Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Today's income" value={`${income.daily} ETB`} accent="text-seal" />
          <StatCard label="This week" value={`${income.weekly} ETB`} accent="text-seal" />
          <StatCard label="This month" value={`${income.monthly} ETB`} accent="text-seal" />
        </section>

        {/* Verification Logs Table */}
        <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="font-display font-semibold text-ink dark:text-paper">Recent verification logs</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-black/10 dark:border-line rounded-lg text-sm px-2 py-1.5 w-full sm:w-auto"
            >
              <option value="">All statuses</option>
              <option value="VALID">Valid</option>
              <option value="ALREADY_USED">Already used</option>
              <option value="OCR_FAILED">OCR failed</option>
              <option value="AMOUNT_MISMATCH">Amount mismatch</option>
              <option value="RECEIVER_MISMATCH">Receiver mismatch</option>
              <option value="NOT_VERIFIED">Not verified</option>
              <option value="PROVIDER_ERROR">Provider error</option>
            </select>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                <tr>
                  <th className="py-2 font-medium">Checked at</th>
                  <th className="font-medium">Paid at</th>
                  <th className="font-medium">Staff</th>
                  <th className="font-medium">Bank</th>
                  <th className="font-medium">Reference</th>
                  <th className="font-medium">From → To</th>
                  <th className="font-medium">Amount</th>
                  <th className="font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-ink/30">No verifications yet</td></tr>
                )}
                {logs.map((v) => (
                  <tr key={v._id} className="border-b border-black/5 dark:border-line last:border-0">
                    <td className="py-2.5">{new Date(v.checkedAt).toLocaleTimeString()}</td>
                    <td className={v.transactionTime ? "" : "text-ink/30"}>
                      {v.transactionTime
                        ? new Date(v.transactionTime).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td>{v.checkedBy?.ownerName ?? "—"}</td>
                    <td>{v.bankName}</td>
                    <td className="font-mono text-xs">{v.transactionRef}</td>
                    <td className="text-xs">{v.senderName || "—"} → {v.receiverName || "—"}</td>
                    <td>{v.amount} ETB</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[v.status] || "bg-black/5"}`}>
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Staff Accounts */}
        <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="font-display font-semibold text-ink dark:text-paper">Staff accounts</h2>
            <button onClick={openStaffModal} className="text-sm bg-seal text-ink dark:text-paper font-medium rounded-lg px-3 py-1.5 whitespace-nowrap">
              + Add staff
            </button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                <tr>
                  <th className="py-2 font-medium">Name</th>
                  <th className="font-medium">Email</th>
                  <th className="font-medium">Phone</th>
                  <th className="font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-ink/30">No staff yet</td></tr>
                )}
                {staff.map((s) => (
                  <tr key={s._id} className="border-b border-black/5 dark:border-line last:border-0">
                    <td className="py-2.5">{s.ownerName}</td>
                    <td>{s.email}</td>
                    <td>{s.phone}</td>
                    <td>
                      <span className={s.isActive ? "text-seal" : "text-alarm"}>{s.isActive ? "Active" : "Disabled"}</span>
                    </td>
                    <td>
                      <button onClick={() => toggleStaff(s._id)} className="text-xs underline text-ink/50 dark:text-mist">
                        {s.isActive ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Footer />

      {/* Add staff modal */}
      <Modal open={staffModalOpen} title="Add staff account" onClose={() => setStaffModalOpen(false)}>
        <form onSubmit={submitStaff} className="space-y-3">
          <ModalField label="Staff name" name="ownerName" value={staffForm.ownerName} onChange={onStaffFieldChange} error={staffErrors.ownerName} />
          <ModalField label="Phone" name="phone" value={staffForm.phone} onChange={onStaffFieldChange} error={staffErrors.phone} />
          <ModalField label="Email" name="email" type="email" value={staffForm.email} onChange={onStaffFieldChange} error={staffErrors.email} />
          <ModalField label="Temporary password" name="password" type="password" value={staffForm.password} onChange={onStaffFieldChange} error={staffErrors.password} />
          <button
            disabled={staffSaving}
            className="w-full bg-seal text-ink dark:text-paper font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50"
          >
            {staffSaving ? "Creating…" : "Create staff account"}
          </button>
        </form>
      </Modal>

      {/* Top-up modal */}
      <Modal open={topUpModalOpen} title="Top up DU PT" onClose={() => setTopUpModalOpen(false)}>
        <BillingPanel duptBalance={stats.duptBalance} />
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

function ModalField({ label, name, value, onChange, type = "text", error }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className={`w-full mt-1.5 border rounded-lg px-3 py-2 text-sm ${error ? "border-alarm" : "border-black/10 dark:border-line"}`}
      />
      {error && <span className="text-xs text-alarm mt-1 block">{error}</span>}
    </label>
  );
}
