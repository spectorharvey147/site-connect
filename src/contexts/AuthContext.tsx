import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppUser, login as authLogin, verifyToken, logout as authLogout } from '@/lib/auth';

interface AuthContextType {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_STORAGE_KEY = 'claimsToken';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const finishLoading = () => {
      if (!cancelled) setLoading(false);
    };

    const loadSavedSession = async () => {
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!savedToken) {
        finishLoading();
        return;
      }

      try {
        const userFromToken = await Promise.race([
          verifyToken(savedToken),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
        ]);

        if (cancelled) return;

        if (userFromToken) {
          setUser(userFromToken);
          setToken(savedToken);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } finally {
        finishLoading();
      }
    };

    loadSavedSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authLogin(email, password);
    if (result.ok && result.session) {
      setUser(result.session.user);
      setToken(result.session.token);
      localStorage.setItem(TOKEN_STORAGE_KEY, result.session.token);
      return { ok: true };
    }
    return { ok: false, message: result.message };
  }, []);

  const logout = useCallback(async () => {
    if (token) await authLogout(token);
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, [token]);

  const role = user?.role;
  const isAdmin = role === 'Admin' || role === 'Super Admin';
  const isManagerOrAbove = role === 'Manager' || isAdmin;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isManagerOrAbove }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
