import * as React from "react";
import type { FillReport } from "@/shared/contracts/fillReport";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type FillReportSheetProps = {
  fillReport: FillReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FillReportSheet({
  fillReport,
  open,
  onOpenChange,
}: FillReportSheetProps) {
  if (!fillReport) return null;

  const summary = [
    `Filled: ${fillReport.filled.length}`,
    `Skipped: ${fillReport.skipped.length}`,
    `Not found: ${fillReport.notFound.length}`,
    `Failed: ${fillReport.failed.length}`,
  ].join(", ");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Fill Report</SheetTitle>
          <SheetDescription>
            Results from the last fill action.
          </SheetDescription>
        </SheetHeader>

        {/* aria-live region for screen reader announcements */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {open ? summary : ""}
        </div>

        <div className="mt-4 space-y-4">
          {/* Filled */}
          <Section
            title="Filled"
            count={fillReport.filled.length}
            badgeVariant="success"
          >
            {fillReport.filled.map((path) => (
              <p key={path} className="text-xs text-muted-foreground">
                {path}
              </p>
            ))}
          </Section>

          <Separator />

          {/* Skipped */}
          <Section
            title="Skipped"
            count={fillReport.skipped.length}
            badgeVariant="secondary"
          >
            {fillReport.skipped.map((path) => (
              <p key={path} className="text-xs text-muted-foreground">
                {path}
              </p>
            ))}
          </Section>

          <Separator />

          {/* Not Found */}
          <Section
            title="Not Found"
            count={fillReport.notFound.length}
            badgeVariant="warning"
          >
            {fillReport.notFound.map((path) => (
              <p key={path} className="text-xs text-muted-foreground">
                {path}
              </p>
            ))}
          </Section>

          <Separator />

          {/* Failed */}
          <Section
            title="Failed"
            count={fillReport.failed.length}
            badgeVariant="destructive"
          >
            {fillReport.failed.map(({ field, reason }) => (
              <div key={field} className="text-xs space-y-0.5">
                <p className="font-medium">{field}</p>
                <p className="text-muted-foreground">{reason}</p>
              </div>
            ))}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

type SectionProps = {
  title: string;
  count: number;
  badgeVariant: BadgeVariant;
  children: React.ReactNode;
};

function Section({ title, count, badgeVariant, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant={badgeVariant}>{count}</Badge>
      </div>
      {count > 0 ? (
        <div className="space-y-1 pl-2">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground pl-2">None</p>
      )}
    </div>
  );
}
