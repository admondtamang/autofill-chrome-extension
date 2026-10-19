import * as React from "react";
import { Copy, MousePointerClick, GripVertical, Check } from "lucide-react";
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
  const [copied, setCopied] = React.useState(false);

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
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listitem"
      aria-label={`${label}: ${value}`}
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
        "transition-colors duration-100 cursor-default",
        "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        filled && "bg-green-50 dark:bg-green-950/40 hover:bg-green-100/80 dark:hover:bg-green-950/60",
      )}
    >
      {/* Filled indicator bar */}
      {filled && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-green-500" />
      )}

      {/* Drag handle — only visible on hover */}
      <span
        className="text-muted-foreground/30 group-hover:text-muted-foreground flex-shrink-0 cursor-grab active:cursor-grabbing transition-colors"
        aria-describedby={DRAG_INSTRUCTIONS_ID}
        aria-label="Drag handle"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Label */}
      <span
        className="flex-shrink-0 w-28 text-xs text-muted-foreground truncate"
        title={label}
      >
        {label}
        {verify && (
          <span className="ml-1 text-amber-500 font-medium">·verify</span>
        )}
      </span>

      {/* Value */}
      <span
        className={cn(
          "flex-1 truncate text-xs font-medium",
          filled ? "text-green-700 dark:text-green-400" : "text-foreground",
        )}
        title={value}
      >
        {value}
      </span>

      {/* Action buttons — visible on hover */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Copy */}
        <button
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          title="Copy"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {copied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3" />
          }
        </button>

        {/* Click-to-fill */}
        <button
          onClick={() => onClickToFill(profilePath, value)}
          aria-label={`Fill ${label} into focused field`}
          title="Fill focused input"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <MousePointerClick className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function DragInstructions() {
  return (
    <span id={DRAG_INSTRUCTIONS_ID} className="sr-only">
      Drag this field to fill a form control, or press Enter to send to the focused control.
    </span>
  );
}
