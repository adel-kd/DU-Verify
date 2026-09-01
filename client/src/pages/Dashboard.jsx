import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { BarChart, LineChart, SplitBar } from "../components/Charts.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import UnverifiedNotice from "../components/UnverifiedNotice.jsx";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import Toast from "../components/Toast.jsx";
import BillingPanel from "../components/BillingPanel.jsx";
import {
  MyAccountTab,
  PersonalInfoTab,
  SecurityTab,
  ThemeTab,
  NotificationsTab,
  BillingTab,
  PaymentAccountsTab,
} from "./Settings.jsx";

const STATUS_STYLE = {
  VALID: "bg-seal/10 text-sealDark",
  ALREADY_USED: "bg-alarm/10 text-alarm",
  OCR_FAILED: "bg-black/5 text-ink/50 dark:text-mist",
  AMOUNT_MISMATCH: "bg-flag/15 text-flag",
  RECEIVER_MISMATCH: "bg-flag/15 text-flag",
  NOT_VERIFIED: "bg-black/5 text-ink/50 dark:text-mist",
  PROVIDER_UNAVAILABLE: "bg-black/10 text-ink/70 dark:text-mist",
  PROVIDER_ERROR: "bg-black/10 text-ink/70 dark:text-mist",
  INVALID_FORMAT: "bg-alarm/10 text-alarm",
};

/*
 * Staff only use phone numbers.
 *
 * Phone format:
 * +251XXXXXXXXX
 * +251 + exactly 9 digits
 */
const EMPTY_STAFF_FORM = {
  ownerName: "",
  phone: "+251",
  password: "",
};

// Sidebar/shutter-card navigation — every client-facing feature lives
// here now, replacing the old standalone /settings page for owners.
const SECTIONS = [
  {
    key: "Overview",
    label: "Overview",
    description: "Checks, income, and staff at a glance.",
  },
  {
    key: "Account",
    label: "My Account",
    description: "Business, role, and balance summary.",
  },
  {
    key: "Personal Info",
    label: "Personal Information",
    description: "Business name, your name, contact details.",
  },
  {
    key: "Security",
    label: "Privacy & Security",
    description: "Password and sessions.",
  },
  {
    key: "Theme",
    label: "Theme",
    description: "Light, dark, or system.",
  },
  {
    key: "Notifications",
    label: "Notifications",
    description: "Balance alerts and receipt emails.",
  },
  {
    key: "Billing",
    label: "Billing",
    description: "Top up and review the ledger.",
  },
  {
    key: "Payment Accounts",
    label: "Payment Accounts",
    description: "Bank/wallet accounts checks are matched against.",
  },
];

export default function Dashboard() {
  const { user, logout, updateWallet, updateUser } = useAuth();

  const [tab, setTab] = useState("Overview");

  const [stats, setStats] = useState({
    duptBalance: 0,
    totalChecks: 0,
    validChecks: 0,
  });

  const [income, setIncome] = useState({
    daily: 0,
    weekly: 0,
    monthly: 0,
  });

  const [logs, setLogs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");

  const [toast, setToast] = useState(null);

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [staffErrors, setStaffErrors] = useState({});
  const [staffSaving, setStaffSaving] = useState(false);

  const [topUpModalOpen, setTopUpModalOpen] = useState(false);

  // "solo" (owner verifies receipts themselves) vs "team" (staff verify
  // instead of the owner). Chosen at registration; switchable below.
  const accountMode = user?.accountMode || "solo";
  const [accountModeSaving, setAccountModeSaving] = useState(false);

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
    const { data } = await api.get("/verify/history", {
      params: statusFilter ? { status: statusFilter } : {},
    });

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

  // Chapa returns to the dashboard, not to the top-up modal. Confirm the
  // transaction here so the balance update and receipt-email notice are not
  // skipped because the modal is closed after the redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    const txRef = params.get("tx_ref");

    if (
      !txRef ||
      (topupStatus !== "success" && topupStatus !== "pending")
    ) {
      return;
    }

    let cancelled = false;

    async function confirmReturnedTopup() {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const { data } = await api.post(
            `/billing/confirm/${encodeURIComponent(txRef)}`
          );

          if (cancelled) return;

          const balance = data.duptBalance ?? 0;

          setStats((current) => ({
            ...current,
            duptBalance: balance,
          }));

          updateWallet(balance);

          setToast({
            type: "success",
            text: "Top-up successful. A receipt has been sent to your registered email address.",
          });

          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          return;
        } catch (err) {
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      if (!cancelled) {
        setToast({
          type: "error",
          text: "Payment is still being confirmed. Please refresh shortly.",
        });
      }
    }

    confirmReturnedTopup();

    return () => {
      cancelled = true;
    };
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
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update staff account",
      });
    }
  }

  function openStaffModal() {
    setStaffForm({
      ...EMPTY_STAFF_FORM,
    });

    setStaffErrors({});
    setStaffModalOpen(true);
  }

  /*
   * Staff phone input
   *
   * The user can ONLY enter numbers after +251.
   *
   * Example:
   * +251
   * +2519
   * +251911234567
   *
   * Maximum:
   * +251 + 9 digits
   */
  function onStaffFieldChange(e) {
    const { name, value } = e.target;

    if (name === "phone") {
      // Remove everything except digits.
      const digitsOnly = value.replace(/\D/g, "");

      // If the value already contains 251, remove the country code.
      let localDigits = digitsOnly;

      if (localDigits.startsWith("251")) {
        localDigits = localDigits.slice(3);
      }

      // Only allow the first 9 digits after +251.
      localDigits = localDigits.slice(0, 9);

      setStaffForm((current) => ({
        ...current,
        phone: `+251${localDigits}`,
      }));

      // Clear the phone error while the user is correcting it.
      setStaffErrors((current) => ({
        ...current,
        phone: undefined,
      }));

      return;
    }

    setStaffForm((current) => ({
      ...current,
      [name]: value,
    }));

    // Clear field error when user starts correcting it.
    setStaffErrors((current) => ({
      ...current,
      [name]: undefined,
    }));
  }

  async function submitStaff(e) {
    e.preventDefault();

    const errors = {};

    if (!staffForm.ownerName.trim()) {
      errors.ownerName = "Required";
    }

    /*
     * Strict Ethiopian international format:
     *
     * +251
     * followed by exactly 9 numbers
     *
     * Example:
     * +251911234567
     */
    if (!/^\+251\d{9}$/.test(staffForm.phone)) {
      errors.phone =
        "Enter a valid phone number: +251 followed by 9 digits";
    }

    if (!staffForm.password || staffForm.password.length < 6) {
      errors.password = "At least 6 characters";
    }

    if (Object.keys(errors).length) {
      setStaffErrors(errors);
      return;
    }

    setStaffSaving(true);

    try {
      await api.post("/staff", {
        ownerName: staffForm.ownerName.trim(),
        phone: staffForm.phone,
        password: staffForm.password,
      });

      setStaffModalOpen(false);

      setToast({
        type: "success",
        text: `${staffForm.ownerName} added as staff.`,
      });

      loadStaff();
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not create staff account",
      });
    } finally {
      setStaffSaving(false);
    }
  }

  function openTopUpModal() {
    setTopUpModalOpen(true);
  }

  async function switchAccountMode(nextMode) {
    setAccountModeSaving(true);

    try {
      const { data } = await api.patch(
        "/auth/me/account-mode",
        {
          accountMode: nextMode,
        }
      );

      updateUser({
        accountMode: data.user.accountMode,
      });

      setToast({
        type: "success",
        text: data.message || "Account mode updated.",
      });
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update account mode",
      });
    } finally {
      setAccountModeSaving(false);
    }
  }

  return (
    <div className="h-screen bg-paper dark:bg-ink flex flex-col overflow-hidden">
      <TopBar duptBalance={stats.duptBalance} dark />

      <Toast
        toast={toast}
        onClose={() => setToast(null)}
      />

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 p-4 overflow-hidden">

        {/* SIDEBAR — shutter-card navigation */}
        <aside className="overflow-y-auto pr-1 space-y-1.5 hidden lg:block">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`w-full text-left rounded-2xl border p-3 transition ${
                tab === s.key
                  ? "border-seal bg-seal/10"
                  : "border-black/10 dark:border-line bg-white dark:bg-panel hover:border-seal/40"
              }`}
            >
              <p className="font-medium text-sm text-ink dark:text-paper">
                {s.label}
              </p>

              <p className="text-xs text-ink/45 dark:text-mist mt-0.5">
                {s.description}
              </p>
            </button>
          ))}
        </aside>

        {/* Mobile tab bar */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`whitespace-nowrap text-sm font-medium rounded-lg px-3 py-1.5 transition ${
                tab === s.key
                  ? "bg-ink text-paper"
                  : "bg-white text-ink/60 dark:text-mist border border-black/10 dark:border-line"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto pr-1 space-y-4">

          {/* Email verification gate */}
          <UnverifiedNotice />

          {/* Admin announcements */}
          <AnnouncementBanner />

          {tab === "Overview" && (
            <>
              {/* Low balance alert */}
              {stats.lowBalance && (
                <div className="bg-alarm/10 border border-alarm/30 text-alarm px-4 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm font-medium">
                    Low balance — {stats.duptBalance} DU PT left
                    (alert threshold: {stats.lowBalanceThreshold} DU PT).
                    Top up soon to avoid interrupting staff verifications.
                  </p>

                  <button
                    onClick={openTopUpModal}
                    className="text-xs font-semibold bg-alarm text-white px-3 py-1.5 rounded-lg whitespace-nowrap"
                  >
                    Top up now
                  </button>
                </div>
              )}

              {/* Overview Header & Top-up action */}
              <div
                id="overview"
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">
                    Dashboard Overview
                  </h1>

                  <p className="text-mist text-xs">
                    Real-time ecosystem oversight and telemetry.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {accountMode === "solo" && (
                    <Link
                      to="/verify"
                      className="bg-seal text-ink dark:text-paper text-sm font-medium rounded-xl px-4 py-2 w-full sm:w-auto text-center shadow-sm hover:opacity-90 transition-opacity"
                    >
                      Run a check
                    </Link>
                  )}

                  <button
                    onClick={openTopUpModal}
                    className="bg-ink dark:bg-white text-paper dark:text-ink text-sm font-medium rounded-xl px-4 py-2 w-full sm:w-auto shadow-sm hover:opacity-90 transition-opacity"
                  >
                    + Top up DU PT
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">

                {/* Stats Cards Row */}
                <section className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                  <StatCard
                    label="Total checks"
                    value={stats.totalChecks}
                  />

                  <StatCard
                    label="Valid"
                    value={stats.validChecks}
                    accent="text-seal"
                  />

                  <StatCard
                    label="Blocked / used / failed"
                    value={stats.totalChecks - stats.validChecks}
                    accent="text-alarm"
                  />
                </section>

                {/* Verification outcomes */}
                <div className="col-span-12 lg:col-span-6 bg-white dark:bg-[#0A0A0A] rounded-3xl border border-black/5 dark:border-white/5 p-5 relative overflow-hidden transition-all duration-300 hover:border-seal/30 dark:hover:border-seal/30 hover:shadow-[0_0_30px_rgba(18,167,131,0.15)] group">
                  <div className="absolute -inset-4 bg-gradient-to-br from-seal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl blur-xl pointer-events-none" />

                  <div className="relative z-10">
                    <h2 className="font-display text-sm font-semibold text-ink dark:text-white mb-4">
                      Verification outcomes
                    </h2>

                    <BarChart
                      data={[
                        {
                          label: "Valid",
                          value: stats.validChecks,
                          color: "#12A783",
                        },
                        {
                          label: "Failed",
                          value: Math.max(
                            0,
                            stats.totalChecks - stats.validChecks
                          ),
                          color: "#D5573B",
                        },
                      ]}
                    />

                    <div className="mt-5">
                      <SplitBar
                        segments={[
                          {
                            label: "Valid",
                            value: stats.validChecks,
                            color: "#12A783",
                          },
                          {
                            label: "Not valid",
                            value: Math.max(
                              0,
                              stats.totalChecks - stats.validChecks
                            ),
                            color: "#D5573B",
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Income */}
                <div className="col-span-12 lg:col-span-6 bg-white dark:bg-[#0A0A0A] rounded-3xl border border-black/5 dark:border-white/5 p-5 relative overflow-hidden transition-all duration-300 hover:border-seal/30 dark:hover:border-seal/30 hover:shadow-[0_0_30px_rgba(18,167,131,0.15)] group">
                  <div className="absolute -inset-4 bg-gradient-to-br from-seal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl blur-xl pointer-events-none" />

                  <div className="relative z-10">
                    <h2 className="font-display text-sm font-semibold text-ink dark:text-white mb-4">
                      Income (ETB)
                    </h2>

                    <LineChart
                      data={[
                        {
                          label: "Today",
                          value: income.daily,
                        },
                        {
                          label: "Week",
                          value: income.weekly,
                        },
                        {
                          label: "Month",
                          value: income.monthly,
                        },
                      ]}
                      unit=" ETB"
                    />
                  </div>
                </div>

                {/* Income Stats Cards */}
                <section className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                  <StatCard
                    label="Today's income"
                    value={`${income.daily} ETB`}
                    accent="text-seal"
                  />

                  <StatCard
                    label="This week"
                    value={`${income.weekly} ETB`}
                    accent="text-seal"
                  />

                  <StatCard
                    label="This month"
                    value={`${income.monthly} ETB`}
                    accent="text-seal"
                  />
                </section>

                {/* Verification Logs Table */}
                <section
                  id="logs"
                  className="col-span-12 bg-white dark:bg-[#0A0A0A] rounded-3xl border border-black/5 dark:border-white/5 p-5 relative overflow-hidden transition-all duration-300 hover:border-seal/30 dark:hover:border-seal/30 hover:shadow-[0_0_30px_rgba(18,167,131,0.15)] group"
                >
                  <div className="absolute -inset-4 bg-gradient-to-br from-seal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl blur-xl pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <h2 className="font-display font-semibold text-ink dark:text-white">
                        Recent verification logs
                      </h2>

                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border border-black/20 dark:border-line text-sm rounded-xl px-3 py-1.5 w-full sm:w-auto bg-white dark:bg-[#1a1a1a] text-ink dark:text-white"
                      >
                        <option value="">All statuses</option>
                        <option value="VALID">Valid</option>
                        <option value="ALREADY_USED">Already used</option>
                        <option value="OCR_FAILED">OCR failed</option>
                        <option value="AMOUNT_MISMATCH">Amount mismatch</option>
                        <option value="RECEIVER_MISMATCH">Receiver mismatch</option>
                        <option value="NOT_VERIFIED">Not verified</option>
                        <option value="PROVIDER_UNAVAILABLE">
                          Provider unavailable
                        </option>
                        <option value="PROVIDER_ERROR">
                          Provider error
                        </option>
                      </select>
                    </div>

                    <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                          <tr>
                            <th className="py-2 font-medium">
                              Checked at
                            </th>
                            <th className="font-medium">
                              Paid at
                            </th>
                            <th className="font-medium">
                              Staff
                            </th>
                            <th className="font-medium">
                              Bank
                            </th>
                            <th className="font-medium">
                              Reference
                            </th>
                            <th className="font-medium">
                              From → To
                            </th>
                            <th className="font-medium">
                              Amount
                            </th>
                            <th className="font-medium">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {logs.length === 0 && (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-6 text-center text-ink/30"
                              >
                                No verifications yet
                              </td>
                            </tr>
                          )}

                          {logs.map((v) => (
                            <tr
                              key={v._id}
                              className="border-b border-black/5 dark:border-line last:border-0"
                            >
                              <td className="py-2.5">
                                {new Date(
                                  v.checkedAt
                                ).toLocaleTimeString()}
                              </td>

                              <td
                                className={
                                  v.transactionTime
                                    ? ""
                                    : "text-ink/30"
                                }
                              >
                                {v.transactionTime
                                  ? new Date(
                                      v.transactionTime
                                    ).toLocaleString("en-GB", {
                                      day: "2-digit",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </td>

                              <td>
                                {v.checkedBy?.ownerName ?? "—"}
                              </td>

                              <td>{v.bankName}</td>

                              <td className="font-mono text-xs">
                                {v.transactionRef}
                              </td>

                              <td className="text-xs">
                                {v.senderName || "—"} →{" "}
                                {v.receiverName || "—"}
                              </td>

                              <td>{v.amount} ETB</td>

                              <td>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    STATUS_STYLE[v.status] ||
                                    "bg-black/5"
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                {/* Staff Accounts Table */}
                <section
                  id="staff"
                  className="col-span-12 bg-white dark:bg-[#0A0A0A] rounded-3xl border border-black/5 dark:border-white/5 p-5 relative overflow-hidden transition-all duration-300 hover:border-seal/30 dark:hover:border-seal/30 hover:shadow-[0_0_30px_rgba(18,167,131,0.15)] group"
                >
                  <div className="absolute -inset-4 bg-gradient-to-br from-seal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl blur-xl pointer-events-none" />

                  <div className="relative z-10">
                    {accountMode === "solo" ? (
                      <>
                        <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">
                          Staff accounts
                        </h2>

                        <p className="text-sm text-ink/50 dark:text-mist mb-4">
                          You're set up to verify receipts yourself.
                          Upgrade to Pro to add staff who can verify
                          receipts on your behalf instead of you.
                        </p>

                        <button
                          onClick={() =>
                            switchAccountMode("team")
                          }
                          disabled={accountModeSaving}
                          className="text-sm bg-seal text-ink dark:text-paper font-medium rounded-xl px-4 py-2 disabled:opacity-50"
                        >
                          {accountModeSaving
                            ? "Upgrading…"
                            : "Upgrade to Pro — add staff"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4 gap-3">
                          <h2 className="font-display font-semibold text-ink dark:text-paper">
                            Staff accounts
                          </h2>

                          <button
                            onClick={openStaffModal}
                            className="text-sm bg-seal text-ink dark:text-paper font-medium rounded-xl px-3 py-1.5 whitespace-nowrap"
                          >
                            + Add staff
                          </button>
                        </div>

                        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                          <table className="w-full text-sm min-w-[460px]">
                            <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">
                              <tr>
                                <th className="py-2 font-medium">
                                  Name
                                </th>

                                <th className="font-medium">
                                  Phone
                                </th>

                                <th className="font-medium">
                                  Status
                                </th>

                                <th />
                              </tr>
                            </thead>

                            <tbody>
                              {staff.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="py-6 text-center text-ink/30"
                                  >
                                    No staff yet
                                  </td>
                                </tr>
                              )}

                              {staff.map((s) => (
                                <tr
                                  key={s._id}
                                  className="border-b border-black/5 dark:border-line last:border-0"
                                >
                                  <td className="py-2.5">
                                    {s.ownerName}
                                  </td>

                                  <td>
                                    {s.phone || "—"}
                                  </td>

                                  <td>
                                    <span
                                      className={
                                        s.isActive
                                          ? "text-seal"
                                          : "text-alarm"
                                      }
                                    >
                                      {s.isActive
                                        ? "Active"
                                        : "Disabled"}
                                    </span>
                                  </td>

                                  <td>
                                    <button
                                      onClick={() =>
                                        toggleStaff(s._id)
                                      }
                                      className="text-xs underline text-ink/50 dark:text-mist"
                                    >
                                      {s.isActive
                                        ? "Disable"
                                        : "Enable"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {staff.every((s) => !s.isActive) && (
                          <button
                            onClick={() =>
                              switchAccountMode("solo")
                            }
                            disabled={accountModeSaving}
                            className="text-xs underline text-ink/40 dark:text-mist mt-3 disabled:opacity-50"
                          >
                            {accountModeSaving
                              ? "Switching…"
                              : "Switch back to verifying receipts yourself"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === "Account" && (
            <MyAccountTab
              user={user}
              logout={logout}
            />
          )}

          {tab === "Personal Info" && (
            <PersonalInfoTab
              user={user}
              setToast={setToast}
            />
          )}

          {tab === "Security" && (
            <SecurityTab setToast={setToast} />
          )}

          {tab === "Theme" && (
            <ThemeTab
              user={user}
              setToast={setToast}
            />
          )}

          {tab === "Notifications" && (
            <NotificationsTab
              user={user}
              setToast={setToast}
            />
          )}

          {tab === "Billing" && (
            <BillingTab
              user={user}
              updateWallet={(bal) => {
                setStats((s) => ({
                  ...s,
                  duptBalance: bal,
                }));

                updateWallet(bal);
              }}
            />
          )}

          {tab === "Payment Accounts" && (
            <PaymentAccountsTab
              setToast={setToast}
            />
          )}
        </div>
      </main>

      <Footer />

      {/* Add staff modal */}
      <Modal
        open={staffModalOpen}
        title="Add staff account"
        onClose={() => setStaffModalOpen(false)}
      >
        <form
          onSubmit={submitStaff}
          className="space-y-3"
        >
          <ModalField
            label="Staff name"
            name="ownerName"
            value={staffForm.ownerName}
            onChange={onStaffFieldChange}
            error={staffErrors.ownerName}
          />

          <ModalField
            label="Phone number"
            name="phone"
            value={staffForm.phone}
            onChange={onStaffFieldChange}
            error={staffErrors.phone}
            inputMode="numeric"
            maxLength={13}
            placeholder="+2519XXXXXXXX"
          />

          <p className="text-[11px] text-ink/40 dark:text-mist -mt-1">
            Enter 9 digits after +251.
            Example: +251911234567
          </p>

          <ModalField
            label="Temporary password"
            name="password"
            type="password"
            value={staffForm.password}
            onChange={onStaffFieldChange}
            error={staffErrors.password}
          />

          <button
            type="submit"
            disabled={staffSaving}
            className="w-full bg-seal text-ink dark:text-paper font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50"
          >
            {staffSaving
              ? "Creating…"
              : "Create staff account"}
          </button>
        </form>
      </Modal>

      {/* Top-up modal */}
      <Modal
        open={topUpModalOpen}
        title="Top up DU PT"
        onClose={() => setTopUpModalOpen(false)}
      >
        <BillingPanel
          duptBalance={stats.duptBalance}
          onBalanceChange={(bal) => {
            // Keep the dashboard's own stats card AND the shared
            // AuthContext (TopBar, everywhere else) in sync once Chapa's
            // callback/webhook has actually credited the wallet.
            setStats((s) => ({
              ...s,
              duptBalance: bal,
            }));

            updateWallet(bal);
          }}
        />
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "text-ink dark:text-paper",
}) {
  return (
    <div className="bg-white dark:bg-[#0A0A0A] rounded-3xl border border-black/5 dark:border-white/5 p-5 relative overflow-hidden transition-all duration-300 hover:border-seal/30 dark:hover:border-seal/30 hover:shadow-[0_0_30px_rgba(18,167,131,0.15)] group">
      <div className="absolute -inset-4 bg-gradient-to-br from-seal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl blur-xl pointer-events-none" />

      <div className="relative z-10">
        <p className="text-xs text-ink/40 dark:text-mist uppercase tracking-wide font-medium">
          {label}
        </p>

        <p
          className={`font-display text-2xl sm:text-3xl font-semibold mt-2 ${accent}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ModalField({
  label,
  name,
  value,
  onChange,
  type = "text",
  error,
  inputMode,
  maxLength,
  placeholder,
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-mist uppercase">
        {label}
      </span>

      <div className="relative">
        <input
          name={name}
          type={
            isPassword && reveal
              ? "text"
              : type
          }
          value={value}
          onChange={onChange}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          className={`w-full mt-1.5 border px-3 py-2 text-sm rounded-xl ${
            error
              ? "border-alarm"
              : "border-black/15 dark:border-line"
          } ${
            isPassword ? "pr-10" : ""
          } bg-white dark:bg-[#121212] text-ink dark:text-white`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() =>
              setReveal((v) => !v)
            }
            aria-label={
              reveal
                ? "Hide password"
                : "Show password"
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-mist hover:text-white"
          >
            {reveal ? (
              <EyeOff
                size={16}
                strokeWidth={1.75}
              />
            ) : (
              <Eye
                size={16}
                strokeWidth={1.75}
              />
            )}
          </button>
        )}
      </div>

      {error && (
        <span className="text-xs text-alarm mt-1 block">
          {error}
        </span>
      )}
    </label>
  );
}