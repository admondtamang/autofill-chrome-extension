/**
 * Acceptance tests for §9.2 case 8:
 * Session: expired token/401 clears session; token never present in any console.* log (spy)
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { SessionData } from "@/shared/contracts/messages";

// ─── chrome.storage.session mock ─────────────────────────────────────────────

const storageMock: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: storageMock[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageMock, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete storageMock[key];
      }),
    },
  },
};

vi.stubGlobal("chrome", chromeMock);

const NOW_SECONDS = 1_700_000_000;

beforeEach(() => {
  for (const key of Object.keys(storageMock)) {
    delete storageMock[key];
  }
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW_SECONDS * 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

// Import real session functions — they use the chrome stub above
import { getSession, clearSession, saveSession } from "@/background/session";

const validSession: SessionData = {
  token: "super-secret-jwt-token",
  expiry: NOW_SECONDS + 3600,
  user: {
    id: 1,
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    roleId: 1,
    branchId: null,
  },
};

// ─── §9.2 Case 8: Session management ─────────────────────────────────────────

describe("§9.2.8 – expired token clears session", () => {
  it("returns null and removes session when token is expired", async () => {
    const expiredSession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS - 1, // already past
    };
    storageMock["session"] = expiredSession;

    // Re-setup mock to read from storageMock correctly
    chromeMock.storage.session.get.mockImplementation(async (key: string) => ({
      [key]: storageMock[key],
    }));
    chromeMock.storage.session.remove.mockImplementation(async (key: string) => {
      delete storageMock[key];
    });

    const result = await getSession();

    expect(result).toBeNull();
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });

  it("clears session when within 60s of expiry (grace window)", async () => {
    const almostExpiredSession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS + 59,
    };
    storageMock["session"] = almostExpiredSession;

    chromeMock.storage.session.get.mockImplementation(async (key: string) => ({
      [key]: storageMock[key],
    }));
    chromeMock.storage.session.remove.mockImplementation(async (key: string) => {
      delete storageMock[key];
    });

    const result = await getSession();

    expect(result).toBeNull();
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });

  it("returns valid session when well within expiry", async () => {
    storageMock["session"] = validSession;

    chromeMock.storage.session.get.mockImplementation(async (key: string) => ({
      [key]: storageMock[key],
    }));

    const result = await getSession();

    expect(result).not.toBeNull();
    expect(result?.token).toBe(validSession.token);
  });

  it("clearSession removes the session from storage", async () => {
    storageMock["session"] = validSession;

    chromeMock.storage.session.remove.mockImplementation(async (key: string) => {
      delete storageMock[key];
    });

    await clearSession();

    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });
});

describe("§9.2.8 – 401 response causes apiFetch to throw", () => {
  it("a 401 from the API throws an Unauthorized error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ message: "Unauthorized" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    // Import apiFetch directly (real module, not mocked)
    const { apiFetch } = await import("@/background/apiClient");
    await expect(apiFetch("https://api.example.com/test", {})).rejects.toThrow("Unauthorized");
  });

  it("apiFetch throws with generic message for non-JSON 401 body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/background/apiClient");
    await expect(apiFetch("https://api.example.com/test", {})).rejects.toThrow(
      "Request failed with status 401",
    );
  });
});

describe("§9.2.8 – token never appears in console.* logs", () => {
  it("saveSession does not log the token to console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    chromeMock.storage.session.set.mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(storageMock, items);
    });

    await saveSession(validSession);

    const token = validSession.token;
    const allCalls = [
      ...logSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...debugSpy.mock.calls,
    ];

    for (const call of allCalls) {
      const serialized = JSON.stringify(call);
      expect(serialized, "saveSession must not log the token").not.toContain(token);
    }

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("getSession does not log the token to console", async () => {
    storageMock["session"] = validSession;

    chromeMock.storage.session.get.mockImplementation(async (key: string) => ({
      [key]: storageMock[key],
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await getSession();

    const token = validSession.token;
    const allCalls = [
      ...logSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...debugSpy.mock.calls,
    ];

    for (const call of allCalls) {
      const serialized = JSON.stringify(call);
      expect(serialized, "getSession must not log the token").not.toContain(token);
    }

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("apiFetch error path does not log the token value", async () => {
    const testToken = "my-very-secret-bearer-token";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ message: "Unauthorized" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { apiFetch } = await import("@/background/apiClient");

    try {
      await apiFetch("https://api.example.com/protected", { token: testToken });
    } catch {
      // expected to throw
    }

    const allCalls = [
      ...logSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...debugSpy.mock.calls,
    ];

    for (const call of allCalls) {
      const serialized = JSON.stringify(call);
      expect(serialized, "apiFetch must not log the token value").not.toContain(testToken);
    }

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
