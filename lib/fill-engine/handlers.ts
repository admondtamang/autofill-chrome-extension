import type { FieldMapping } from '@/lib/schema';
import { fireEvents, setNative, type Fillable } from './dom';
import { isTruthy } from './format';
import { isUnsafe } from './safety';

/** Exact option.value first, then case-insensitive trimmed label/text. */
export function matchOption(el: HTMLSelectElement, value: string): HTMLOptionElement | null {
  for (const o of el.options) if (o.value === value) return o;
  const needle = value.trim().toLowerCase();
  for (const o of el.options) {
    if ((o.label || o.textContent || '').trim().toLowerCase() === needle) return o;
  }
  return null;
}

const setChecked = (el: HTMLInputElement, on: boolean) => {
  el.checked = on; // never .click(): that would fire the page's own handlers as a user gesture
  fireEvents(el);
};

export const handlers: Record<FieldMapping['type'], (el: Fillable, value: string) => void> = {
  text: (el, v) => setNative(el, v),
  textarea: (el, v) => setNative(el, v),
  date: (el, v) => setNative(el, v),
  select: (el, v) => {
    if (!(el instanceof HTMLSelectElement)) return;
    const opt = matchOption(el, v);
    if (!opt) return; // no write at all — verify() reports `rejected`
    setNative(el, opt.value);
  },
  radio: (el, _v) => {
    if (el instanceof HTMLInputElement) setChecked(el, true);
  },
  checkbox: (el, v) => {
    if (el instanceof HTMLInputElement) setChecked(el, isTruthy(v));
  },
};

/** Single write gate: refuses unsafe, disabled and readonly elements. */
export function applyField(el: Fillable, field: FieldMapping, value: string): void {
  if (isUnsafe(el) || el.disabled) return;
  if ('readOnly' in el && el.readOnly) return; // write silently would not stick → `rejected`
  handlers[field.type](el, value);
}
