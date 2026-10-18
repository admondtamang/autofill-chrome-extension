import * as React from "react";
import type { RecordType } from "@/shared/contracts/recordType";
import { Badge } from "@/components/ui/badge";

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  visaApplicant: "Visa Applicant",
  student: "Student",
  lead: "Lead",
};

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
  const displayName = `${firstName} ${lastName}`.trim() || "Unknown";
  const contact = email ?? phone ?? "";

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
      className="flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`Select ${displayName}, ${RECORD_TYPE_LABELS[recordType]}${contact ? `, ${contact}` : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{displayName}</span>
        <Badge variant="secondary" className="text-xs">
          {RECORD_TYPE_LABELS[recordType]}
        </Badge>
      </div>
      {contact && (
        <span className="text-xs text-muted-foreground">{contact}</span>
      )}
    </div>
  );
}
