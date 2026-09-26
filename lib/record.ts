import { ApplicantPayload, type FieldMapping } from '@/lib/schema';
import { isFillable, stableSelector, type Fillable } from '@/lib/fill-engine/dom';
import { isUnsafe } from '@/lib/fill-engine/safety';
import type { z } from 'zod';

type Capture = (field: FieldMapping) => void;

const typeFor = (el: Fillable): FieldMapping['type'] => {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'date') return el.type;
  return 'text';
};

const labelFor = (el: Fillable): string | undefined => {
  const label = el.labels?.[0] ?? el.closest('label');
  return (label?.textContent ?? '').trim() || undefined;
};

/**
 * Capture-phase click listener that turns a clicked control into a mapping draft.
 * `path` is left empty: the side panel picks it from payloadPaths().
 */
export function startRecording(onCapture: Capture): () => void {
  const onClick = (ev: MouseEvent) => {
    const el = ev.target;
    if (!isFillable(el)) return;
    ev.preventDefault(); // the click picks a field, it does not operate the form
    ev.stopPropagation();
    if (isUnsafe(el)) return; // never capture submit/next/pay/declaration
    onCapture({
      path: '',
      selector: stableSelector(el),
      fallbackLabel: labelFor(el),
      type: typeFor(el),
      required: false,
    });
  };

  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

type Def = {
  type: string;
  innerType?: z.ZodType;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
};

const defOf = (schema: z.ZodType): Def => schema.def as Def;

const unwrap = (schema: z.ZodType): z.ZodType => {
  const inner = defOf(schema).innerType; // nullable / optional / default wrappers
  return inner ? unwrap(inner) : schema;
};

function walk(schema: z.ZodType, prefix: string, out: string[]): void {
  const def = defOf(unwrap(schema));
  if (def.type === 'object' && def.shape) {
    for (const [key, child] of Object.entries(def.shape)) {
      walk(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (def.type === 'array' && def.element) {
    const item = defOf(unwrap(def.element));
    if (item.type === 'object' && item.shape) {
      for (const key of Object.keys(item.shape)) out.push(`${prefix}[].${key}`);
      return;
    }
  }
  out.push(prefix); // leaf, or an array of scalars filled as a joined string
}

/** Derived from the Zod schema, so it cannot drift from ApplicantPayload. */
export function payloadPaths(): string[] {
  const out: string[] = [];
  walk(ApplicantPayload, '', out);
  return out;
}
