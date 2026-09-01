// components/PasswordInput.jsx
//
// Password field with a working show/hide toggle.
// Lucide icons only.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({
  name = "password",
  placeholder = "Password",
  required = true,
  className = "",
  autoComplete,
  icon = null, // optional lucide node rendered inside the field (left)
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mist pointer-events-none">
          {icon}
        </span>
      )}

      <input
        name={name}
        required={required}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full bg-panel border border-line py-2.5 text-sm placeholder:text-mist pr-10 ${
          icon ? "pl-10" : "px-3"
        }`}
      />

      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-mist hover:text-white"
      >
        {visible ? (
          <EyeOff size={16} strokeWidth={1.75} />
        ) : (
          <Eye size={16} strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
