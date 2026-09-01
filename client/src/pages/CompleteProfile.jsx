// pages/CompleteProfile.jsx
//
// Google sign-ups skip the normal registration form, so after
// their first login they must supply the missing details
// (phone number, business type) before entering the app.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import Footer from "../components/Footer.jsx";

export default function CompleteProfile() {
  const { user, updateUser } = useAuth();
  const nav = useNavigate();

  const [businessTypes, setBusinessTypes] = useState([]);
  const [businessType, setBusinessType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/auth/business-types")
      .then(({ data }) => setBusinessTypes(data.businessTypes || []))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!businessType) {
      setError("Please select what kind of business this is");
      return;
    }

    setBusy(true);

    try {
      const { data } = await api.patch("/auth/complete-profile", {
        phone,
        businessType,
        businessName,
      });

      updateUser(data.user);

      nav("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Could not save your details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-ink text-ink dark:text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="w-full max-w-sm border border-black/15 dark:border-line p-8 space-y-4"
        >
          <h1 className="font-display text-lg font-semibold">
            Complete your profile
          </h1>
          <p className="text-sm text-mist">
            Signed in as {user?.email}. We just need a few more details.
          </p>

          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
          />

          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name"
            className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
          />

          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            required
            className="w-full border border-black/20 dark:border-line bg-white dark:bg-panel px-3 py-2.5 text-sm"
          >
            <option value="" disabled>
              What kind of business is this?
            </option>
            {businessTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>

          {error && <p className="text-sm text-alarm">{error}</p>}

          <button
            disabled={busy}
            className="w-full bg-seal text-white font-semibold py-2.5 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>

      <Footer />
    </div>
  );
}
