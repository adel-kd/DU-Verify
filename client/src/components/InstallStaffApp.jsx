import { useEffect, useState } from "react";
import { Download } from "lucide-react";

const INSTALL_READY_EVENT = "du-verify-install-ready";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallStaffApp() {
  const [installPrompt, setInstallPrompt] = useState(
    () => window.__duVerifyStaffInstallPrompt || null
  );
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const capturePrompt = (event) => {
      setInstallPrompt(
        window.__duVerifyStaffInstallPrompt || event
      );
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener(INSTALL_READY_EVENT, capturePrompt);
    window.addEventListener("appinstalled", markInstalled);

    return () => {
      window.removeEventListener(INSTALL_READY_EVENT, capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (!installPrompt) {
      setShowHelp((current) => !current);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    window.__duVerifyStaffInstallPrompt = null;
    setInstallPrompt(null);
    setShowHelp(choice.outcome !== "accepted");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        aria-expanded={showHelp}
        className="inline-flex items-center gap-1.5 rounded-full border border-seal/30 bg-seal/10 px-3 py-1.5 text-xs font-semibold text-sealDark transition hover:border-seal hover:bg-seal/20 dark:text-seal"
      >
        <Download size={14} aria-hidden="true" />
        Install staff app
      </button>
      {showHelp && (
        <p className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-black/10 bg-white p-3 text-xs leading-5 text-ink shadow-xl dark:border-white/10 dark:bg-[#17211d] dark:text-white">
          {isIos
            ? "In Safari, tap Share, then Add to Home Screen."
            : "Open the browser menu, then choose Install app or Add to Home screen."}
        </p>
      )}
    </div>
  );
}
