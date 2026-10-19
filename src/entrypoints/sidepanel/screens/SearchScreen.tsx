import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import type { RecordType } from "@/shared/contracts/recordType";
import { FILTER_CONFIG } from "@/shared/contracts/filterConfig";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordTypeTabs } from "@/components/RecordTypeTabs";
import { SearchResult } from "@/components/SearchResult";
import { FilterBar } from "@/components/FilterBar";
import { useSearch } from "../hooks/useSearch";
import { RECORD_REGISTRY } from "@/records/registry";
import { Search, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
  return (row: unknown) => {
    const r = row as RawRow;
    return {
      personal: { familyName: r.lastName, givenNames: r.firstName },
      contact: { email: r.email, mobile: r.mobile ?? r.phone },
    };
  };
}

// ── Avatar skeleton card ───────────────────────────────────────────────────────
function ResultSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SearchScreen({ onSelectClient, focusRef }: SearchScreenProps) {
  const [recordType, setRecordType] = useState<RecordType>("lead");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const { results, count, loading, error, hasMore, search, loadMore } = useSearch();

  // Load all records on mount
  useEffect(() => {
    search(recordType, "", 1, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire external focus ref
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

  const handleClearQ = useCallback(() => {
    setQ("");
    search(recordType, "", 1, activeFilters);
    searchInputRef.current?.focus();
  }, [recordType, activeFilters, search]);

  const handleRecordTypeChange = useCallback(
    (rt: RecordType) => {
      setRecordType(rt);
      setQ("");
      setActiveFilters({});
      search(rt, "", 1, {});
    },
    [search],
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

  const showCount = !loading && !error && results.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <RecordTypeTabs selected={recordType} onChange={handleRecordTypeChange} />

        {/* Search input */}
        <div className={cn(
          "flex items-center gap-2 px-3 h-9 rounded-lg border bg-muted/40",
          "transition-all duration-150",
          focused && "border-primary ring-1 ring-primary bg-background",
        )}>
          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search clients"
            placeholder="Search by name, email…"
            value={q}
            onChange={handleQChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            className={cn(
              "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60",
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          {q && (
            <button
              onClick={handleClearQ}
              aria-label="Clear search"
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {FILTER_CONFIG.length > 0 && (
          <FilterBar
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onClearFilter={handleClearFilter}
            onClearAll={handleClearAll}
          />
        )}
      </div>

      {/* ── Result list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Error */}
        {error && !loading && (
          <div className="p-4 text-center">
            <p role="alert" className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && results.length === 0 && (
          <div aria-busy="true" aria-label="Loading results">
            {Array.from({ length: 6 }).map((_, i) => (
              <ResultSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center px-6">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {q.length > 0 ? "No results for that search" : "No records found"}
            </p>
            {q.length > 0 && (
              <button
                onClick={handleClearQ}
                className="text-xs text-primary underline underline-offset-2"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div role="list" aria-label={`${count} results`} className="divide-y divide-border/50">
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
              size="sm"
              onClick={loadMore}
              aria-label={`Load more results`}
            >
              Load more
            </Button>
          </div>
        )}

        {/* Loading more */}
        {loading && results.length > 0 && (
          <ResultSkeleton />
        )}
      </div>

      {/* ── Footer count ────────────────────────────────────────────────── */}
      {showCount && (
        <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {results.length} of {count}
          </span>
          {q && (
            <span className="text-xs text-muted-foreground">
              Results for <span className="font-medium text-foreground">"{q}"</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
