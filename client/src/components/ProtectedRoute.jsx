import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, ownerOnly = false, adminOnly = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/login" replace />;
  if (ownerOnly && user.role !== "owner") return <Navigate to="/verify" replace />;
  return children;
}
