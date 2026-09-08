// pages/CompleteProfile.jsx
//
// Google sign-ups skip the normal registration form, so after
// their first login they must supply the missing details
// (phone number, business type) before entering the app.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { authenticatedLanding, developerPortalUrl, isDeveloperSurface } from "../lib/appSurface.js";
import Footer from "../components/Footer.jsx";
import StyledSelect from "../components/StyledSelect.jsx";

export default function CompleteProfile() {
  const { user, updateUser } = useAuth();
  const nav = useNavigate();

  const [businessTypes, setBusinessTypes] = useState([]);
  const [businessType, setBusinessType] = useState("");
  const [businessName, setBusinessName] = useState(() => user?.businessName || "");
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

      const completedUser = { ...user, ...data.user, profileComplete: true };
      const developerIntent =
        new URLSearchParams(window.location.search).get("surface") === "developer" ||
        sessionStorage.getItem("developer_signup") === "1";

      if (developerIntent && !isDeveloperSurface) {
        window.location.replace(`${developerPortalUrl}/developers`);
        return;
      }

      nav(developerIntent ? "/developers" : authenticatedLanding(completedUser), { replace: true });
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
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name"
            className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
          />

          <StyledSelect
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            required
            ariaLabel="Business type"
            placeholder="What kind of business is this?"
            className="w-full"
            options={businessTypes.map((type) => ({ value: type.key, label: type.label }))}
          />

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
