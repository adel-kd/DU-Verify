import { useEffect } from "react";

/**
 * Inline toast/banner used instead of window.alert().
 * Controlled entirely by parent state: { type: "success" | "error", text: string } | null
 */
export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-50 flex justify-center sm:justify-end"
    >
      <div
        className={`w-full sm:w-auto sm:max-w-sm flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm font-medium ${
          isError
            ? "bg-white dark:bg-panel border-alarm/30 text-alarm"
            : "bg-white dark:bg-panel border-seal/30 text-sealDark dark:text-seal"
        }`}
      >
        <span className="mt-0.5">{isError ? "⚠" : "✓"}</span>
        <p className="flex-1">{toast.text}</p>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-ink/30 dark:text-mist hover:text-ink/60 dark:hover:text-paper leading-none text-base"
        >
          ×
        </button>
      </div>
    </div>
  );
}
