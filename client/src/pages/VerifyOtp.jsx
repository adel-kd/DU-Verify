// pages/VerifyOtp.jsx
//
// Email OTP confirmation screen. Owners must enter the 6-digit
// code emailed to them before any protected route unlocks.

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import Footer from "../components/Footer.jsx";

export default function VerifyOtp() {
  const { state } = useLocation();
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState(state?.email || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const { data } = await api.post("/auth/verify-otp", { email, otp });

      login(data.token, data.user);

      nav(
        data.user.role === "admin"
          ? "/admin"
          : data.user.role === "owner"
            ? "/dashboard"
            : "/verify",
        { replace: true }
      );
    } catch (err) {
      setError(err.response?.data?.error || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    setBusy(true);

    try {
      const { data } = await api.post("/auth/resend-verification", { email });
      setInfo(data.message || "A new code was sent.");
    } catch (err) {
      setError(err.response?.data?.error || "Could not resend code");
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
          <h1 className="font-display text-lg font-semibold">Verify your email</h1>
          <p className="text-sm text-mist">
            Enter the 6-digit code we emailed you.
          </p>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
          />

          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm tracking-[0.5em] text-center"
          />

          {error && <p className="text-sm text-alarm">{error}</p>}
          {info && <p className="text-sm text-seal">{info}</p>}

          <button
            disabled={busy}
            className="w-full bg-seal text-white font-semibold py-2.5 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Verify and continue"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={busy || !email}
            className="w-full text-xs text-mist hover:text-white disabled:opacity-50"
          >
            Resend code
          </button>
        </form>
      </div>

      <Footer />
    </div>
  );
}
