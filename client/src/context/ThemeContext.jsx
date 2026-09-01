import { createContext, useContext, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";

const ThemeContext = createContext(null);

// Pre-login pages (Login/Terms/Privacy) have no `user` yet, so the chosen
// preference is cached here too - keeps the theme consistent across the
// sign-in screen instead of resetting to "system" every time.
const LOCAL_KEY = "dv_theme_pref";

function resolveIsDark(preference) {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  // "system" (or anything unrecognized) - defer to the OS.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(preference) {
  const isDark = resolveIsDark(preference);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  // Logged-in users' preference lives on their account (Settings > Theme,
  // synced via PATCH /auth/me/preferences); logged-out visitors fall back
  // to whatever was last chosen on this device.
  const preference = user?.themePreference || localStorage.getItem(LOCAL_KEY) || "system";

  useEffect(() => {
    if (user?.themePreference) {
      localStorage.setItem(LOCAL_KEY, user.themePreference);
    }
    applyTheme(preference);

    if (preference !== "system") return;

    // Only "system" needs to react live to the OS setting changing while
    // the app is open - light/dark are fixed choices.
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference, user?.themePreference]);

  return <ThemeContext.Provider value={{ preference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
