import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getMe, logout as apiLogout } from '../api/auth';
import { ApiError, registerAuthFailureHandler } from '../api/client';
import type { Account } from '../types';

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  setAccount: (account: Account | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setAccount)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('Failed to fetch account:', err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => { /* ignore — clear state regardless */ });
    setAccount(null);
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(() => setAccount(null));
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, setAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
