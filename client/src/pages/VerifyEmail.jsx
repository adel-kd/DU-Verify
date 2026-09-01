// pages/VerifyEmail.jsx
//
// Double opt-in landing page. Reads ?token=... from the
// activation email link and confirms it with the backend.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import api from "../lib/api.js";
import Footer from "../components/Footer.jsx";

export default function VerifyEmail() {
  const [params] = useSearchParams();

  const [state, setState] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");

    if (!token) {
      setState("error");
      setMessage("No verification token found in this link.");
      return;
    }

    api
      .post("/auth/verify-email", { token })
      .then(({ data }) => {
        setState("success");
        setMessage(data.message || "Email verified successfully.");
      })
      .catch((err) => {
        setState("error");
        setMessage(
          err.response?.data?.error ||
            "Verification failed. The link may have expired."
        );
      });
  }, [params]);

  return (
    <div className="min-h-screen bg-white dark:bg-ink text-ink dark:text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm border border-black/15 dark:border-line p-8 text-center">
          {state === "verifying" && (
            <p className="text-sm text-mist">Verifying your email…</p>
          )}

          {state === "success" && (
            <>
              <CheckCircle2
                size={40}
                strokeWidth={1.5}
                className="mx-auto mb-4 text-seal"
              />
              <h1 className="font-display text-lg font-semibold mb-2">
                Email verified
              </h1>
              <p className="text-sm text-mist mb-6">{message}</p>
              <Link
                to="/login"
                className="block w-full bg-seal text-white font-semibold py-2.5 text-sm"
              >
                Go to sign in
              </Link>
            </>
          )}

          {state === "error" && (
            <>
              <XCircle
                size={40}
                strokeWidth={1.5}
                className="mx-auto mb-4 text-alarm"
              />
              <h1 className="font-display text-lg font-semibold mb-2">
                Verification failed
              </h1>
              <p className="text-sm text-mist mb-6">{message}</p>
              <Link
                to="/login"
                className="block w-full border border-black/20 dark:border-line font-semibold py-2.5 text-sm"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
