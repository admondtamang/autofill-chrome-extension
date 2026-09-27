import type { PaletteValue } from '@/lib/messages';
import { stableSelector, type Fillable } from '@/lib/fill-engine/dom';
import type { FieldMapping } from '@/lib/schema';

/**
 * The draggable value palette (CONTRACTS §11). Pure DOM: no `chrome.*`, so the
 * whole thing is unit-testable under jsdom, exactly like lib/record.ts.
 */

/**
 * The ONLY thing that ever reaches `dataTransfer` (§11.1). A custom MIME type,
 * not `text/plain`: the browser must not "helpfully" insert the token into an
 * input on its own — the content script performs every write.
 */
export const DRAG_TYPE = 'application/x-immifill-token';

/** Fixed row geometry, so the E2E drag can compute an item's position. */
export const HEAD_H = 34;
export const ITEM_H = 44;
export const PALETTE_W = 280;

export const PALETTE_ID = 'immifill-palette';

const bullets = (n: number): string => '•'.repeat(n);

/**
 * §11.2 — first 3 chars, then bullets; an email keeps its domain.
 * A value of 3 chars or fewer masks entirely: "first 3" would be all of it.
 */
export function maskValue(value: string, kind: PaletteValue['kind']): string {
  if (kind === 'email') {
    const at = value.lastIndexOf('@');
    if (at > 0) return maskValue(value.slice(0, at), 'text') + value.slice(at);
  }
  return value.length <= 3 ? bullets(value.length) : value.slice(0, 3) + bullets(value.length - 3);
}

export type PaletteHandlers = {
  /** Fires on dragstart. The host stores token → value; the page only ever sees the token. */
  onDragStart(token: string, value: PaletteValue): void;
  /** Fires on dragend, so a token outlives its drag by nothing. */
  onDragEnd(token: string): void;
  /** Header drag finished — the host remembers the position for this tab (§11.4). */
  onMove(x: number, y: number): void;
  onClose(): void;
};

export type Palette = { root: HTMLElement; destroy(): void };

let seq = 0;
const newToken = (): string => `t${(seq += 1)}-${Math.random().toString(36).slice(2, 10)}`;

const CSS = `:host{all:initial}
*{box-sizing:border-box;font:12px/1.4 system-ui,sans-serif}
.p{background:#1f2933;color:#f0f4f8;border:1px solid #3e4c59;border-radius:6px;
box-shadow:0 6px 24px rgba(0,0,0,.35);overflow:hidden}
.head{height:${HEAD_H}px;display:flex;align-items:center;gap:6px;padding:0 6px;
background:#323f4b;cursor:move;user-select:none}
.head .t{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{background:#3e4c59;color:#f0f4f8;border:0;border-radius:3px;padding:2px 6px;cursor:pointer;font:inherit}
button:hover{background:#52606d}
.list{max-height:60vh;overflow-y:auto}
.item{height:${ITEM_H}px;display:flex;align-items:center;gap:6px;padding:0 6px;
border-top:1px solid #3e4c59;cursor:grab}
.item:active{cursor:grabbing}
.col{flex:1;min-width:0}
.lbl{display:block;color:#9aa5b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.val{display:block;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{padding:10px 8px;color:#9aa5b1}`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text; // never innerHTML (§11.4 / §8.4)
  return node;
};

/**
 * Builds the palette inside a CLOSED shadow root (§11.4): page CSS cannot
 * restyle it and page script cannot walk into it.
 */
export function buildPalette(
  values: readonly PaletteValue[],
  handlers: PaletteHandlers,
  start?: { x: number; y: number },
): Palette {
  const host = document.createElement('div');
  host.id = PALETTE_ID;
  const x = start?.x ?? Math.max(8, window.innerWidth - PALETTE_W - 24);
  const y = start?.y ?? 16;
  // Inline, so a page stylesheet cannot move or hide us.
  host.style.cssText =
    `position:fixed;left:${x}px;top:${y}px;width:${PALETTE_W}px;z-index:2147483647;` +
    'margin:0;padding:0;border:0;display:block;';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const panel = el('div', 'p');
  const head = el('div', 'head');
  const title = el('span', 't', 'ImmiFill values');
  const collapseBtn = el('button', 'c', '–');
  collapseBtn.title = 'Collapse';
  const closeBtn = el('button', 'x', '×');
  closeBtn.title = 'Close';
  head.append(title, collapseBtn, closeBtn);

  const list = el('div', 'list');
  if (values.length === 0) list.appendChild(el('div', 'empty', 'This person has no values to place.'));

  let dragging: string | null = null;

  for (const v of values) {
    const item = el('div', 'item');
    item.draggable = true;
    item.title = v.path; // a path, never a value (§8.3)

    const col = el('div', 'col');
    const masked = maskValue(v.value, v.kind);
    const valueEl = el('span', 'val', masked);
    col.append(el('span', 'lbl', v.label), valueEl);

    // Reveal is per-value and lives only in this node: rebuilding the palette
    // (person change) or destroying it resets every one of them (§11.2).
    const reveal = el('button', 'r', 'Show');
    reveal.addEventListener('click', () => {
      const shown = reveal.textContent === 'Hide';
      valueEl.textContent = shown ? masked : v.value;
      reveal.textContent = shown ? 'Show' : 'Hide';
    });

    // Masked or revealed, the drag carries only an opaque token (§11.1/§11.2).
    item.addEventListener('dragstart', (ev: DragEvent) => {
      if (!ev.dataTransfer) return;
      const token = newToken();
      ev.dataTransfer.setData(DRAG_TYPE, token);
      ev.dataTransfer.effectAllowed = 'copy';
      dragging = token;
      handlers.onDragStart(token, v);
    });
    item.addEventListener('dragend', () => {
      if (dragging !== null) handlers.onDragEnd(dragging);
      dragging = null;
    });

    item.append(col, reveal);
    list.appendChild(item);
  }

  panel.append(head, list);
  shadow.appendChild(panel);

  collapseBtn.addEventListener('click', () => {
    list.hidden = !list.hidden;
    collapseBtn.textContent = list.hidden ? '+' : '–';
  });
  closeBtn.addEventListener('click', () => handlers.onClose());

  /* ── Header drag: plain pointer maths, not HTML5 DnD (that is for items) ── */
  let from: { px: number; py: number; x: number; y: number } | null = null;

  const onMove = (ev: MouseEvent): void => {
    if (!from) return;
    const nx = Math.max(0, from.x + ev.clientX - from.px);
    const ny = Math.max(0, from.y + ev.clientY - from.py);
    host.style.left = `${nx}px`;
    host.style.top = `${ny}px`;
  };
  const onUp = (): void => {
    if (!from) return;
    from = null;
    handlers.onMove(parseFloat(host.style.left), parseFloat(host.style.top));
  };
  head.addEventListener('mousedown', (ev: MouseEvent) => {
    if (ev.target instanceof HTMLButtonElement) return;
    ev.preventDefault();
    from = { px: ev.clientX, py: ev.clientY, x: parseFloat(host.style.left), y: parseFloat(host.style.top) };
  });
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);

  return {
    root: host,
    destroy(): void {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      host.remove();
    },
  };
}

/**
 * `date` deliberately maps to `text`: their handlers are identical, and only
 * `text` passes the canonical value through `formatValue` untouched — which is
 * what §11.3 requires of an unmapped target.
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
