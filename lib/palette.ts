import type { PaletteValue } from '@/lib/messages';
import { stableSelector, type Fillable } from '@/lib/fill-engine/dom';
import type { FieldMapping } from '@/lib/schema';

/**
 * Value-list helpers (CONTRACTS §11). Pure: no `chrome.*` and no DOM building,
 * so this is unit-testable under jsdom exactly like lib/record.ts.
 *
 * The list itself lives in the side panel. Nothing is injected into the page —
 * the only value that ever crosses is the one the agent clicks (§11.1).
 */

export function fieldTypeOf(element: Fillable): FieldMapping['type'] {
  if (element instanceof HTMLSelectElement) return 'select';
  if (element instanceof HTMLTextAreaElement) return 'textarea';
  if (element.type === 'checkbox' || element.type === 'radio') return element.type;
  return 'text';
}

/**
 * §11.3 — a mapped date target is formatted by that mapping's `format`; every
 * other target receives the canonical value.
 */
export function dropFieldFor(
  element: Fillable,
  value: PaletteValue,
  mapped: FieldMapping | null,
): FieldMapping {
  const base: FieldMapping = {
    path: value.path,
    selector: stableSelector(element),
    type: fieldTypeOf(element),
    required: false,
  };
  if (value.kind !== 'date' || !mapped?.format) return base;
  return { ...base, type: 'date', format: mapped.format };
}

/** §11.4 — how a focused field is named to the agent. Identity, never a value. */
export function targetLabel(element: Fillable): string {
  const id = element.id;
  // Matching htmlFor directly avoids CSS.escape, which jsdom does not provide
  // and which would otherwise choke on ASP.NET ids like `ctl00$txtGiven`.
  const forLabel = id
    ? Array.from(document.getElementsByTagName('label')).find((l) => l.htmlFor === id)
    : undefined;
  const text = (forLabel?.textContent ?? element.closest('label')?.textContent ?? '').trim();
  if (text) return text.replace(/\s+/g, ' ').replace(/\s*\*$/, '').slice(0, 60);
  return element.getAttribute('name') ?? id ?? element.tagName.toLowerCase();
}
