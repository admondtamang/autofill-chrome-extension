import * as React from "react";
import { Copy, MousePointerClick, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DRAG_INSTRUCTIONS_ID = "immifill-drag-instructions";

export type FieldRowProps = {
  profilePath: string;
  label: string;
  value: string;
  verify?: boolean;
  filled?: boolean;
  onClickToFill: (profilePath: string, value: string) => void;
  onDragStart: (profilePath: string, value: string) => void;
};

export function FieldRow({
  profilePath,
  label,
  value,
  verify = false,
  filled = false,
  onClickToFill,
  onDragStart,
}: FieldRowProps) {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", value);
    e.dataTransfer.setData(
      "application/x-immifill+json",
      JSON.stringify({ profilePath, value }),
    );
    e.dataTransfer.effectAllowed = "copy";
    onDragStart(profilePath, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onClickToFill(profilePath, value);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {
      // Silently ignore clipboard errors
    });
  };

  return (
    <>
      <div
        draggable={true}
        onDragStart={handleDragStart}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="listitem"
        aria-label={`${label}: ${value}`}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-default",
          filled && "bg-green-50 dark:bg-green-950",
        )}
      >
        {/* Drag handle */}
        <span
          className="text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing"
          aria-describedby={DRAG_INSTRUCTIONS_ID}
          aria-label="Drag handle"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        {/* Label */}
        <span className="flex-shrink-0 w-32 text-muted-foreground truncate" title={label}>
          {label}
        </span>

        {/* Value */}
        <span className="flex-1 truncate font-medium" title={value}>
          {value}
        </span>

        {/* Badges */}
        {verify && (
          <Badge variant="warning" className="flex-shrink-0 text-xs">
            verify
          </Badge>
        )}
        {filled && (
          <Badge variant="success" className="flex-shrink-0 text-xs">
            used
          </Badge>
        )}

        {/* Copy button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          aria-label={`Copy ${label}`}
          onClick={handleCopy}
          tabIndex={-1}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>

        {/* Click-to-fill button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          aria-label={`Fill ${label} into focused field`}
          onClick={() => onClickToFill(profilePath, value)}
          tabIndex={-1}
        >
          <MousePointerClick className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  );
}

export function DragInstructions() {
  return (
    <span id={DRAG_INSTRUCTIONS_ID} className="sr-only">
      Drag this field to fill a form control on the ImmiAccount page, or press
      Enter to send to the focused control.
    </span>
  );
}
