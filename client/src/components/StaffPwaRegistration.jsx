import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { isDeveloperSurface } from "../lib/appSurface.js";

const MANIFEST_ID = "du-verify-staff-manifest";
const THEME_ID = "du-verify-staff-theme";
const INSTALL_READY_EVENT = "du-verify-install-ready";

function removeStaffMetadata() {
  document.getElementById(MANIFEST_ID)?.remove();
  document.getElementById(THEME_ID)?.remove();
}

async function unregisterStaffWorker() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const worker = registration.active || registration.waiting || registration.installing;
        return worker?.scriptURL.endsWith("/staff-sw.js");
      })
      .map((registration) => registration.unregister())
  );
}

export default function StaffPwaRegistration() {
  const { user } = useAuth();
  const enabled = user?.role === "staff" && !isDeveloperSurface;

  useEffect(() => {
    if (!enabled) {
      removeStaffMetadata();
      unregisterStaffWorker().catch(() => {});
      return undefined;
    }

    const captureInstallPrompt = (event) => {
      event.preventDefault();
      window.__duVerifyStaffInstallPrompt = event;
      window.dispatchEvent(new Event(INSTALL_READY_EVENT));
    };

    const clearInstallPrompt = () => {
      window.__duVerifyStaffInstallPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    let manifest = document.getElementById(MANIFEST_ID);
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.id = MANIFEST_ID;
      manifest.rel = "manifest";
      manifest.href = "/staff-manifest.webmanifest";
      document.head.appendChild(manifest);
    }

    let theme = document.getElementById(THEME_ID);
    if (!theme) {
      theme = document.createElement("meta");
      theme.id = THEME_ID;
      theme.name = "theme-color";
      theme.content = "#13201b";
      document.head.appendChild(theme);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/staff-sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.warn("[staff-pwa] registration failed", error));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, [enabled]);

  return null;
}
