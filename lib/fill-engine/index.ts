import type {
  ApplicantPayload,
  FieldMapping,
  FieldResult,
  FieldStatus,
  FillReport,
  FormMapping,
} from '@/lib/schema';
import { resolveElement, waitStable, type Fillable } from './dom';
import { formatValue, getPath } from './format';
import { applyField, matchOption } from './handlers';
import { isUnsafe } from './safety';
import { captureValues, restore } from './undo';
import { verify } from './verify';

export { restore };

const STYLE_ID = 'immifill-style';

const CSS = `.immifill-filled{outline:2px solid #2e7d32!important}
.immifill-missing{outline:2px dashed #ef6c00!important}
.immifill-not_found{outline:2px dashed #6a1b9a!important}
.immifill-rejected{outline:2px solid #c62828!important}`;

/** One stylesheet per page, textContent only — never innerHTML from data. */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

function highlight(el: Element, status: FieldStatus): void {
  el.classList.remove('immifill-filled', 'immifill-missing', 'immifill-not_found', 'immifill-rejected');
  el.classList.add(`immifill-${status}`);
}

/** Reasons only — CONTRACTS §8 forbids applicant values in `detail`. */
function rejectReason(el: Fillable, value: string): string {
  if (el.disabled || ('readOnly' in el && el.readOnly)) return 'field not writable';
  if (el instanceof HTMLSelectElement && !matchOption(el, value)) return 'no matching option';
  return 'value reformatted by page';
}

/** The part of a repeat-group path after '[].', e.g. 'street'. */
const rowKey = (field: FieldMapping): string => field.path.slice(field.path.indexOf('[].') + 3);

const arrayAt = (data: ApplicantPayload, path: string): unknown[] => {
  const raw = getPath(data, path);
  return Array.isArray(raw) ? raw : [];
};

async function fillOne(
  field: FieldMapping,
  raw: unknown,
  path: string,
  root: Document | Element,
): Promise<FieldResult> {
  const value = formatValue(raw, field);
  if (value === null || value === '') {
    const blank = resolveElement(field, '', root);
    if (blank) highlight(blank, 'missing');
    return { path, status: 'missing' };
  }

  const el = resolveElement(field, value, root);
  if (!el) return { path, status: 'not_found', detail: 'selector and label both missed' };

  applyField(el, field, value);
  if (!verify(el, field, value)) {
    highlight(el, 'rejected');
    return { path, status: 'rejected', detail: rejectReason(el, value) };
  }
  highlight(el, 'filled');
  if (field.waitAfterMs) await waitStable(400, field.waitAfterMs);
  return { path, status: 'filled' };
}

/** CONTRACTS §9.1. The add button is the only click the engine may perform. */
async function fillGroup(field: FieldMapping, data: ApplicantPayload): Promise<FieldResult[]> {
  const group = field.repeatGroup ?? '';
  const items = arrayAt(data, group);
  if (!items.length) return [{ path: field.path, status: 'missing' }];

  const { rowSelector, addButtonSelector } = field;
  if (!rowSelector || !addButtonSelector) {
    return [{ path: field.path, status: 'not_found', detail: 'repeat group misconfigured' }];
  }

  const key = rowKey(field);
  const results: FieldResult[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const path = `${group}[${i}].${key}`;
    if (document.querySelectorAll(rowSelector).length <= i) {
      const add = document.querySelector(addButtonSelector);
      if (!(add instanceof HTMLElement) || isUnsafe(add)) {
        results.push({ path, status: 'not_found', detail: 'add button unavailable' });
        continue;
      }
      add.click();
      await waitStable();
    }
    const row = document.querySelectorAll(rowSelector)[i];
    if (!row) {
      results.push({ path, status: 'not_found', detail: 'row not created' });
      continue;
    }
    results.push(await fillOne(field, getPath(items[i], key), path, row));
  }
  return results;
}

export async function fillPage(m: FormMapping, data: ApplicantPayload): Promise<FillReport> {
  const snapshot = captureValues(m); // before the first write
  ensureStyle();
  const results: FieldResult[] = [];
  for (const field of m.fields) {
    if (field.repeatGroup) results.push(...(await fillGroup(field, data)));
    else results.push(await fillOne(field, getPath(data, field.path), field.path, document));
  }
  return { formKey: m.formKey, mappingVersion: m.version, results, snapshot };
}

/** Required paths with no usable value — pure, so the service worker runs it. */
export function preflight(m: FormMapping, data: ApplicantPayload): string[] {
  const missing: string[] = [];
  for (const field of m.fields) {
    if (!field.required) continue;
    if (field.repeatGroup) {
      const items = arrayAt(data, field.repeatGroup);
      if (!items.length) {
        missing.push(field.path);
        continue;
      }
      const key = rowKey(field);
      items.forEach((item, i) => {
        if (formatValue(getPath(item, key), field) === null) {
          missing.push(`${field.repeatGroup}[${i}].${key}`);
        }
      });
      continue;
    }
    if (formatValue(getPath(data, field.path), field) === null) missing.push(field.path);
  }
  return missing;
}
