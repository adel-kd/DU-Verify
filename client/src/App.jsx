import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import VerifyOtp from "./pages/VerifyOtp.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import CompleteProfile from "./pages/CompleteProfile.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import AuthSuccess from "./pages/AuthSuccess.jsx";
import Verify from "./pages/Verify.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Settings from "./pages/Settings.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function landingFor(user) {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "owner") return "/dashboard";
  return "/verify";
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={landingFor(user)} /> : <Login />} />
      <Route path="/verify-otp" element={<VerifyOtp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/auth/success" element={<AuthSuccess />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
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
            <Dashboard />
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
  );
}
