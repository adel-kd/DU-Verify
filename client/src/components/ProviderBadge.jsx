import { useEffect, useState } from "react";

const PROVIDER_META = {
  CBE: { label: "CBE", icon: "/cbe.png" },
  Telebirr: { label: "Telebirr", icon: "/telebirr.png" },
  Dashen: { label: "Dashen", icon: "/dashen.png", darkSurface: true },
  Abyssinia: { label: "Abyssinia", icon: "/abyssinia.png" },
  CBEBirr: { label: "CBE Birr", icon: "/cbebirr.png" },
  MPesa: { label: "M-Pesa", icon: "/mpesa.svg", fallback: "MP" },
  Awash: { label: "Awash", icon: "/awash.png" },
};

export function getProviderMeta(provider) {
  return (
    PROVIDER_META[provider] || {
      label: provider || "Provider",
      icon: null,
    }
  );
}

export default function ProviderBadge({
  provider,
  active = false,
  className = "",
  showLabel = true,
  plain = false,
  iconSize = "h-7 w-7",
}) {
  const meta = getProviderMeta(provider);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setIconFailed(false);
  }, [meta.icon]);

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span
        className={`inline-flex ${iconSize} shrink-0 items-center justify-center overflow-hidden rounded-xl p-1 ${meta.darkSurface ? "bg-[#13201b] ring-1 ring-white/15" : active ? "bg-white ring-1 ring-seal/40" : "bg-white ring-1 ring-black/10 shadow-sm"} ${plain ? "" : "border border-black/5"}`}
      >
        {meta.icon && !iconFailed ? (
          <img
            src={meta.icon}
            alt=""
            className="h-full w-full object-contain"
            loading="eager"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span className={`font-display text-xs font-bold uppercase tracking-tight ${meta.darkSurface ? "text-white" : "text-ink/70"}`}>
            {meta.fallback || meta.label.slice(0, 2)}
          </span>
        )}
      </span>
      {showLabel && (
        <span className="font-medium text-inherit">
          {meta.label}
        </span>
      )}
    </span>
  );
}
