import type { SessionData } from "@/shared/contracts/messages";

const SESSION_KEY = "immifill_session";

export async function getSession(): Promise<SessionData | null> {
  // Use chrome.storage.local so the token survives browser restarts
  const result = await chrome.storage.local.get(SESSION_KEY);
  const raw: unknown = result[SESSION_KEY];

  if (raw === undefined || raw === null) {
    return null;
  }

  const data = raw as SessionData;

  // Treat as expired when within 60 seconds of expiry
  if (Date.now() / 1000 >= data.expiry - 60) {
    await clearSession();
    return null;
  }

  return data;
}

export async function saveSession(data: SessionData): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: data });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}
