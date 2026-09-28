import type { PasteTarget, PaletteValue } from '@/lib/messages';
import { CornerDownLeft, Crosshair, Empty, Spinner } from './ui';

/**
 * The person's values, in the side panel (CONTRACTS §11).
 *
 * Two ways to place one:
 *  - click a field on the page, then click a value here, or
 *  - drag a value onto a field.
 *
 * Note on drag: the side panel is a separate browser-UI document, so Chrome
 * does not reliably deliver drag events from it into page content. Click is the
 * dependable path; the drag is offered on top and costs nothing if the browser
 * declines to carry it.
 *
 * This is the one surface where applicant values are shown, and they are shown
 * in full — the report and the audit still carry paths only (§8.3).
 */
export function ValueList({
  values,
  target,
  busy,
  onPaste,
}: {
  values: PaletteValue[];
  target: PasteTarget | null;
  busy: string | null;
  onPaste: (v: PaletteValue) => void;
}) {
  if (values.length === 0) {
    return (
      <Empty icon={<Crosshair class="size-5" />} data-testid="values-empty">
        No values loaded. Choose a person to list their details.
      </Empty>
    );
  }

  return (
    <>
      {/* The paste target is the single most important thing on this card:
          solid and tinted when a field is chosen, dashed and quiet when not. */}
      <div
        class={
          target
            ? 'flex min-w-0 items-center gap-2 rounded-lg border border-primary/40 bg-accent px-3 py-2'
            : 'flex min-w-0 items-center gap-2 rounded-lg border border-dashed px-3 py-2'
        }
        data-testid="paste-target"
        aria-live="polite"
      >
        <Crosshair class={target ? 'text-primary' : 'text-muted-foreground'} />
        <span class="min-w-0 flex-1 leading-tight">
          {target ? (
            <>
              <span class="block text-[11px] text-muted-foreground">Pasting into</span>
              <strong class="block truncate font-semibold" title={target.label}>
                {target.label}
              </strong>
            </>
          ) : (
            <span class="block text-xs text-muted-foreground">
              No field selected — click a field on the page, or drag a value onto one.
            </span>
          )}
        </span>
      </div>

      <ul
        class={
          'm-0 flex max-h-80 min-w-0 list-none flex-col gap-1 overflow-x-hidden ' +
          'overflow-y-auto overscroll-contain p-0'
        }
        data-testid="value-list"
      >
        {values.map((v) => {
          const pasting = busy === v.path;

          // Listed but empty: the CRM has this field and it is unset. Shown so
          // "no passport on file" is visible, rendered as a plain row because
          // there is genuinely nothing to paste.
          if (v.value === '') {
            return (
              <li key={v.path} class="min-w-0" data-testid="value-row">
                <div
                  class={
                    'flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 rounded-lg ' +
                    'border border-dashed px-3 py-2 opacity-60'
                  }
                  data-testid="value-unset"
                >
                  <span class="w-full min-w-0 truncate text-[11px] text-muted-foreground">
                    {v.label}
                  </span>
                  <span class="text-[13px] text-muted-foreground italic">Not set</span>
                </div>
              </li>
            );
          }

          return (
            <li key={v.path} class="min-w-0" data-testid="value-row">
              <button
                type="button"
                class={
                  'group flex min-h-11 w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 ' +
                  'rounded-lg border bg-background px-3 py-2 text-left transition-colors outline-none ' +
                  'hover:border-primary/40 hover:bg-accent active:bg-accent ' +
                  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
                  'aria-[busy=true]:cursor-progress'
                }
                data-testid="value-apply"
                // Never disabled: a disabled control hides the feature instead of
                // explaining it. With no field chosen the click says so.
                aria-busy={pasting}
                draggable
                onDragStart={(ev) => {
                  const dt = (ev as unknown as DragEvent).dataTransfer;
                  if (!dt) return;
                  dt.setData('text/plain', v.value);
                  dt.setData('application/x-immifill-value', v.path);
                  dt.effectAllowed = 'copy';
                }}
                title={
                  target
                    ? `Put this in ${target.label}`
                    : 'Select a field on the page, or drag this onto one'
                }
                onClick={() => onPaste(v)}
              >
                <span class="flex w-full min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {v.label}
                  </span>
                  {pasting ? (
                    <Spinner class="size-3.5 text-muted-foreground" />
                  ) : (
                    <CornerDownLeft
                      class={
                        'size-3.5 text-muted-foreground opacity-0 transition-opacity ' +
                        'group-hover:opacity-100 group-focus-visible:opacity-100'
                      }
                    />
                  )}
                </span>
                <span class="w-full min-w-0 truncate font-mono text-[13px]">{v.value}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
