import { API_BASE_URL, PAGINATION, SEARCH_LIMIT } from "@/shared/config";
import type {
  MessageResponse,
  RecordsGetRequest,
  RecordsSearchRequest,
  SearchResponse,
} from "@/shared/contracts/messages";
import { apiFetch } from "../apiClient";
import { getSession } from "../session";

const ALLOWED_RECORD_TYPES = ["visaApplicant", "student", "lead"] as const;

// One AbortController per active search, keyed by recordType
const activeControllers = new Map<string, AbortController>();

// In-memory cache of rows keyed by "type:id"
const rowCache = new Map<string, unknown>();

export function clearRowCache(): void {
  rowCache.clear();
}

export async function handleSearch(
  payload: RecordsSearchRequest["payload"],
): Promise<MessageResponse<SearchResponse<unknown>>> {
  const { recordType, q, page } = payload;

  if (!ALLOWED_RECORD_TYPES.includes(recordType)) {
    return { ok: false, error: "Invalid record type" };
  }

  // Abort any in-flight search for this recordType
  const existing = activeControllers.get(recordType);
  if (existing !== undefined) {
    existing.abort();
  }

  const controller = new AbortController();
  activeControllers.set(recordType, controller);

  try {
    const session = await getSession();
    if (session === null) {
      return { ok: false, error: "Not authenticated" };
    }

    const url = new URL(`${API_BASE_URL}/${recordType}`);
    url.searchParams.set("limit", String(SEARCH_LIMIT));
    url.searchParams.set(PAGINATION.param, String(page));
    if (q !== "") {
      url.searchParams.set("q", q);
    }

    const result = await apiFetch<SearchResponse<Record<string, unknown>>>(url.toString(), {
      token: session.token,
      signal: controller.signal,
    });

    // Store rows in cache keyed by "type:id"
    for (const row of result.rows) {
      const id = row["id"];
      if (id !== undefined && id !== null) {
        rowCache.set(`${recordType}:${String(id)}`, row);
      }
    }

    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Search aborted" };
    }
    const message = err instanceof Error ? err.message : "Search failed";
    return { ok: false, error: message };
  } finally {
    // Clean up controller if it's still the active one
    if (activeControllers.get(recordType) === controller) {
      activeControllers.delete(recordType);
    }
  }
}

export async function handleGet(
  payload: RecordsGetRequest["payload"],
): Promise<MessageResponse<unknown>> {
  const { recordType, id } = payload;
  const key = `${recordType}:${String(id)}`;
  const cached = rowCache.get(key);

  if (cached === undefined) {
    return { ok: false, error: "Not found" };
  }

  return { ok: true, data: cached };
}
