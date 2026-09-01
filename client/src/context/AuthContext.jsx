import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem("dv_user");
    return cached ? JSON.parse(cached) : null;
  });

  function login(token, user) {
    localStorage.setItem("dv_token", token);
    localStorage.setItem("dv_user", JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.removeItem("dv_token");
    localStorage.removeItem("dv_user");
    setUser(null);
  }

  // Renamed from the old ETB-era "wallet" to DU PT after the billing
  // upgrade. Function name kept as updateWallet to avoid touching every
  // call site, but the stored/user field is now duptBalance.
  function updateWallet(duptBalance) {
    setUser((prev) => {
      const next = { ...prev, duptBalance };
      localStorage.setItem("dv_user", JSON.stringify(next));
      return next;
    });
  }

  function updateUser(partial) {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem("dv_user", JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateWallet, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
