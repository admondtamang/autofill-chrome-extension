import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import type { RecordType } from "@/shared/contracts/recordType";
import { FILTER_CONFIG } from "@/shared/contracts/filterConfig";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordTypeTabs } from "@/components/RecordTypeTabs";
import { SearchResult } from "@/components/SearchResult";
import { FilterBar } from "@/components/FilterBar";
import { useSearch } from "../hooks/useSearch";
import { RECORD_REGISTRY } from "@/records/registry";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";

type RawRow = {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  phone?: string;
};

type SearchScreenProps = {
  onSelectClient: (
    recordType: RecordType,
    id: number,
    transform: (row: unknown) => ApplicantProfile,
  ) => void;
  focusRef?: React.MutableRefObject<HTMLElement | null>;
};

function getTransform(recordType: RecordType): (row: unknown) => ApplicantProfile {
  const def = RECORD_REGISTRY.get(recordType);
  if (def) return def.toApplicantProfile as (row: unknown) => ApplicantProfile;
  // Fallback: minimal transform
  return (row: unknown) => {
    const r = row as RawRow;
    return {
      personal: { familyName: r.lastName, givenNames: r.firstName },
      contact: { email: r.email, mobile: r.mobile ?? r.phone },
    };
  };
}

export function SearchScreen({ onSelectClient, focusRef }: SearchScreenProps) {
  const [recordType, setRecordType] = useState<RecordType>("visaApplicant");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );

  const { results, count, loading, error, hasMore, search, loadMore } =
    useSearch();

  // Load all records on mount
  useEffect(() => {
    search(recordType, "", 1, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire external focus ref to the search input
  React.useEffect(() => {
    if (focusRef && searchInputRef.current) {
      focusRef.current = searchInputRef.current;
    }
  }, [focusRef]);

  const handleQChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQ(value);
      search(recordType, value, 1, activeFilters);
    },
    [recordType, activeFilters, search],
  );

  const handleRecordTypeChange = useCallback(
    (rt: RecordType) => {
      setRecordType(rt);
      search(rt, q, 1, activeFilters);
    },
    [q, activeFilters, search],
  );

  const handleFilterChange = useCallback(
    (param: string, value: string) => {
      const next = { ...activeFilters, [param]: value };
      setActiveFilters(next);
      search(recordType, q, 1, next);
    },
    [activeFilters, recordType, q, search],
  );

  const handleClearFilter = useCallback(
    (param: string) => {
      const next = { ...activeFilters };
      delete next[param];
      setActiveFilters(next);
      search(recordType, q, 1, next);
    },
    [activeFilters, recordType, q, search],
  );

  const handleClearAll = useCallback(() => {
    setActiveFilters({});
    search(recordType, q, 1, {});
  }, [recordType, q, search]);

  const handleResultClick = useCallback(
    (row: RawRow) => {
      onSelectClient(recordType, row.id, getTransform(recordType));
    },
    [recordType, onSelectClient],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <RecordTypeTabs selected={recordType} onChange={handleRecordTypeChange} />
        <Input
          ref={searchInputRef}
          type="search"
          aria-label="Search clients"
          placeholder="Search by name…"
          value={q}
          onChange={handleQChange}
          autoFocus
        />
        {FILTER_CONFIG.length > 0 && (
          <FilterBar
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onClearFilter={handleClearFilter}
            onClearAll={handleClearAll}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Error state */}
        {error && !loading && (
          <p role="alert" className="p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Loading skeletons */}
        {loading && results.length === 0 && (
          <div className="p-3 space-y-2" aria-busy="true" aria-label="Loading results">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && results.length === 0 && (
          <p role="status" className="p-3 text-sm text-muted-foreground text-center">
            {q.length > 0 ? "No results found." : "No records available."}
          </p>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div role="list" aria-label={`${count} results`} className="py-1">
            {results.map((rawResult) => {
              const row = rawResult as RawRow;
              return (
                <div key={row.id} role="listitem">
                  <SearchResult
                    id={row.id}
                    firstName={row.firstName ?? ""}
                    lastName={row.lastName ?? ""}
                    recordType={recordType}
                    email={row.email}
                    phone={row.mobile ?? row.phone}
                    onClick={() => handleResultClick(row)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
              aria-label={`Load more results (${count - results.length} remaining)`}
            >
              Load more
            </Button>
          </div>
        )}

        {/* Loading more indicator */}
        {loading && results.length > 0 && (
          <div className="p-3 space-y-2" aria-busy="true" aria-label="Loading more results">
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-right">
          Showing {results.length} of {count}
        </div>
      )}
    </div>
  );
}
