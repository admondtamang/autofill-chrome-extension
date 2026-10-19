import * as React from "react";
import type { RecordType } from "@/shared/contracts/recordType";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<RecordType, { label: string; color: string; bg: string }> = {
  lead:          { label: "Lead",          color: "text-violet-700", bg: "bg-violet-100" },
  visaApplicant: { label: "Visa Applicant", color: "text-blue-700",   bg: "bg-blue-100"   },
  student:       { label: "Student",        color: "text-emerald-700", bg: "bg-emerald-100" },
};

function getInitials(first: string, last: string): string {
  return [(first[0] ?? ""), (last[0] ?? "")].join("").toUpperCase() || "?";
}

type SearchResultProps = {
  id: number;
  firstName: string;
  lastName: string;
  recordType: RecordType;
  email?: string;
  phone?: string;
  onClick: () => void;
};

export function SearchResult({
  firstName,
  lastName,
  recordType,
  email,
  phone,
  onClick,
}: SearchResultProps) {
  const cfg = TYPE_CONFIG[recordType];
  const displayName = `${firstName} ${lastName}`.trim() || "Unknown";
  const contact = email ?? phone ?? "";
  const initials = getInitials(firstName, lastName);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`Select ${displayName}${contact ? `, ${contact}` : ""}`}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 cursor-pointer",
        "transition-colors duration-100",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        "text-xs font-semibold select-none",
        cfg.bg, cfg.color,
      )}>
        {initials}
      </div>

      {/* Name + contact */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <span className={cn(
            "flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            cfg.bg, cfg.color,
          )}>
            {cfg.label}
          </span>
        </div>
        {contact && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{contact}</p>
        )}
      </div>

      {/* Arrow */}
      <ChevronRight className={cn(
        "flex-shrink-0 h-4 w-4 text-muted-foreground/40",
        "transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-muted-foreground",
      )} />
    </div>
  );
}
