import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";

const Login = lazy(() => import("./pages/Login.jsx"));
const VerifyOtp = lazy(() => import("./pages/VerifyOtp.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile.jsx"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail.jsx"));
const AuthSuccess = lazy(() => import("./pages/AuthSuccess.jsx"));
const Verify = lazy(() => import("./pages/Verify.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Help = lazy(() => import("./pages/Help.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const Developers = lazy(() => import("./pages/Developers.jsx"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-white dark:bg-ink grid place-items-center text-sm text-mist">
      Loading...
    </div>
  );
}

function landingFor(user) {
  if (window.location.hostname === 'dev.duverifay.com') return '/developers';
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "owner") return "/dashboard";
  return "/verify";
}

export default function App() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/developers" element={<Developers />} />
      <Route path="/login" element={user ? <Navigate to={landingFor(user)} /> : <Login />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/auth/success" element={<AuthSuccess />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/help" element={<Help />} />
      <Route
        path="/verify"
        element={
          <ProtectedRoute>
            {user?.role === "owner" && user?.accountMode === "team" ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Verify />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute ownerOnly>
            {sessionStorage.getItem('developer_signup') === '1' ? <Navigate to="/developers" replace /> : <Dashboard />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            {user?.role === "admin" ? (
              <Navigate to="/admin" replace />
            ) : user?.role === "owner" ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Settings />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
        <Route path="*" element={<Navigate to={landingFor(user)} />} />
      </Routes>
    </Suspense>
  );
}
