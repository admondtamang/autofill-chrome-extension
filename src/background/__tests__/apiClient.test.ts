import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_HEADER_NAME, AUTH_HEADER_PREFIX } from "@/shared/config";
import { apiFetch } from "../apiClient";

function makeFetchMock(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("apiFetch", () => {
  it("attaches auth header when token is provided", async () => {
    const mockFetch = makeFetchMock(200, { data: "ok" });
    vi.stubGlobal("fetch", mockFetch);

    await apiFetch<{ data: string }>("https://example.com/api", {
      token: "my-test-token",
    });

    const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    const headers = init.headers as Headers;
    expect(headers.get(AUTH_HEADER_NAME)).toBe(`${AUTH_HEADER_PREFIX} my-test-token`);
  });

  it("does not attach auth header when token is absent", async () => {
    const mockFetch = makeFetchMock(200, { result: true });
    vi.stubGlobal("fetch", mockFetch);

    await apiFetch<{ result: boolean }>("https://example.com/api", {});

    const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    const headers = init.headers as Headers;
    expect(headers.get(AUTH_HEADER_NAME)).toBeNull();
  });

  it("resolves with parsed JSON on 2xx response", async () => {
    const payload = { count: 5, rows: [] };
    vi.stubGlobal("fetch", makeFetchMock(200, payload));

    const result = await apiFetch<typeof payload>("https://example.com/api", {});
    expect(result).toEqual(payload);
  });

  it("throws error with message from body on non-2xx", async () => {
    vi.stubGlobal("fetch", makeFetchMock(401, { message: "Unauthorized access" }));

    await expect(apiFetch("https://example.com/api", {})).rejects.toThrow("Unauthorized access");
  });

  it("throws generic error message when body has no message field", async () => {
    vi.stubGlobal("fetch", makeFetchMock(500, { error: "internal" }));

    await expect(apiFetch("https://example.com/api", {})).rejects.toThrow(
      "Request failed with status 500",
    );
  });

  it("throws generic error message when body is not JSON", async () => {
    const nonJsonFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response);
    vi.stubGlobal("fetch", nonJsonFetch);

    await expect(apiFetch("https://example.com/api", {})).rejects.toThrow(
      "Request failed with status 503",
    );
  });

  it("does not attach auth header when token is empty string", async () => {
    const mockFetch = makeFetchMock(200, {});
    vi.stubGlobal("fetch", mockFetch);

    await apiFetch("https://example.com/api", { token: "" });

    const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    const headers = init.headers as Headers;
    expect(headers.get(AUTH_HEADER_NAME)).toBeNull();
  });
});
