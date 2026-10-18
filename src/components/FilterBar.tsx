import { X } from "lucide-react";
import type { FilterConfig } from "@/shared/contracts/filterConfig";
import { FILTER_CONFIG } from "@/shared/contracts/filterConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ActiveFilters = Record<string, string>;

type FilterBarProps = {
  activeFilters: ActiveFilters;
  onFilterChange: (param: string, value: string) => void;
  onClearFilter: (param: string) => void;
  onClearAll: () => void;
};

export function FilterBar({
  activeFilters,
  onFilterChange,
  onClearFilter,
  onClearAll,
}: FilterBarProps) {
  const activeChips = Object.entries(activeFilters).filter(
    ([, v]) => v !== "",
  );

  return (
    <div className={FILTER_CONFIG.length === 0 ? "hidden" : "space-y-2 p-2"}>
      <div className="flex flex-wrap gap-2">
        {FILTER_CONFIG.map((cfg: FilterConfig) => (
          <div key={cfg.param} className="flex flex-col gap-1">
            <Label htmlFor={`filter-${cfg.param}`}>{cfg.label}</Label>
            {cfg.type === "select" || cfg.type === "multiselect" ? (
              <select
                id={`filter-${cfg.param}`}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={activeFilters[cfg.param] ?? ""}
                onChange={(e) => onFilterChange(cfg.param, e.target.value)}
                aria-label={cfg.label}
              >
                <option value="">All</option>
                {cfg.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : cfg.type === "date-range" ? (
              <Input
                id={`filter-${cfg.param}`}
                type="date"
                aria-label={cfg.label}
                value={activeFilters[cfg.param] ?? ""}
                onChange={(e) => onFilterChange(cfg.param, e.target.value)}
                className="w-40"
              />
            ) : (
              <Input
                id={`filter-${cfg.param}`}
                type="text"
                aria-label={cfg.label}
                value={activeFilters[cfg.param] ?? ""}
                onChange={(e) => onFilterChange(cfg.param, e.target.value)}
                className="w-40"
              />
            )}
          </div>
        ))}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {activeChips.map(([param, value]) => {
            const cfg = FILTER_CONFIG.find((c) => c.param === param);
            const displayLabel = cfg?.label ?? param;
            const displayValue =
              cfg?.options?.find((o) => o.value === value)?.label ?? value;
            return (
              <Badge key={param} variant="secondary" className="gap-1">
                {displayLabel}: {displayValue}
                <button
                  type="button"
                  aria-label={`Remove ${displayLabel} filter`}
                  className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onClearFilter(param)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onClearAll}
            aria-label="Clear all filters"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
