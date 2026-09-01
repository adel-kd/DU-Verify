import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logoLarge from "../assets/verified-logo.png";
import Footer from "../components/Footer.jsx";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [businessType, setBusinessType] = useState("");

  const { login } = useAuth();
  const nav = useNavigate();

  // Fetch available business types from the server.
  // The signup bonus is still handled by the backend,
  // but it is not displayed on this page.
  useEffect(() => {
    api
      .get("/auth/business-types")
      .then(({ data }) => setBusinessTypes(data.businessTypes || []))
      .catch(() => { });
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.target);

    try {
      const { data } = await api.post("/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
      });

      login(data.token, data.user);

      nav(data.user.role === "owner" ? "/dashboard" : "/verify");
    } catch (err) {
      setError(err.response?.data?.error || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    if (!businessType) {
      setError("Please select what kind of business this is");
      return;
    }

    setLoading(true);

    const form = new FormData(e.target);

    try {
      const { data } = await api.post("/auth/register", {
        businessName: form.get("businessName"),
        ownerName: form.get("ownerName"),
        phone: form.get("phone"),
        email: form.get("email"),
        password: form.get("password"),
        businessType,
      });

      login(data.token, data.user);
      nav("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink bg-seal-radial text-paper flex flex-col">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Left: brand panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 border-r border-line">
          {/* Top-left brand */}
          <div className="flex items-center gap-3">
            <img
              src={logoLarge}
              alt="DU Varifay"
              className="w-10 h-10 animate-spin-slow"
            />
            <span className="font-display font-bold text-lg">
              DU Verify
            </span>
          </div>

          {/* Middle: large static logo + hero text */}
          <div className="flex flex-col items-center text-center">
            <img
              src={logoLarge}
              alt="DU Varifay Logo"
              className="w-40 h-40 xl:w-48 xl:h-48 mb-6"
            />

            <h1 className="font-display text-4xl font-semibold leading-tight max-w-md">
              Catch every reused screenshot before it reaches the till.
            </h1>

            <p className="mt-4 text-mist max-w-sm">
              Your cashiers scan the customer’s payment confirmation. We
              verify it in real time with CBE, Telebirr, Dashen, Bank of
              Abyssinia, and M-Pesa. No more guessing if a screenshot is
              real, fake, or recycled.
            </p>
          </div>

          {/* Bottom footer */}
          <p className="text-xs text-mist text-center">
            Built for cafés, retail, hotels, and supermarkets.
          </p>
        </div>

        {/* Right: form panel */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
              <img
                src={logoLarge}
                alt="DU Varifay"
                className="w-8 h-8 animate-spin-slow"
              />
              <span className="font-display font-bold">
                DU Varifay
              </span>
            </div>

            {/* Login / Register tabs */}
            <div className="flex gap-2 mb-6 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`flex-1 py-2 rounded-lg font-medium transition ${mode === "login"
                  ? "bg-seal text-ink"
                  : "bg-panel text-mist"
                  }`}
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className={`flex-1 py-2 rounded-lg font-medium transition ${mode === "register"
                  ? "bg-seal text-ink"
                  : "bg-panel text-mist"
                  }`}
              >
                Register business
              </button>
            </div>

            {/* Login */}
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  name="email"
                  required
                  type="email"
                  placeholder="Email"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <input
                  name="password"
                  required
                  type="password"
                  placeholder="Password"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-seal text-ink font-semibold rounded-lg py-2.5 disabled:opacity-50"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            ) : (
              /* Register */
              <form onSubmit={handleRegister} className="space-y-3">
                <input
                  name="businessName"
                  required
                  placeholder="Business name"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <input
                  name="ownerName"
                  required
                  placeholder="Owner name"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <input
                  name="phone"
                  required
                  placeholder="Phone"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <input
                  name="email"
                  required
                  type="email"
                  placeholder="Email"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  required
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm text-paper"
                >
                  <option value="" disabled className="bg-panel text-mist">
                    What kind of business is this?
                  </option>

                  {businessTypes.map((t) => (
                    <option
                      key={t.key}
                      value={t.key}
                      className="bg-panel text-paper"
                    >
                      {t.label}
                    </option>
                  ))}
                </select>

                <input
                  name="password"
                  required
                  type="password"
                  placeholder="Password"
                  className="w-full bg-panel border border-line rounded-lg px-3 py-2.5 text-sm placeholder:text-mist"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-seal text-ink font-semibold rounded-lg py-2.5 disabled:opacity-50"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>
            )}

            {/* Error */}
            {error && (
              <p className="mt-3 text-sm text-alarm">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      <Footer dark />
    </div>
  );
}