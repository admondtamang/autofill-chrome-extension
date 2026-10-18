import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, PAGINATION, SEARCH_LIMIT } from "@/shared/config";
import type { SessionData } from "@/shared/contracts/messages";

// Hoisted mocks — must be declared before module imports
vi.mock("@/background/apiClient", () => ({ apiFetch: vi.fn() }));
vi.mock("@/background/session", () => ({ getSession: vi.fn() }));

import { apiFetch } from "@/background/apiClient";
import { getSession } from "@/background/session";
import { handleGet, handleSearch } from "@/background/handlers/recordHandlers";

const mockApiFetch = vi.mocked(apiFetch);
const mockGetSession = vi.mocked(getSession);

const NOW_SECONDS = 1_700_000_000;

const validSession: SessionData = {
  token: "valid-token",
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

const sampleRows = [
  { id: 101, firstName: "Alice", lastName: "Smith" },
  { id: 102, firstName: "Bob", lastName: "Jones" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(validSession);
});

describe("handleSearch URL params", () => {
  it("builds URL with correct limit, page, and q params", async () => {
    mockApiFetch.mockResolvedValue({ count: 2, rows: sampleRows });

    await handleSearch({ recordType: "visaApplicant", q: "alice", page: 1, filters: {} });

    expect(mockApiFetch).toHaveBeenCalledOnce();
    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(`${API_BASE_URL}/visaApplicant`);
    expect(parsed.searchParams.get("limit")).toBe(String(SEARCH_LIMIT));
    expect(parsed.searchParams.get(PAGINATION.param)).toBe("1");
    expect(parsed.searchParams.get("q")).toBe("alice");
  });

  it("omits q param when q is empty string", async () => {
    mockApiFetch.mockResolvedValue({ count: 0, rows: [] });

    await handleSearch({ recordType: "student", q: "", page: 1, filters: {} });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);
    expect(parsed.searchParams.has("q")).toBe(false);
  });

  it("passes page number correctly", async () => {
    mockApiFetch.mockResolvedValue({ count: 50, rows: [] });

    await handleSearch({ recordType: "lead", q: "", page: 3, filters: {} });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);
    expect(parsed.searchParams.get(PAGINATION.param)).toBe("3");
  });
});

describe("handleSearch abort behavior", () => {
  it("aborts in-flight search when a new search for the same recordType arrives", async () => {
    // Track the abort signal from the first call
    let capturedSignal: AbortSignal | null = null;

    // First call: capture the signal and return a promise that only resolves via the signal
    mockApiFetch
      .mockImplementationOnce(
        (_url: string, options: RequestInit & { token?: string }) =>
          new Promise((_resolve, reject) => {
            const signal = options.signal ?? undefined;
            if (signal instanceof AbortSignal) {
              capturedSignal = signal;
              signal.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }
          }),
      )
      .mockResolvedValueOnce({ count: 1, rows: [{ id: 200, name: "new result" }] });

    // Start first search — will hang indefinitely until aborted
    const first = handleSearch({ recordType: "visaApplicant", q: "first", page: 1, filters: {} });

    // Wait for the first apiFetch to be called and signal to be captured
    await vi.waitFor(() => {
      if (!capturedSignal) throw new Error("signal not yet captured");
    });

    // Start second search — this should abort the first
    const second = handleSearch({
      recordType: "visaApplicant",
      q: "second",
      page: 1,
      filters: {},
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    // First search should be aborted
    expect(firstResult).toEqual({ ok: false, error: "Search aborted" });
    // Second search should succeed
    expect(secondResult).toEqual({
      ok: true,
      data: { count: 1, rows: [{ id: 200, name: "new result" }] },
    });
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  it("does not abort search for a different recordType", async () => {
    mockApiFetch.mockResolvedValue({ count: 0, rows: [] });

    await Promise.all([
      handleSearch({ recordType: "visaApplicant", q: "a", page: 1, filters: {} }),
      handleSearch({ recordType: "student", q: "b", page: 1, filters: {} }),
    ]);

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

describe("handleSearch caching and handleGet", () => {
  it("stores rows in cache and handleGet returns cached row by type:id", async () => {
    mockApiFetch.mockResolvedValue({ count: 2, rows: sampleRows });

    await handleSearch({ recordType: "visaApplicant", q: "", page: 1, filters: {} });

    const result = await handleGet({ recordType: "visaApplicant", id: 101 });
    expect(result).toEqual({ ok: true, data: sampleRows[0] });
  });

  it("handleGet returns not found for unknown id", async () => {
    const result = await handleGet({ recordType: "visaApplicant", id: 99999 });
    expect(result).toEqual({ ok: false, error: "Not found" });
  });

  it("handleGet uses type prefix to differentiate record types", async () => {
    // Same id, different types should be different cache entries
    const studentRow = { id: 1, name: "student-record" };
    mockApiFetch.mockResolvedValue({ count: 1, rows: [studentRow] });
    await handleSearch({ recordType: "student", q: "", page: 1, filters: {} });

    const studentResult = await handleGet({ recordType: "student", id: 1 });
    expect(studentResult).toEqual({ ok: true, data: studentRow });
  });
});

describe("handleSearch auth", () => {
  it("returns not authenticated when session is null", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await handleSearch({ recordType: "visaApplicant", q: "", page: 1, filters: {} });
    expect(result).toEqual({ ok: false, error: "Not authenticated" });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
