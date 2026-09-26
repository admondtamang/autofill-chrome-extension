import type { FieldMapping } from '@/lib/schema';
import { isUnsafe } from './safety';

export type Fillable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export const isFillable = (el: unknown): el is Fillable =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLSelectElement ||
  el instanceof HTMLTextAreaElement;

const protoFor = (el: Element) =>
  el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

/** Defeats React's controlled inputs: native setter, then bubbling events. */
export function setNative(el: Fillable, v: string): void {
  const desc = Object.getOwnPropertyDescriptor(protoFor(el), 'value');
  desc?.set?.call(el, v);
  fireEvents(el);
}

export function fireEvents(el: Element): void {
  for (const t of ['input', 'change', 'blur']) el.dispatchEvent(new Event(t, { bubbles: true }));
}

/**
 * Resolves once the DOM has changed and then gone quiet for `quietMs`, or after
 * `maxMs` regardless. The quiet countdown is deliberately NOT armed up front: a
 * postback that re-renders later than `quietMs` would otherwise resolve this
 * before the dependent section exists, and every field in it reports not_found.
 */
export const waitStable = (quietMs = 400, maxMs = 5000): Promise<void> =>
  new Promise<void>((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined; // bare setTimeout: `window` is undefined inside the observer callback
    const hard = setTimeout(done, maxMs);
    const obs = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    });
    function done() {
      obs.disconnect();
      clearTimeout(hard);
      clearTimeout(quiet);
      resolve();
    }
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });

/** '{value}' is substituted before querying — radios select themselves by value. */
export const applyToken = (selector: string, value: string): string =>
  selector.split('{value}').join(value);

const idSelector = (id: string) => `[id="${id.replace(/"/g, '\\"')}"]`;

const labelMatches = (label: HTMLLabelElement, want: string) =>
  (label.textContent ?? '').trim().toLowerCase().includes(want.trim().toLowerCase());

/** Selector first, then fallbackLabel: for= attribute, control property, nested input. */
export function resolveElement(
  field: FieldMapping,
  formattedValue: string,
  root: Document | Element = document,
): Fillable | null {
  const direct = root.querySelector(applyToken(field.selector, formattedValue));
  if (isFillable(direct) && !isUnsafe(direct)) return direct;

  if (!field.fallbackLabel) return null;
  for (const label of root.querySelectorAll('label')) {
    if (!labelMatches(label, field.fallbackLabel)) continue;
    const forId = label.getAttribute('for');
    const candidate =
      (forId ? root.querySelector(idSelector(forId)) : null) ??
      label.control ??
      label.querySelector('input, select, textarea');
    if (isFillable(candidate) && !isUnsafe(candidate)) return candidate;
  }
  return null;
}

/** A selector that re-finds this exact element later (undo, record mode). */
export function stableSelector(el: Element): string {
  if (el.id) return /^[A-Za-z_][\w-]*$/.test(el.id) ? `#${el.id}` : idSelector(el.id);
  const name = el.getAttribute('name');
  if (name) return `[name="${name.replace(/"/g, '\\"')}"]`;
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const cur = node;
    const tag = cur.tagName.toLowerCase();
    const sibs = cur.parentElement
      ? [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName)
      : [];
    parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(cur) + 1})` : tag);
  }
  return `body > ${parts.join(' > ')}`;
}
