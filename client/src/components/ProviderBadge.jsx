const PROVIDER_META = {
  CBE: { label: "CBE", icon: "/cbe.png" },
  Telebirr: { label: "Telebirr", icon: "/telebirr.png" },
  Dashen: { label: "Dashen", icon: "/.png", darkSurface: true },
  Abyssinia: { label: "Abyssinia", icon: "/abyssinia.png" },
  CBEBirr: { label: "CBE Birr", icon: "/cbebirr.png" },
  MPesa: { label: "M-Pesa", icon: null, fallback: "MP" },
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

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span
        className={`inline-flex ${iconSize} items-center justify-center overflow-hidden rounded-xl ${meta.darkSurface ? "bg-[#13201b] p-1" : plain ? "border-0 bg-transparent" : `border ${active ? "border-seal bg-seal/10" : "border-black/10 bg-white dark:border-line dark:bg-[#111]"}`} `}
      >
        {meta.icon ? (
          <img
            src={meta.icon}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="font-display text-xs font-bold uppercase tracking-tight text-ink/60 dark:text-mist">
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
