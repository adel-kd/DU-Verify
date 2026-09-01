import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ChevronDown } from "lucide-react";
import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logoLarge from "../assets/verified-logo.png";
import PasswordInput from "../components/PasswordInput.jsx";

// Strict RFC-style email check — instant client-side feedback.
const EMAIL_REGEX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const API_BASE = `${
  import.meta.env.VITE_API_URL || "https://gory-starry-undercoat.ngrok-free.dev"
}/api`;

function landingFor(user) {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "owner") return "/dashboard";
  return "/verify";
}

// Shared Google OAuth entry point with hover micro-animation.
function GoogleButton({ label }) {
  return (
    <a
      href={`${API_BASE}/auth/google?origin=${encodeURIComponent(window.location.origin)}`}
      className="w-full flex items-center justify-center gap-2 border border-[#222] bg-[#121212] text-white font-medium py-2.5 rounded-lg hover:bg-black hover:border-seal/50 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
    >
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {label}
    </a>
  );
}

export default function Login() {
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [businessType, setBusinessType] = useState("");
  const [accountMode, setAccountMode] = useState("solo");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const { login } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("google") === "failed") {
      setError("Google sign-in failed. Please try again or use email sign-in.");
    }
  }, []);

  useEffect(() => {
    api
      .get("/auth/business-types")
      .then(({ data }) => setBusinessTypes(data.businessTypes || []))
      .catch(() => {});
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.target);

    try {
      const { data } = await api.post("/auth/login", {
        identifier: form.get("identifier"),
        password: form.get("password"),
        rememberMe,
      });

      login(data.token, data.user);
      nav(landingFor(data.user), { replace: true });
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_NOT_VERIFIED") {
        nav("/verify-otp", {
          state: { email: err.response.data.email },
        });
        return;
      }

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
    const email = String(form.get("email") || "").trim();

    if (!EMAIL_REGEX.test(email)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post("/auth/register", {
        businessName: form.get("businessName"),
        ownerName: form.get("ownerName"),
        phone: form.get("phone"),
        email,
        password: form.get("password"),
        businessType,
        accountMode,
      });

      nav("/verify-otp", {
        state: { email: data.email || email },
        replace: true,
      });
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] text-paper flex flex-col justify-between selection:bg-seal selection:text-black animate-fade-in">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Left: Brand & Illustration Panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 border-r border-[#1a1a1a] relative overflow-hidden">
          {/* Ambient glow accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-seal/10 blur-3xl animate-glow"
          />

          {/* Top-left brand */}
          <div className="relative z-10 flex items-center gap-3 transform hover:scale-[1.02] transition-transform cursor-pointer animate-slide-up">
            <img
              src={logoLarge}
              alt="DU Verify"
              className="w-8 h-8"
            />
            <span className="font-display font-bold text-base tracking-wide text-white">
              DU Verify
            </span>
          </div>

          {/* Middle Content */}
          <div className="relative z-10 flex flex-col items-start my-auto py-8">
            <h1 className="font-display text-6xl font-semibold leading-tight max-w-lg mb-4 text-white animate-slide-up anim-delay-2">
              Catch every reused screenshot <span className="text-seal">before</span> it reaches the till.
            </h1>

            <p className="text-mist text-sm leading-relaxed max-w-md mb-8 animate-slide-up anim-delay-4">
              Your cashiers scan the customer’s payment confirmation. We verify it in real time with trusted banks. No more guessing if a screenshot is real, fake, or recycled.
            </p>
          </div>

          <div></div>
        </div>

        {/* Right: Form Panel */}
        <div className="flex flex-col justify-between p-6 lg:p-12 bg-[#000000]">
          {/* Top Help link */}
          <div className="flex justify-end w-full">
            <a href="#help" className="text-xs text-mist hover:text-white flex items-center gap-1 transition-colors">
              <span className="border border-mist/40 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px]">?</span> Help
            </a>
          </div>

          <div className="w-full max-w-sm mx-auto my-auto transition-all duration-300">
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-2 mb-6 justify-center animate-slide-up">
              <img
                src={logoLarge}
                alt="DU Verify"
                className="w-8 h-8"
              />
              <span className="font-display font-bold text-white">
                DU Verify
              </span>
            </div>

            {/* Header Titles */}
            <div className="mb-6 animate-slide-up anim-delay-1">
              <h2 className="font-display text-2xl font-semibold text-white">Welcome back</h2>
              <p className="text-xs text-mist mt-1">Sign in to your account to continue</p>
            </div>

            {/* Login / Register tabs */}
            <div className="flex gap-2 mb-6 text-sm bg-[#121212] p-1 rounded-xl border border-[#222] animate-slide-up anim-delay-2">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`flex-1 py-2 rounded-lg font-medium transition-all duration-200 ${
                  mode === "login" ? "bg-seal text-black font-semibold shadow" : "text-mist hover:text-white"
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
                className={`flex-1 py-2 rounded-lg font-medium transition-all duration-200 ${
                  mode === "register" ? "bg-seal text-black font-semibold shadow" : "text-mist hover:text-white"
                }`}
              >
                Register business
              </button>
            </div>

            {/* Login Form */}
            {mode === "login" ? (
              <form onSubmit={handleLogin} key="login" className="space-y-4 animate-fade-in">
                <div className="animate-slide-up anim-delay-3">
                  <input
                    name="identifier"
                    type="text"
                    required
                    placeholder="Email or Phone number "
                    className="w-full bg-[#121212] border border-[#222] rounded-lg px-3 py-2.5 text-sm placeholder:text-mist text-white focus:outline-none focus:border-seal transition-colors duration-200"
                  />
                </div>

                <div className="animate-slide-up anim-delay-4">
                  <PasswordInput name="password" autoComplete="current-password" />
                </div>

                <div className="flex items-center justify-between text-xs animate-slide-up anim-delay-5">
                  <label className="flex items-center gap-2 text-mist cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-[#222] bg-[#121212] text-seal focus:ring-0 cursor-pointer"
                    />
                    Remember me
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-mist hover:text-white transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-seal text-black font-semibold py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 transition-all duration-200 transform active:scale-[0.99] disabled:opacity-50 shadow-sm animate-slide-up anim-delay-6"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>

                {/* Google sign-in separator */}
                <div className="flex items-center gap-3 pt-2 animate-slide-up anim-delay-7">
                  <span className="h-px flex-1 bg-[#222]" />
                  <span className="text-xs text-mist">or</span>
                  <span className="h-px flex-1 bg-[#222]" />
                </div>

                <GoogleButton label="Continue with Google" />
              </form>
            ) : (
              /* Register Form */
              <form onSubmit={handleRegister} key="register" className="space-y-3 animate-fade-in">
                <div className="animate-slide-up anim-delay-3">
                  <input
                    name="businessName"
                    required
                    placeholder="Business name"
                    className="w-full bg-[#121212] border border-[#222] rounded-lg px-3 py-2.5 text-sm placeholder:text-mist text-white focus:outline-none focus:border-seal transition-colors duration-200"
                  />
                </div>

                <div className="animate-slide-up anim-delay-3">
                  <input
                    name="ownerName"
                    required
                    placeholder="Owner name"
                    className="w-full bg-[#121212] border border-[#222] rounded-lg px-3 py-2.5 text-sm placeholder:text-mist text-white focus:outline-none focus:border-seal transition-colors duration-200"
                  />
                </div>

                <div className="animate-slide-up anim-delay-4">
                  <input
                    name="phone"
                    required
                    placeholder="Phone number"
                    className="w-full bg-[#121212] border border-[#222] rounded-lg px-3 py-2.5 text-sm placeholder:text-mist text-white focus:outline-none focus:border-seal transition-colors duration-200"
                  />
                </div>

                <div className="animate-slide-up anim-delay-4">
                  <input
                    name="email"
                    required
                    type="email"
                    placeholder="Email address"
                    className="w-full bg-[#121212] border border-[#222] rounded-lg px-3 py-2.5 text-sm placeholder:text-mist text-white focus:outline-none focus:border-seal transition-colors duration-200"
                  />
                </div>

                {/* Business type — fixed: custom chevron, native picker hidden */}
                <div className="relative animate-slide-up anim-delay-5">
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    required
                    className={`w-full appearance-none bg-[#121212] border border-[#222] rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-seal cursor-pointer transition-colors duration-200 ${
                      businessType === "" ? "text-mist" : "text-white"
                    }`}
                  >
                    <option value="" disabled className="bg-[#121212] text-mist">
                      What kind of business is this?
                    </option>
                    {businessTypes.map((t) => (
                      <option key={t.key} value={t.key} className="bg-[#121212] text-white">
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist"
                  />
                </div>

                {/* Who will actually run the checks? Drives which
                    dashboard features (staff management vs. the
                    checker itself) are enabled for this account. */}
                <div className="animate-slide-up anim-delay-5">
                  <p className="text-xs text-mist mb-1.5">Who will verify receipts?</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setAccountMode("solo")}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ${
                        accountMode === "solo"
                          ? "border-seal bg-seal/10 text-white"
                          : "border-[#222] bg-[#121212] text-mist hover:text-white"
                      }`}
                    >
                      <span className="block font-medium">Just me</span>
                      <span className="block text-xs text-mist mt-0.5">I'll verify receipts myself</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountMode("team")}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-200 ${
                        accountMode === "team"
                          ? "border-seal bg-seal/10 text-white"
                          : "border-[#222] bg-[#121212] text-mist hover:text-white"
                      }`}
                    >
                      <span className="block font-medium">Me and a team</span>
                      <span className="block text-xs text-mist mt-0.5">Staff will verify instead</span>
                    </button>
                  </div>
                </div>

                <div className="animate-slide-up anim-delay-5">
                  <PasswordInput name="password" autoComplete="new-password" />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-seal text-black font-semibold py-2.5 rounded-lg hover:opacity-95 hover:-translate-y-0.5 transition-all duration-200 transform active:scale-[0.99] disabled:opacity-50 mt-2 shadow-sm animate-slide-up anim-delay-6"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>

                <div className="flex items-center gap-3 pt-1 animate-slide-up anim-delay-7">
                  <span className="h-px flex-1 bg-[#222]" />
                  <span className="text-xs text-mist">or</span>
                  <span className="h-px flex-1 bg-[#222]" />
                </div>

                <GoogleButton label="Sign up with Google" />
              </form>
            )}

            {/* Email verification notice */}
            {needsVerification && (
              <div className="mt-4 border border-seal bg-seal/10 px-4 py-3 text-sm text-white rounded-lg animate-fade-in">
                Account created. We sent a verification link to your email — please confirm it to unlock verifications.
              </div>
            )}

            {/* Error message */}
            {error && (
              <p className="mt-3 text-sm text-alarm text-center animate-shake">
                {error}
              </p>
            )}
          </div>

          <div className="invisible lg:visible"></div>
        </div>
      </div>

      {/* Footer bar matching design */}
      <footer className="w-full px-6 lg:px-12 py-4 border-t border-[#1a1a1a] text-xs text-mist flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#000000]">
        <div></div>
        <div className="text-center">© 2026 DU Verify. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
