import type { RecordType } from "@/shared/contracts/recordType";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: RecordType; label: string }> = [
  { value: "lead",          label: "Lead" },
  { value: "visaApplicant", label: "Visa Applicant" },
  { value: "student",       label: "Student" },
];

type RecordTypeTabsProps = {
  selected: RecordType;
  onChange: (value: RecordType) => void;
};

export function RecordTypeTabs({ selected, onChange }: RecordTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Record type"
      className="flex gap-1 p-0.5 rounded-lg bg-muted"
    >
      {TABS.map(({ value, label }) => (
        <button
          key={value}
          role="tab"
          aria-selected={selected === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex-1 text-xs font-medium px-2 py-1.5 rounded-md transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
