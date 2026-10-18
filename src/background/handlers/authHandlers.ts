import { API_BASE_URL } from "@/shared/config";
import type { MessageResponse, SessionData } from "@/shared/contracts/messages";
import { apiFetch } from "../apiClient";
import { clearSession, getSession, saveSession } from "../session";
import { clearRowCache } from "./recordHandlers";

type SessionView = Omit<SessionData, "token">;

type LoginApiResponse = {
  token: string;
  expiry: number;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    roleId: number;
    branchId: number | null;
    [key: string]: unknown;
  };
};

export async function handleLogin(payload: {
  email: string;
  password: string;
}): Promise<MessageResponse<SessionView>> {
  try {
    const raw = await apiFetch<LoginApiResponse>(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    });

    const sessionData: SessionData = {
      token: raw.token,
      expiry: raw.expiry,
      user: {
        id: raw.user.id,
        firstName: raw.user.firstName,
        lastName: raw.user.lastName,
        email: raw.user.email,
        roleId: raw.user.roleId,
        branchId: raw.user.branchId,
      },
    };

    await saveSession(sessionData);

    const sessionView: SessionView = {
      expiry: sessionData.expiry,
      user: sessionData.user,
    };
    return { ok: true, data: sessionView };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return { ok: false, error: message };
  }
}

export async function handleLogout(): Promise<MessageResponse<void>> {
  try {
    await clearSession();
    clearRowCache();
    return { ok: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Logout failed";
    return { ok: false, error: message };
  }
}

export async function handleGetSession(): Promise<MessageResponse<SessionView | null>> {
  try {
    const session = await getSession();
    if (session === null) {
      return { ok: true, data: null };
    }
    const sessionView: SessionView = {
      expiry: session.expiry,
      user: session.user,
    };
    return { ok: true, data: sessionView };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get session";
    return { ok: false, error: message };
  }
}
