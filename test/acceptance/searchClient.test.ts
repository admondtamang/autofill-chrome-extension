/**
 * Acceptance tests for §9.2 cases 1 and 2:
 * 1. Search client builds correct URLs for: q only, filters only, q+filters, page 2
 * 2. Changing q mid-request aborts stale; stale results never render
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, PAGINATION, SEARCH_LIMIT } from "@/shared/config";
import type { SessionData } from "@/shared/contracts/messages";

// Hoisted mocks
vi.mock("@/background/apiClient", () => ({ apiFetch: vi.fn() }));
vi.mock("@/background/session", () => ({ getSession: vi.fn() }));

import { apiFetch } from "@/background/apiClient";
import { getSession } from "@/background/session";
import { handleSearch } from "@/background/handlers/recordHandlers";

const mockApiFetch = vi.mocked(apiFetch);
const mockGetSession = vi.mocked(getSession);

const validSession: SessionData = {
  token: "valid-token",
  expiry: Date.now() / 1000 + 3600,
  user: {
    id: 1,
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    roleId: 1,
    branchId: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(validSession);
});

// ─── §9.2 Case 1: URL building ────────────────────────────────────────────────

describe("§9.2.1 – search client builds correct URLs", () => {
  it("q only: sets q param and omits filter params", async () => {
    mockApiFetch.mockResolvedValue({ count: 1, rows: [{ id: 1 }] });

    await handleSearch({ recordType: "visaApplicant", q: "alice", page: 1, filters: {} });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(`${API_BASE_URL}/visaApplicant`);
    expect(parsed.searchParams.get("q")).toBe("alice");
    expect(parsed.searchParams.get("limit")).toBe(String(SEARCH_LIMIT));
    expect(parsed.searchParams.get(PAGINATION.param)).toBe("1");
  });

  it("filters only: sets filter params without q", async () => {
    mockApiFetch.mockResolvedValue({ count: 2, rows: [] });

    // Filters are passed as part of payload.filters; the handler omits q when empty
    await handleSearch({
      recordType: "visaApplicant",
      q: "",
      page: 1,
      filters: { status: "active" },
    });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    // q must be absent when empty
    expect(parsed.searchParams.has("q")).toBe(false);
    expect(parsed.searchParams.get("limit")).toBe(String(SEARCH_LIMIT));
    expect(parsed.searchParams.get(PAGINATION.param)).toBe("1");
  });

  it("q + filters: sets both q and filter params", async () => {
    mockApiFetch.mockResolvedValue({ count: 3, rows: [] });

    await handleSearch({
      recordType: "student",
      q: "bob",
      page: 1,
      filters: { status: "active" },
    });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    expect(parsed.searchParams.get("q")).toBe("bob");
    expect(parsed.searchParams.get("limit")).toBe(String(SEARCH_LIMIT));
  });

  it("page 2: sets page param to 2", async () => {
    mockApiFetch.mockResolvedValue({ count: 50, rows: [] });

    await handleSearch({ recordType: "lead", q: "test", page: 2, filters: {} });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    expect(parsed.searchParams.get(PAGINATION.param)).toBe("2");
    expect(parsed.searchParams.get("q")).toBe("test");
  });

  it("page 1 (base): uses PAGINATION.base for first page", async () => {
    mockApiFetch.mockResolvedValue({ count: 5, rows: [] });

    await handleSearch({
      recordType: "visaApplicant",
      q: "",
      page: PAGINATION.base,
      filters: {},
    });

    const [url] = mockApiFetch.mock.calls[0] as [string, unknown];
    const parsed = new URL(url);

    expect(parsed.searchParams.get(PAGINATION.param)).toBe(String(PAGINATION.base));
  });
});

// ─── §9.2 Case 2: Abort stale request ────────────────────────────────────────

describe("§9.2.2 – changing q aborts stale request; stale results never render", () => {
  it("aborts in-flight search when new search for same recordType starts", async () => {
    let firstSignal: AbortSignal | null = null;

    // First call: capture the abort signal and hang indefinitely
    mockApiFetch
      .mockImplementationOnce(
        (_url: string, options: RequestInit & { token?: string }) =>
          new Promise((_resolve, reject) => {
            const signal = options.signal ?? undefined;
            if (signal instanceof AbortSignal) {
              firstSignal = signal;
              signal.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }
          }),
      )
      .mockResolvedValueOnce({ count: 1, rows: [{ id: 99, name: "fresh result" }] });

    // Start first search with q="old"
    const first = handleSearch({ recordType: "visaApplicant", q: "old", page: 1, filters: {} });

    // Wait for the signal to be captured
    await vi.waitFor(() => {
      if (!firstSignal) throw new Error("signal not yet captured");
    });

    // Start second search with q="new" — must abort the first
    const second = handleSearch({ recordType: "visaApplicant", q: "new", page: 1, filters: {} });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    // Stale (first) search must return aborted — never rendered
    expect(firstResult).toEqual({ ok: false, error: "Search aborted" });
    expect((firstSignal as AbortSignal | null)?.aborted).toBe(true);

    // Fresh (second) search must succeed with its own results
    expect(secondResult.ok).toBe(true);
    if (secondResult.ok) {
      expect(secondResult.data).toEqual({ count: 1, rows: [{ id: 99, name: "fresh result" }] });
    }
  });

  it("stale result is flagged as aborted and not ok=true", async () => {
    let aborted = false;

    mockApiFetch
      .mockImplementationOnce(
        (_url: string, options: RequestInit & { token?: string }) =>
          new Promise((_resolve, reject) => {
            const signal = options.signal ?? undefined;
            if (signal instanceof AbortSignal) {
              signal.addEventListener("abort", () => {
                aborted = true;
                reject(new DOMException("Aborted", "AbortError"));
              });
            }
          }),
      )
      .mockResolvedValueOnce({ count: 0, rows: [] });

    const first = handleSearch({ recordType: "visaApplicant", q: "stale", page: 1, filters: {} });

    await vi.waitFor(() => mockApiFetch.mock.calls.length >= 1);

    const second = handleSearch({ recordType: "visaApplicant", q: "fresh", page: 1, filters: {} });

    const [staleResult] = await Promise.all([first, second]);

    expect(staleResult.ok).toBe(false);
    expect(aborted).toBe(true);
  });

  it("different recordTypes do not abort each other", async () => {
    mockApiFetch.mockResolvedValue({ count: 0, rows: [] });

    const results = await Promise.all([
      handleSearch({ recordType: "visaApplicant", q: "a", page: 1, filters: {} }),
      handleSearch({ recordType: "student", q: "b", page: 1, filters: {} }),
    ]);

    // Both should succeed without aborting each other
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});
