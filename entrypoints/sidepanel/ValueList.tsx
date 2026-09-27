import { useState } from 'preact/hooks';
import type { PasteTarget, PaletteValue } from '@/lib/messages';
import { maskValue } from '@/lib/palette';

/**
 * The person's values, in the side panel (CONTRACTS §11). Nothing is injected
 * into the page: click a field on the page to select it, then click a value
 * here to paste it in. Only the clicked value ever reaches the page (§11.1).
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
  // Reveal is per-value and per-session: this resets whenever the list is
  // rebuilt, which happens on every person change (§11.2).
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());

  const toggle = (path: string): void =>
    setShown((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

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
            Click a value to paste into <strong>{target.label}</strong>.
          </>
        ) : (
          'Click a field on the page first — that is where a value will go.'
        )}
      </p>

      <ul class="values" data-testid="value-list">
        {values.map((v) => {
          const revealed = shown.has(v.path);
          return (
            <li key={v.path} class="value-row" data-testid="value-row">
              <button
                type="button"
                class="value-apply"
                data-testid="value-apply"
                // A missing target is the only thing that blocks a paste; a
                // masked value is still perfectly pasteable (§11.2).
                disabled={target === null || busy !== null}
                title={target ? `Paste into ${target.label}` : 'Select a field on the page first'}
                onClick={() => onPaste(v)}
              >
                <span class="value-label">{v.label}</span>
                <span class="value-text">{revealed ? v.value : maskValue(v.value, v.kind)}</span>
              </button>
              <button
                type="button"
                class="value-reveal"
                data-testid="value-reveal"
                aria-pressed={revealed}
                aria-label={`${revealed ? 'Hide' : 'Show'} ${v.label}`}
                onClick={() => toggle(v.path)}
              >
                {revealed ? 'Hide' : 'Show'}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
