import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getMe, login as loginRequest, type LoginResult } from "../api/auth.api";

const tokenKey = "xjd-finance-token";
const userKey = "xjd-finance-user";
const authChangedEvent = "xjd-auth-changed";

export type AuthUser = LoginResult["user"];

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  replaceSession: (session: LoginResult) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function storedToken() {
  return localStorage.getItem(tokenKey);
}

export function clearStoredAuth() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  window.dispatchEvent(new Event(authChangedEvent));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => storedToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setToken(null);
    setUser(null);
  }, []);

  const replaceSession = useCallback((session: LoginResult) => {
    localStorage.setItem(tokenKey, session.token);
    localStorage.setItem(userKey, session.user.username);
    setToken(session.token);
    setUser(session.user);
    window.dispatchEvent(new Event(authChangedEvent));
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextToken = storedToken();
      setToken(nextToken);
      if (!nextToken) setUser(null);
    };
    window.addEventListener(authChangedEvent, sync);
    return () => window.removeEventListener(authChangedEvent, sync);
  }, []);

  useEffect(() => {
    let mounted = true;
    const currentToken = storedToken();
    if (!currentToken) {
      setReady(true);
      return;
    }
    getMe()
      .then((response) => {
        if (!mounted) return;
        const current = response.data?.user;
        if (!current) {
          logout();
          return;
        }
        setUser({ ...current, auth: { role: response.data.role, label: response.data.label, permissions: response.data.permissions } });
      })
      .catch(() => {
        if (mounted) logout();
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username, password);
    replaceSession(response.data);
    return response.data.user;
  }, [replaceSession]);

  const value = useMemo(() => ({ user, token, ready, login, replaceSession, logout }), [user, token, ready, login, replaceSession, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
