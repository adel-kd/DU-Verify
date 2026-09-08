import { useEffect, useState } from "react";
import { Download } from "lucide-react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallStaffApp() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const capturePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed || (!installPrompt && !isIos)) return null;

  async function install() {
    if (isIos) {
      setShowIosHelp((current) => !current);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-full border border-seal/30 bg-seal/10 px-3 py-1.5 text-xs font-semibold text-sealDark transition hover:border-seal hover:bg-seal/20 dark:text-seal"
      >
        <Download size={14} aria-hidden="true" />
        Install staff app
      </button>
      {showIosHelp && (
        <p className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-black/10 bg-white p-3 text-xs leading-5 text-ink shadow-xl dark:border-white/10 dark:bg-[#17211d] dark:text-white">
          In Safari, tap Share, then choose Add to Home Screen.
        </p>
      )}
    </div>
  );
}
