// pages/AuthSuccess.jsx
//
// Landing page for the Google OAuth callback.
//
// The backend redirects here with the JWT + user in the URL
// FRAGMENT (#payload=...), which browsers never send to any
// server — safer than a query string.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthSuccess() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [error, setError] = useState("");
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    try {
      const match = window.location.hash.match(/payload=([^&]+)/);

      if (!match) {
        setError("Missing authentication payload.");
        return;
      }

      const { token, user } = JSON.parse(
        decodeURIComponent(match[1])
      );

      if (typeof token !== "string" || !token || !user || typeof user !== "object") {
        setError("Invalid authentication payload.");
        return;
      }

      login(token, user);

      // Clean the fragment out of history.
      window.history.replaceState(null, "", "/auth/success");

      const destination =
        user.profileComplete === false
          ? "/complete-profile"
          : user.role === "owner"
            ? "/dashboard"
            : user.role === "admin"
              ? "/admin"
              : "/verify";

      nav(destination, { replace: true });
    } catch {
      setError("Could not complete Google sign-in. Please try again.");
    }
  }, [login, nav]);

  return (
    <div className="min-h-screen bg-white dark:bg-ink text-ink dark:text-white flex items-center justify-center p-6">
      <p className="text-sm text-mist">
        {error || "Completing Google sign-in…"}
      </p>
    </div>
  );
}
