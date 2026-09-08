import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

export default function MobileShutterNav({
  title,
  description,
  sections,
  activeKey,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const activeSection =
    sections.find((section) => section.key === activeKey) || sections[0];

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseSection(key) {
    onSelect(key);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="group flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white px-3.5 py-3 text-left shadow-[0_12px_35px_-28px_rgba(0,0,0,0.7)] transition hover:border-seal/50 dark:border-white/10 dark:bg-panel dark:hover:border-seal/60 lg:hidden"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-paper transition group-hover:bg-seal dark:bg-white dark:text-ink dark:group-hover:bg-seal dark:group-hover:text-white">
          <Menu size={19} aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40 dark:text-white/40">
            Menu
          </span>
          <span className="block truncate font-display text-sm font-semibold text-ink dark:text-paper">
            {activeSection?.mobileLabel || activeSection?.label}
          </span>
        </span>

        <span className="h-7 w-1 rounded-full bg-seal" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} navigation`}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px] animate-shutter-backdrop"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,370px)] flex-col overflow-hidden border-r border-white/10 bg-[#101a16] text-white shadow-[30px_0_80px_rgba(0,0,0,0.38)] animate-shutter-in">
            <div className="relative border-b border-white/10 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
              <div className="absolute inset-x-0 top-0 h-1 bg-seal" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-seal">
                    DU Verify
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.035em]">
                    {title}
                  </h2>
                  {description && (
                    <p className="mt-1.5 max-w-[260px] text-xs leading-5 text-white/50">
                      {description}
                    </p>
                  )}
                </div>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-seal hover:bg-seal hover:text-white"
                  aria-label="Close navigation"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={title}>
              {sections.map((section, index) => {
                const active = section.key === activeKey;

                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => chooseSection(section.key)}
                    className={`group relative w-full overflow-hidden rounded-2xl border px-4 py-3.5 text-left animate-shutter-item transition ${
                      active
                        ? "border-seal/60 bg-seal text-white"
                        : "border-transparent bg-white/[0.035] text-white/72 hover:border-seal/45 hover:bg-seal/10 hover:text-white"
                    }`}
                    style={{ animationDelay: `${Math.min(index * 28, 250)}ms` }}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span>
                        <span className="block text-sm font-semibold">
                          {section.label}
                        </span>
                        <span className={`mt-0.5 block text-[11px] leading-4 ${active ? "text-white/75" : "text-white/38 group-hover:text-white/55"}`}>
                          {section.description}
                        </span>
                      </span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full transition ${active ? "bg-white" : "bg-white/15 group-hover:bg-seal"}`}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-white/10 px-5 py-4 text-[11px] text-white/35">
              Select a section to close this menu.
            </div>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex w-3 gap-0.5 opacity-30" aria-hidden="true">
              <span className="h-full w-px bg-seal" />
              <span className="h-full w-px bg-white/30" />
              <span className="h-full w-px bg-seal" />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
