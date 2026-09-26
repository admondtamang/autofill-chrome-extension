import type { FieldMapping } from '@/lib/schema';
import type { Fillable } from './dom';
import { isTruthy } from './format';
import { matchOption } from './handlers';

/** Re-read after the write. A page that reformats the value fails here → `rejected`. */
export function verify(el: Fillable, field: FieldMapping, value: string): boolean {
  if (field.type === 'radio') return el instanceof HTMLInputElement && el.checked;
  if (field.type === 'checkbox') {
    return el instanceof HTMLInputElement && el.checked === isTruthy(value);
  }
  if (field.type === 'select') {
    if (!(el instanceof HTMLSelectElement)) return false;
    const opt = matchOption(el, value);
    return opt !== null && el.value === opt.value;
  }
  return el.value === value;
}
