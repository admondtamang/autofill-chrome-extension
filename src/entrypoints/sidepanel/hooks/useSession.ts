import { useState, useEffect, useCallback } from "react";
import type {
  SessionData,
  MessageResponse,
  AuthLoginRequest,
  AuthLogoutRequest,
  AuthSessionRequest,
} from "@/shared/contracts/messages";

export type UseSessionReturn = {
  session: SessionData | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const msg: AuthSessionRequest = { type: "auth.session" };
    chrome.runtime.sendMessage(
      msg,
      (response: MessageResponse<SessionData> | undefined) => {
        if (cancelled) return;
        if (chrome.runtime.lastError) {
          setError(chrome.runtime.lastError.message ?? "Connection error");
          setLoading(false);
          return;
        }
        if (response?.ok) {
          setSession(response.data);
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setLoading(true);
      setError(null);
      return new Promise<void>((resolve, reject) => {
        const msg: AuthLoginRequest = {
          type: "auth.login",
          payload: { email, password },
        };
        chrome.runtime.sendMessage(
          msg,
          (response: MessageResponse<SessionData> | undefined) => {
            setLoading(false);
            if (chrome.runtime.lastError) {
              const err =
                chrome.runtime.lastError.message ?? "Connection error";
              setError(err);
              reject(new Error(err));
              return;
            }
            if (response?.ok) {
              setSession(response.data);
              resolve();
            } else {
              const err = response?.error ?? "Login failed";
              setError(err);
              reject(new Error(err));
            }
          },
        );
      });
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const msg: AuthLogoutRequest = { type: "auth.logout" };
      chrome.runtime.sendMessage(msg, () => {
        setSession(null);
        setError(null);
        resolve();
      });
    });
  }, []);

  return { session, loading, error, login, logout };
}
