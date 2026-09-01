import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, ownerOnly = false, adminOnly = false }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && user.role !== "admin") return <Navigate to="/login" replace />;
  if (ownerOnly && user.role !== "owner") return <Navigate to="/verify" replace />;

  // Owners must confirm their email via OTP before any protected route.
  if (user.role === "owner" && user.isVerified === false) {
    return <Navigate to="/verify-otp" state={{ email: user.email }} replace />;
  }

  // Google sign-ups must complete phone / business type first.
  if (user.role !== "admin" && user.profileComplete === false) {
    return <Navigate to="/complete-profile" replace />;
  }

  return children;
}
