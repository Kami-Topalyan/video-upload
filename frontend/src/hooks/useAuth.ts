import { useCallback, useEffect, useState } from "react";
import { ApiError, clearToken, getMe, getToken } from "../api";
import type { User } from "../types";

/** The signed-in user. If a token is saved from an earlier visit, it is checked on load. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) return;

    getMe()
      .then(setUser)
      .catch((err: unknown) => {
        // An expired or invalid token is dropped; a network error just leaves you signed out for now.
        if (err instanceof ApiError && err.status === 401) clearToken();
      });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return { user, setUser, logout };
}
