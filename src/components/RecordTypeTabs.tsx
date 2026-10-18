import type { RecordType } from "@/shared/contracts/recordType";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: RecordType; label: string }> = [
  { value: "visaApplicant", label: "Visa Applicant" },
  { value: "student", label: "Student" },
  { value: "lead", label: "Lead" },
];

type RecordTypeTabsProps = {
  selected: RecordType;
  onChange: (value: RecordType) => void;
};

export function RecordTypeTabs({ selected, onChange }: RecordTypeTabsProps) {
  return (
    <div role="tablist" aria-label="Record type" className="flex gap-1">
      {TABS.map(({ value, label }) => (
        <Button
          key={value}
          role="tab"
          aria-selected={selected === value}
          variant={selected === value ? "default" : "outline"}
          size="sm"
          className={cn(
            "flex-1",
            selected === value && "shadow-none",
          )}
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
