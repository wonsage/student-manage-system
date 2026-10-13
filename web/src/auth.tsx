import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { api, clearSession, getStoredUser, setSession } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setSession(res.token, res.user);
    setUser(res.user);
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
