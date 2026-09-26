import type { FillReport, FormMapping } from '@/lib/schema';
import { isFillable, resolveElement, setNative, stableSelector, type Fillable } from './dom';

type Snapshot = FillReport['snapshot'];

const stripValueToken = (selector: string) =>
  selector.replace(/\[value=["']?\{value\}["']?\]/g, '');

const entryFor = (el: Fillable): Snapshot[number] =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
    ? { selector: stableSelector(el), kind: 'checked', value: String(el.checked) }
    : { selector: stableSelector(el), kind: 'value', value: el.value };

/**
 * Captures every element the mapping can currently reach, before the first write.
 * ponytail: repeat-group rows the engine adds later are not in the snapshot —
 * undo restores values, it does not delete rows.
 */
export function captureValues(m: FormMapping): Snapshot {
  const seen = new Set<string>();
  const snap: Snapshot = [];
  const push = (el: Element | null) => {
    if (!isFillable(el)) return;
    const entry = entryFor(el);
    if (seen.has(entry.selector)) return;
    seen.add(entry.selector);
    snap.push(entry);
  };
  for (const f of m.fields) {
    const base = stripValueToken(f.selector);
    if (!base.includes('{value}')) for (const el of document.querySelectorAll(base)) push(el);
    if (f.fallbackLabel) push(resolveElement({ ...f, selector: base }, ''));
  }
  return snap;
}

export function restore(snapshot: Snapshot): number {
  let restored = 0;
  for (const entry of snapshot) {
    const el = document.querySelector(entry.selector);
    if (!isFillable(el)) continue;
    if (entry.kind === 'checked') {
      if (el instanceof HTMLInputElement) {
        el.checked = entry.value === 'true';
        setNative(el, el.value); // re-dispatch so React reverts too
      }
    } else {
      setNative(el, entry.value);
    }
    restored += 1;
  }
  return restored;
}
