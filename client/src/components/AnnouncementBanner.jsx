// components/AnnouncementBanner.jsx
//
// Displays manual alerts/messages sent by the super admin to
// client accounts (owners and staff). Each user can dismiss
// an announcement independently.
//
// Severity colors:
//   info     -> seal teal accent
//   warning  -> red caution border
//   critical -> solid red

import { useEffect, useState } from "react";
import api from "../lib/api.js";

const SEVERITY_STYLE = {
  info: "border-seal bg-seal/5",
  warning: "border-alarm bg-alarm/5",
  critical: "border-alarm bg-alarm/10",
};

export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/announcements")
      .then(({ data }) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        // Announcements are non-critical; fail silently.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function dismiss(id) {
    setItems((prev) => prev.filter((a) => a._id !== id));

    try {
      await api.post(`/announcements/${id}/dismiss`);
    } catch {
      // Already removed locally; nothing else to do.
    }
  }

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a._id}
          className={`border px-4 py-3 flex items-start justify-between gap-3 ${
            SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info
          }`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink dark:text-white">
              {a.severity === "critical" && "⚠ "}
              {a.title}
            </p>
            <p className="text-xs text-ink/60 dark:text-mist mt-0.5 whitespace-pre-line">
              {a.message}
            </p>
          </div>
          <button
            onClick={() => dismiss(a._id)}
            className="text-xs font-semibold border border-black/20 dark:border-line px-2 py-1 whitespace-nowrap hover:bg-black/5 dark:hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
