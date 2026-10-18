import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/shared/contracts/messages";
import { clearSession, getSession, saveSession } from "../session";

// Mock chrome.storage.session
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
  // Clear storage
  for (const key of Object.keys(storageMock)) {
    delete storageMock[key];
  }
  vi.clearAllMocks();
  vi.setSystemTime(NOW_SECONDS * 1000);
});

const validSession: SessionData = {
  token: "test-token",
  expiry: NOW_SECONDS + 3600, // 1 hour from now
  user: {
    id: 1,
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    roleId: 1,
    branchId: null,
  },
};

describe("getSession", () => {
  it("returns null when storage is empty", async () => {
    const result = await getSession();
    expect(result).toBeNull();
  });

  it("returns session data when valid and not expired", async () => {
    storageMock["session"] = validSession;
    const result = await getSession();
    expect(result).toEqual(validSession);
  });

  it("returns null and clears session when expired (past expiry - 60)", async () => {
    const expiredSession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS - 1, // already past
    };
    storageMock["session"] = expiredSession;

    const result = await getSession();
    expect(result).toBeNull();
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });

  it("returns null and clears session when within 60s of expiry", async () => {
    const almostExpiredSession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS + 59, // within 60s grace window
    };
    storageMock["session"] = almostExpiredSession;

    const result = await getSession();
    expect(result).toBeNull();
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });

  it("returns session when exactly at boundary (60s remaining)", async () => {
    // expiry - 60 === NOW_SECONDS means Date.now()/1000 >= expiry - 60 is true
    // So with exactly 60s left it's expired per the rule
    const boundarySession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS + 60, // Date.now()/1000 = NOW_SECONDS, expiry - 60 = NOW_SECONDS → equal, expired
    };
    storageMock["session"] = boundarySession;

    const result = await getSession();
    expect(result).toBeNull();
  });

  it("returns session when more than 60s remaining", async () => {
    const okSession: SessionData = {
      ...validSession,
      expiry: NOW_SECONDS + 61,
    };
    storageMock["session"] = okSession;

    const result = await getSession();
    expect(result).toEqual(okSession);
  });
});

describe("saveSession", () => {
  it("saves session data to storage", async () => {
    await saveSession(validSession);
    expect(chromeMock.storage.session.set).toHaveBeenCalledWith({ session: validSession });
  });
});

describe("clearSession", () => {
  it("removes session from storage", async () => {
    storageMock["session"] = validSession;
    await clearSession();
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("session");
  });
});
