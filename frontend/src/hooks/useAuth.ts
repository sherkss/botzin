import { useState, useCallback } from "react";
import { apiFetch, apiPost, clearToken, getToken, setToken } from "../api.ts";
import type { User } from "../types.ts";

interface LoginResponse {
  token: string;
  user: User;
}

interface MeResponse {
  user: User;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const res = await apiPost<LoginResponse>("/api/auth/login", { username, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const checkSession = useCallback(async (): Promise<User | null> => {
    if (!getToken()) {
      setChecked(true);
      return null;
    }
    try {
      const res = await apiFetch<MeResponse>("/api/auth/me");
      setUser(res.user);
      setChecked(true);
      return res.user;
    } catch {
      clearToken();
      setChecked(true);
      return null;
    }
  }, []);

  return { user, checked, login, logout, checkSession };
}
