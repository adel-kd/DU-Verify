import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Toast from "../components/Toast.jsx";
import BillingPanel from "../components/BillingPanel.jsx";

const TABS_OWNER = [
  { key: "account", label: "My Account" },
  { key: "personal", label: "Personal Information" },
  { key: "security", label: "Privacy & Security" },
  { key: "theme", label: "Theme" },
  { key: "notifications", label: "Notifications" },
  { key: "billing", label: "Billing" },
  { key: "payment-accounts", label: "Payment Accounts" },
];

const TABS_STAFF = [
  { key: "account", label: "My Account" },
  { key: "personal", label: "Personal Information" },
  { key: "security", label: "Privacy & Security" },
  { key: "theme", label: "Theme" },
  { key: "notifications", label: "Notifications" },
];

export default function Settings() {
  const { user, logout, updateWallet } = useAuth();
  const [toast, setToast] = useState(null);
  const tabs = user?.role === "owner" ? TABS_OWNER : TABS_STAFF;
  const [tab, setTab] = useState("account");

  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <TopBar duptBalance={user?.duptBalance} dark />

      <Toast
        toast={toast}
        onClose={() => setToast(null)}
      />

      <main className="flex-1 w-full max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">
            Settings
          </h1>

          <p className="text-sm text-ink/50 dark:text-mist mt-1">
            Manage your account, security, and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap text-sm font-medium rounded-lg px-3 py-1.5 transition ${tab === t.key
                ? "bg-ink text-paper"
                : "bg-white text-ink/60 dark:text-mist border border-black/10 dark:border-line"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "account" && (
          <MyAccountTab
            user={user}
            logout={logout}
          />
        )}

        {tab === "personal" && (
          <PersonalInfoTab
            user={user}
            setToast={setToast}
          />
        )}

        {tab === "security" && (
          <SecurityTab setToast={setToast} />
        )}

        {tab === "theme" && (
          <ThemeTab
            user={user}
            setToast={setToast}
          />
        )}

        {tab === "notifications" && (
          <NotificationsTab
            user={user}
            setToast={setToast}
          />
        )}

        {tab === "billing" && user?.role === "owner" && (
          <BillingTab user={user} updateWallet={updateWallet} />
        )}

        {tab === "payment-accounts" &&
          user?.role === "owner" && (
            <PaymentAccountsTab
              setToast={setToast}
            />
          )}
      </main>

      <Footer />
    </div>
  );
}

/* ============================================================
   MY ACCOUNT
============================================================ */

export function MyAccountTab({ user, logout }) {
  return (
    <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5 space-y-4">
      <h2 className="font-display font-semibold text-ink dark:text-paper">
        My Account
      </h2>

      <dl className="text-sm divide-y divide-black/5">
        <Row
          label="Business"
          value={user?.businessName}
        />

        <Row
          label="Role"
          value={
            user?.role === "owner"
              ? "Owner / Admin"
              : "Staff / Waiter"
          }
        />

        {user?.businessType && (
          <Row
            label="Business type"
            value={user.businessType.replaceAll("_", " ")}
          />
        )}

        {user?.role === "owner" && (
          <Row
            label="DU PT balance"
            value={`${user.duptBalance ?? 0} DU PT`}
          />
        )}
      </dl>

      <button
        onClick={logout}
        className="text-sm font-medium bg-alarm/10 text-alarm rounded-lg px-4 py-2"
      >
        Sign out
      </button>
    </section>
  );
}

export function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-ink/40 dark:text-mist">
        {label}
      </dt>

      <dd className="font-medium text-ink dark:text-paper capitalize">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/* ============================================================
   PERSONAL INFORMATION
============================================================ */

export function PersonalInfoTab({ user, setToast }) {
  const { updateUser } = useAuth();

  const [profile, setProfile] = useState({
    businessName: user?.businessName || "",
    ownerName: user?.ownerName || "",
    phone: user?.phone || "",
    email: user?.email || "",
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function onChange(e) {
    setProfile((p) => ({
      ...p,
      [e.target.name]: e.target.value,
    }));
  }

  async function save(e) {
    e.preventDefault();

    setErrors({});

    const errs = {};

    if (!profile.ownerName.trim()) {
      errs.ownerName = "Required";
    }

    if (!profile.phone.trim()) {
      errs.phone = "Required";
    }

    if (!profile.email.trim()) {
      errs.email = "Required";
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.patch(
        "/auth/me",
        profile
      );

      updateUser(data.user);

      setToast({
        type: "success",
        text: "Profile updated.",
      });
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update profile",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
      <h2 className="font-display font-semibold text-ink dark:text-paper mb-4">
        Personal Information
      </h2>

      <form
        onSubmit={save}
        className="space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          {user?.role === "owner" && (
            <Field
              label="Business name"
              name="businessName"
              value={profile.businessName}
              onChange={onChange}
              error={errors.businessName}
            />
          )}

          <Field
            label="Your name"
            name="ownerName"
            value={profile.ownerName}
            onChange={onChange}
            error={errors.ownerName}
          />

          <Field
            label="Phone"
            name="phone"
            value={profile.phone}
            onChange={onChange}
            error={errors.phone}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            value={profile.email}
            onChange={onChange}
            error={errors.email}
          />
        </div>

        <button
          disabled={saving}
          className="w-full sm:w-auto bg-ink text-paper font-medium rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

/* ============================================================
   PRIVACY & SECURITY
============================================================ */

export function SecurityTab({ setToast }) {
  const [pw, setPw] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function onChange(e) {
    setPw((p) => ({
      ...p,
      [e.target.name]: e.target.value,
    }));
  }

  async function save(e) {
    e.preventDefault();

    setErrors({});

    const errs = {};

    if (!pw.currentPassword) {
      errs.currentPassword = "Required";
    }

    if (
      !pw.newPassword ||
      pw.newPassword.length < 8
    ) {
      errs.newPassword = "At least 8 characters";
    }

    if (pw.newPassword !== pw.confirmPassword) {
      errs.confirmPassword = "Passwords don't match";
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSaving(true);

    try {
      await api.patch(
        "/auth/me/password",
        {
          currentPassword: pw.currentPassword,
          newPassword: pw.newPassword,
        }
      );

      setPw({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setToast({
        type: "success",
        text: "Password changed.",
      });
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not change password",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
        <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">
          Change password
        </h2>

        <p className="text-xs text-ink/40 dark:text-mist mb-4">
          Requires your current password to confirm it's
          really you.
        </p>

        <form
          onSubmit={save}
          className="space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Current password"
              name="currentPassword"
              type="password"
              value={pw.currentPassword}
              onChange={onChange}
              error={errors.currentPassword}
              full
            />

            <Field
              label="New password"
              name="newPassword"
              type="password"
              value={pw.newPassword}
              onChange={onChange}
              error={errors.newPassword}
            />

            <Field
              label="Confirm new password"
              name="confirmPassword"
              type="password"
              value={pw.confirmPassword}
              onChange={onChange}
              error={errors.confirmPassword}
            />
          </div>

          <button
            disabled={saving}
            className="w-full sm:w-auto bg-seal text-ink dark:text-paper font-semibold rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saving
              ? "Updating…"
              : "Update password"}
          </button>
        </form>
      </section>

      <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
        <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">
          Active sessions
        </h2>

        <p className="text-sm text-ink/50 dark:text-mist mt-2">
          You're currently signed in on this device.
          there's no separate device list
          to manage yet.
        </p>
      </section>
    </div>
  );
}

/* ============================================================
   THEME
============================================================ */

export function ThemeTab({ user, setToast }) {
  const { updateUser } = useAuth();

  const [saving, setSaving] = useState(false);
  const current =
    user?.themePreference || "system";

  async function choose(themePreference) {
    setSaving(true);

    try {
      const { data } = await api.patch(
        "/auth/me/preferences",
        { themePreference }
      );

      updateUser(data.user);

      setToast({
        type: "success",
        text: "Theme updated.",
      });
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update theme",
      });
    } finally {
      setSaving(false);
    }
  }

  const OPTIONS = [
    {
      key: "light",
      label: "Light",
      hint: "Always light",
    },
    {
      key: "dark",
      label: "Dark",
      hint: "Always dark",
    },
    {
      key: "system",
      label: "System",
      hint: "Match your device",
    },
  ];

  return (
    <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
      <h2 className="font-display font-semibold text-ink dark:text-white mb-4">
        Theme
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            disabled={saving}
            onClick={() => choose(o.key)}
            className={`border p-4 text-center transition disabled:opacity-50 ${current === o.key
              ? "border-seal bg-seal/15"
              : "border-black/20 dark:border-line bg-white dark:bg-[#1a1a1a] hover:border-seal"
              }`}
          >
            <p className="font-medium text-sm text-ink dark:text-white">
              {o.label}
            </p>

            <p className="text-xs text-mist mt-0.5">
              {o.hint}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   NOTIFICATIONS
============================================================ */

export function NotificationsTab({ user, setToast }) {
  const { updateUser } = useAuth();

  const [saving, setSaving] = useState(false);

  const prefs =
    user?.notificationPreferences || {
      lowBalanceAlerts: true,
      emailReceipts: true,
    };

  async function toggle(key) {
    setSaving(true);

    try {
      const { data } = await api.patch(
        "/auth/me/preferences",
        {
          notificationPreferences: {
            ...prefs,
            [key]: !prefs[key],
          },
        }
      );

      updateUser(data.user);
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update notifications",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5 space-y-4">
      <h2 className="font-display font-semibold text-ink dark:text-paper">
        Notifications
      </h2>

      <ToggleRow
        label="Low DU PT balance alerts"
        description="Show a warning banner when the business balance drops below the low-balance threshold."
        checked={prefs.lowBalanceAlerts}
        disabled={saving}
        onToggle={() =>
          toggle("lowBalanceAlerts")
        }
      />

      {/* Purchase receipts can only be generated by business
          owners, so the toggle is hidden from staff accounts. */}
      {user?.role === "owner" && (
        <ToggleRow
          label="Email receipts"
          description="Email a receipt whenever a top-up or package purchase is confirmed."
          checked={prefs.emailReceipts}
          disabled={saving}
          onToggle={() =>
            toggle("emailReceipts")
          }
        />
      )}
    </section>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onToggle,
  disabled,
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-t border-black/5 dark:border-line first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-medium text-ink dark:text-paper">
          {label}
        </p>

        <p className="text-xs text-ink/40 dark:text-mist mt-0.5">
          {description}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`w-11 h-6 rounded-full relative transition shrink-0 ${checked
          ? "bg-seal"
          : "bg-black/10"
          }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${checked
            ? "left-[22px]"
            : "left-0.5"
            }`}
        />
      </button>
    </div>
  );
}

/* ============================================================
   BILLING
============================================================ */

export function BillingTab({ user, updateWallet }) {
  return (
    <section>
      <BillingPanel
        duptBalance={user?.duptBalance ?? 0}
        showLedger
        onBalanceChange={updateWallet}
      />
    </section>
  );
}

/* ============================================================
   PAYMENT ACCOUNTS (owner only)
============================================================ */

const PROVIDERS = [
  "CBE",
  "Telebirr",
  "Dashen",
  "Abyssinia",
  "CBEBirr",
  "MPesa",
  "Awash",
];

const EMPTY_ACCOUNT_FORM = {
  provider: PROVIDERS[0],
  accountNumber: "",
  accountHolderName: "",
};

export function PaymentAccountsTab({ setToast }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(
    EMPTY_ACCOUNT_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);

    try {
      const { data } = await api.get(
        "/payment-accounts"
      );

      setAccounts(data.accounts || []);
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not load payment accounts",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function onChange(e) {
    setForm((f) => ({
      ...f,
      [e.target.name]: e.target.value,
    }));
  }

  async function addAccount(e) {
    e.preventDefault();
    setError("");

    if (!form.accountNumber.trim()) {
      setError("Account number is required");
      return;
    }

    if (!form.accountHolderName.trim()) {
      setError("Account holder name is required");
      return;
    }

    setSaving(true);

    try {
      // Do NOT send accountSuffix.
      // Backend generates it automatically.
      await api.post("/payment-accounts", {
        provider: form.provider,
        accountNumber:
          form.accountNumber.trim(),
        accountHolderName:
          form.accountHolderName.trim(),
      });

      const addedProvider = form.provider;

      setForm({
        ...EMPTY_ACCOUNT_FORM,
      });

      setToast({
        type: "success",
        text: `${addedProvider} account added.`,
      });

      await load();
    } catch (err) {
      setError(
        err.response?.data?.error ||
        "Could not add account"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(acc) {
    try {
      await api.patch(
        `/payment-accounts/${acc._id}`,
        {
          enabled: !acc.enabled,
        }
      );

      await load();
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not update account",
      });
    }
  }

  async function remove(acc) {
    try {
      await api.delete(
        `/payment-accounts/${acc._id}`
      );

      setToast({
        type: "success",
        text: `${acc.provider} account removed.`,
      });

      await load();
    } catch (err) {
      setToast({
        type: "error",
        text:
          err.response?.data?.error ||
          "Could not remove account",
      });
    }
  }

  const configuredProviders =
    accounts.map((a) => a.provider);

  return (
    <div className="space-y-6">
      {/* Existing accounts */}
      <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
        <h2 className="font-display font-semibold text-ink dark:text-paper mb-1">
          Payment Accounts
        </h2>

        <p className="text-xs text-ink/40 dark:text-mist mb-4">
          Only enabled accounts here are shown to staff
          and used to verify incoming payments. Waiters
          never need to enter these manually.
        </p>

        {loading ? (
          <p className="text-sm text-ink/40 dark:text-mist py-4">
            Loading…
          </p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-ink/40 dark:text-mist py-4">
            No payment accounts configured yet.
          </p>
        ) : (
          <div className="divide-y divide-black/5">
            {accounts.map((acc) => (
              <div
                key={acc._id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-sm text-ink dark:text-paper">
                    {acc.provider}
                  </p>

                  <p className="text-xs text-ink/50 dark:text-mist font-mono">
                    {acc.accountNumber}
                  </p>

                  <p className="text-xs text-ink/40 dark:text-mist">
                    {acc.accountHolderName}
                  </p>

                  {acc.accountSuffix && (
                    <p className="text-xs text-ink/30 dark:text-mist mt-0.5">
                      Verification suffix:{" "}
                      <span className="font-mono">
                        {acc.accountSuffix}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-semibold ${acc.enabled
                      ? "text-seal"
                      : "text-ink/30"
                      }`}
                  >
                    {acc.enabled
                      ? "ON"
                      : "OFF"}
                  </span>

                  <button
                    onClick={() =>
                      toggleEnabled(acc)
                    }
                    className="text-xs underline text-ink/50 dark:text-mist"
                  >
                    {acc.enabled
                      ? "Disable"
                      : "Enable"}
                  </button>

                  <button
                    onClick={() => remove(acc)}
                    className="text-xs text-alarm/70 hover:text-alarm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add account */}
      <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-5">
        <h2 className="font-display font-semibold text-ink dark:text-paper mb-4">
          Add payment account
        </h2>

        <form
          onSubmit={addAccount}
          className="space-y-4"
        >
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">
              Provider
            </span>

            <select
              name="provider"
              value={form.provider}
              onChange={onChange}
              className="w-full mt-1.5 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option
                  key={p}
                  value={p}
                  disabled={configuredProviders.includes(
                    p
                  )}
                >
                  {p}
                  {configuredProviders.includes(
                    p
                  )
                    ? " (already configured)"
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Account / wallet number"
              name="accountNumber"
              value={form.accountNumber}
              onChange={onChange}
            />

            <Field
              label="Account holder name"
              name="accountHolderName"
              value={form.accountHolderName}
              onChange={onChange}
            />
          </div>

          <p className="text-xs text-ink/40 dark:text-mist -mt-1">
            CBE uses the last 8 digits of the account
            number for verification. Abyssinia uses the
            last 5 digits. This is generated automatically.
          </p>

          {error && (
            <p className="text-sm text-alarm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto bg-ink text-paper font-medium rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saving
              ? "Adding…"
              : "Add account"}
          </button>
        </form>
      </section>
    </div>
  );
}

/* ============================================================
   SHARED
============================================================ */

export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  error,
  full = false,
}) {
  // Password fields get a working show/hide eye toggle.
  const [reveal, setReveal] = useState(false);

  const isPassword = type === "password";

  return (
    <label
      className={`block ${full ? "sm:col-span-2" : ""
        }`}
    >
      <span className="text-xs font-semibold tracking-wide text-mist uppercase">
        {label}
      </span>

      <div className="relative">
        <input
          name={name}
          type={isPassword && reveal ? "text" : type}
          value={value}
          onChange={onChange}
          className={`w-full mt-1.5 border px-3 py-2 text-sm bg-white dark:bg-panel text-ink dark:text-white ${error
            ? "border-alarm"
            : "border-black/15 dark:border-line"
            } ${isPassword ? "pr-10" : ""}`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/3 p-1 text-mist hover:text-white"
          >
            {reveal ? (
              <EyeOff size={16} strokeWidth={1.75} />
            ) : (
              <Eye size={16} strokeWidth={1.75} />
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