import { useState, useCallback, useRef } from "react";
import type { RecordType } from "@/shared/contracts/recordType";
import type {
  MessageResponse,
  RecordsSearchRequest,
  SearchResponse,
} from "@/shared/contracts/messages";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  SEARCH_LIMIT,
  PAGINATION,
} from "@/shared/config";

type UseSearchReturn = {
  results: unknown[];
  count: number;
  loading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  search: (
    recordType: RecordType,
    q: string,
    page: number,
    filters: Record<string, string>,
  ) => void;
  loadMore: () => void;
  reset: () => void;
};

export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<unknown[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(PAGINATION.base);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef<{ q: string; page: number } | null>(null);
  const currentParamsRef = useRef<{
    recordType: RecordType;
    q: string;
    filters: Record<string, string>;
  } | null>(null);

  const doSearch = useCallback(
    (
      recordType: RecordType,
      q: string,
      pg: number,
      filters: Record<string, string>,
      append: boolean,
    ) => {
      if (q.length < SEARCH_MIN_CHARS) {
        setResults([]);
        setCount(0);
        setLoading(false);
        return;
      }

      const queryKey = { q, page: pg };
      currentQueryRef.current = queryKey;

      setLoading(true);
      setError(null);

      const msg: RecordsSearchRequest = {
        type: "records.search",
        payload: { recordType, q, page: pg, filters },
      };

      chrome.runtime.sendMessage(
        msg,
        (response: MessageResponse<SearchResponse<unknown>> | undefined) => {
          // Stale-result guard
          if (
            currentQueryRef.current?.q !== q ||
            currentQueryRef.current?.page !== pg
          ) {
            return;
          }

          setLoading(false);

          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message ?? "Search failed");
            return;
          }

          if (response?.ok) {
            const { rows, count: total } = response.data;
            if (append) {
              setResults((prev) => [...prev, ...rows]);
            } else {
              setResults(rows);
            }
            setCount(total);
          } else {
            setError(response?.error ?? "Search failed");
          }
        },
      );
    },
    [],
  );

  const search = useCallback(
    (
      recordType: RecordType,
      q: string,
      pg: number,
      filters: Record<string, string>,
    ) => {
      currentParamsRef.current = { recordType, q, filters };
      setPage(pg);

      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        doSearch(recordType, q, pg, filters, false);
      }, SEARCH_DEBOUNCE_MS);
    },
    [doSearch],
  );

  const loadMore = useCallback(() => {
    const params = currentParamsRef.current;
    if (!params) return;
    const nextPage = page + 1;
    setPage(nextPage);
    doSearch(params.recordType, params.q, nextPage, params.filters, true);
  }, [page, doSearch]);

  const reset = useCallback(() => {
    setResults([]);
    setCount(0);
    setLoading(false);
    setError(null);
    setPage(PAGINATION.base);
    currentQueryRef.current = null;
    currentParamsRef.current = null;
  }, []);

  const hasMore = results.length < count && results.length >= SEARCH_LIMIT;

  return { results, count, loading, error, page, hasMore, search, loadMore, reset };
}
