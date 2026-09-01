// components/UnverifiedNotice.jsx
//
// Shown when the logged-in account has not confirmed its email.
// Offers a resend button. Hidden for admins and Google accounts
// (which are verified automatically).

import { useState } from "react";
import { MailWarning } from "lucide-react";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function UnverifiedNotice() {
  const { user } = useAuth();

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Staff have no email and skip verification entirely.
  if (!user || user.isVerified !== false || user.role === "admin" || user.role === "staff") {
    return null;
  }

  async function resend() {
    setSending(true);

    try {
      await api.post("/auth/resend-verification", { email: user.email });
      setSent(true);
    } catch {
      // Non-fatal; the user can retry.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-alarm bg-alarm/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <MailWarning size={18} strokeWidth={1.75} className="text-alarm shrink-0" />

      <p className="text-sm text-ink dark:text-white flex-1">
        Your email is not verified yet. Verifications are locked until you
        confirm your email address.
        {sent && " A new verification link was sent — check your inbox."}
      </p>

      {!sent && (
        <button
          onClick={resend}
          disabled={sending}
          className="text-xs font-semibold border border-black/25 dark:border-line px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
        >
          {sending ? "Sending…" : "Resend link"}
        </button>
      )}
    </div>
  );
}
