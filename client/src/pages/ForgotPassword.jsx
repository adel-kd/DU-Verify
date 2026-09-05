// pages/ForgotPassword.jsx
//
// Two-step password reset via email OTP:
//   1. Enter email -> a reset code is sent
//   2. Enter code
//   3. Enter new password -> password updated

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api.js";
import Footer from "../components/Footer.jsx";

export default function ForgotPassword() {
  const nav = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setInfo(data.message || "Reset code sent.");
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || "Could not send reset code");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await api.post("/auth/reset-password", { email, otp, newPassword });

      setInfo("Your password was changed successfully. You can now sign in.");
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || "Password reset failed");
    } finally {
      setBusy(false);
    }
  }

  function continueWithOtp(e) {
    e.preventDefault();
    setError("");
    setStep(3);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-ink text-ink dark:text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm border border-black/15 dark:border-line p-8 space-y-4">
          <h1 className="font-display text-lg font-semibold">Forgot password</h1>

          {step === 1 ? (
            <form onSubmit={requestCode} className="space-y-4">
              <p className="text-sm text-mist">
                Enter your account email and we'll send you a reset code.
              </p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
              />
              <button
                disabled={busy}
                className="w-full bg-seal text-white font-semibold py-2.5 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send reset code"}
              </button>
            </form>
          ) : step === 2 ? (
            <form onSubmit={continueWithOtp} className="space-y-4">
              <p className="text-sm text-mist">{info}</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
                className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm tracking-[0.5em] text-center"
              />
              <button
                disabled={busy || otp.length !== 6}
                className="w-full bg-seal text-white font-semibold py-2.5 disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          ) : step === 3 ? (
            <form onSubmit={resetPassword} className="space-y-4">
              <p className="text-sm text-mist">Enter your new password.</p>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                className="w-full border border-black/20 dark:border-line bg-transparent px-3 py-2.5 text-sm"
              />
              <button
                disabled={busy}
                className="w-full bg-seal text-white font-semibold py-2.5 disabled:opacity-50"
              >
                {busy ? "Updating…" : "Set new password"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-mist">{info}</p>
              <button
                onClick={() => nav("/login", { replace: true })}
                className="w-full bg-seal text-white font-semibold py-2.5"
              >
                Back to sign in
              </button>
            </div>
          )}

          {error && <p className="text-sm text-alarm">{error}</p>}

          <Link to="/login" className="block text-xs text-mist hover:text-white text-center">
            Back to sign in
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
