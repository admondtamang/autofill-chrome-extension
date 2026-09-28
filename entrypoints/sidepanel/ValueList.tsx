import type { PasteTarget, PaletteValue } from '@/lib/messages';

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
      <p class="hint" data-testid="values-empty">
        No values loaded. Choose a person to list their details.
      </p>
    );
  }

  return (
    <>
      <p class="hint" data-testid="paste-target" aria-live="polite">
        {target ? (
          <>
            Click a value to put it in <strong>{target.label}</strong>, or drag it onto any field.
          </>
        ) : (
          'Click a field on the page to choose where a value goes — or drag one straight onto it.'
        )}
      </p>

      <ul class="values" data-testid="value-list">
        {values.map((v) => (
          <li key={v.path} class="value-row" data-testid="value-row">
            <button
              type="button"
              class="value-apply"
              data-testid="value-apply"
              // Never disabled: a disabled control hides the feature instead of
              // explaining it. With no field chosen the click says so.
              aria-busy={busy === v.path}
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
              <span class="value-label">{v.label}</span>
              <span class="value-text">{v.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
