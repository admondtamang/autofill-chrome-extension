import { format as fmt, isValid, parseISO } from 'date-fns';
import type { FieldMapping } from '@/lib/schema';

/** Reads a dot path out of the payload. Unknown segments yield undefined. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** ISO in, site format out. Anything unusable becomes null so the caller reports `missing`. */
export function formatValue(raw: unknown, field: FieldMapping): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) return raw.length ? raw.join(', ') : null;
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (field.type === 'date') {
    const d = parseISO(String(raw));
    if (!isValid(d)) return null; // date-fns would otherwise format 'Invalid Date'
    return fmt(d, field.format ?? 'dd MMM yyyy');
  }
  const s = String(raw);
  return s === '' ? null : s;
}

/** CONTRACTS §5 checkbox truthiness, applied to the already-formatted value. */
export const isTruthy = (v: string): boolean =>
  v !== '' && !['false', 'no', '0', 'off'].includes(v.trim().toLowerCase());
