import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaletteValue } from '@/lib/messages';
import {
  buildPalette,
  dropFieldFor,
  DRAG_TYPE,
  fieldTypeOf,
  maskValue,
  PALETTE_ID,
  type PaletteHandlers,
} from '@/lib/palette';
import { FieldMapping } from '@/lib/schema';

const value = (over: Partial<PaletteValue> = {}): PaletteValue => ({
  path: 'passport.number',
  label: 'Passport number',
  value: 'PA1234567',
  kind: 'text',
  ...over,
});

const handlers = (): PaletteHandlers & { started: [string, PaletteValue][] } => {
  const started: [string, PaletteValue][] = [];
  return {
    started,
    onDragStart: (t, v) => started.push([t, v]),
    onDragEnd: vi.fn(),
    onMove: vi.fn(),
    onClose: vi.fn(),
  };
};

/** jsdom has no DataTransfer, and dispatching `dragstart` needs one. */
class FakeDataTransfer {
  effectAllowed = 'none';
  #data = new Map<string, string>();
  setData(type: string, v: string): void {
    this.#data.set(type, v);
  }
  getData(type: string): string {
    return this.#data.get(type) ?? '';
  }
  get types(): string[] {
    return [...this.#data.keys()];
  }
}

const dragStart = (item: Element): FakeDataTransfer => {
  const dt = new FakeDataTransfer();
  const ev = new Event('dragstart', { bubbles: true }) as Event & { dataTransfer: unknown };
  ev.dataTransfer = dt;
  item.dispatchEvent(ev);
  return dt;
};

/**
 * `attachShadow` is patched for the duration of one build so the test can hold
 * the root the page is denied. The production call still passes mode:'closed' —
 * asserted below — so this proves the isolation rather than weakening it.
 */
function buildWithPeek(values: PaletteValue[], h: PaletteHandlers) {
  const real = Element.prototype.attachShadow;
  const modes: ShadowRootMode[] = [];
  let root: ShadowRoot | null = null;
  Element.prototype.attachShadow = function patched(init: ShadowRootInit): ShadowRoot {
    modes.push(init.mode);
    root = real.call(this, { ...init, mode: 'open' });
    return root;
  };
  try {
    const p = buildPalette(values, h);
    if (!root) throw new Error('no shadow root');
    return { palette: p, shadow: root as ShadowRoot, modes };
  } finally {
    Element.prototype.attachShadow = real;
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('maskValue (CONTRACTS §11.2)', () => {
  it('keeps the first 3 characters and bullets the rest', () => {
    expect(maskValue('PA1234567', 'text')).toBe('PA1••••••');
    expect(maskValue('1994-03-15', 'date')).toBe('199•••••••');
  });

  it('masks a short value entirely — "first 3" would be all of it', () => {
    expect(maskValue('abc', 'text')).toBe('•••');
    expect(maskValue('ab', 'text')).toBe('••');
    expect(maskValue('', 'text')).toBe('');
  });

  it('keeps an email domain', () => {
    // 'complete.applicant' is 18 chars: 3 kept + 15 bullets.
    expect(maskValue('complete.applicant@example.test', 'email')).toBe('com•••••••••••••••@example.test');
    expect(maskValue('ab@example.test', 'email')).toBe('••@example.test');
  });

  it('falls back to plain masking when an email kind carries no @', () => {
    expect(maskValue('notanemail', 'email')).toBe('not•••••••');
  });
});

describe('buildPalette', () => {
  it('renders one draggable row per value, masked', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value()], h);
    const rows = [...shadow.querySelectorAll('.item')];
    expect(rows).toHaveLength(1);
    expect((rows[0] as HTMLElement).draggable).toBe(true);
    expect(shadow.querySelector('.lbl')?.textContent).toBe('Passport number');
    expect(shadow.querySelector('.val')?.textContent).toBe('PA1••••••');
    palette.destroy();
  });

  it('uses a CLOSED shadow root (§11.4) — the page cannot walk into it', () => {
    const h = handlers();
    const { palette, modes } = buildWithPeek([value()], h);
    expect(modes).toEqual(['closed']);
    document.body.appendChild(palette.root);
    // The real, unpatched call is what ships; prove a fresh one is unreachable.
    const real = buildPalette([value()], h);
    document.body.appendChild(real.root);
    expect(real.root.shadowRoot).toBeNull();
    expect(document.querySelectorAll('.item')).toHaveLength(0);
    palette.destroy();
    real.destroy();
  });

  it('builds without innerHTML (§8.4) — no HTML is ever parsed from data', () => {
    const spy = vi.spyOn(Element.prototype, 'innerHTML', 'set');
    const h = handlers();
    const p = buildPalette([value({ value: '<img src=x onerror=alert(1)>' })], h);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    p.destroy();
  });

  it('escapes nothing because it sets textContent: markup stays inert', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value({ value: '<b>x</b>', kind: 'text' })], h);
    expect(shadow.querySelector('.val')?.querySelector('b')).toBeNull();
    palette.destroy();
  });

  it('reveals and re-masks a single value, without touching the others', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value(), value({ path: 'dob', value: 'x1234' })], h);
    const [first, second] = [...shadow.querySelectorAll('.item')];
    const button = first?.querySelector('button');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(first?.querySelector('.val')?.textContent).toBe('PA1234567');
    expect(second?.querySelector('.val')?.textContent).toBe('x12••');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(first?.querySelector('.val')?.textContent).toBe('PA1••••••');
    palette.destroy();
  });

  it('destroy() removes the host from the page', () => {
    const h = handlers();
    const p = buildPalette([value()], h);
    document.body.appendChild(p.root);
    expect(document.getElementById(PALETTE_ID)).not.toBeNull();
    p.destroy();
    expect(document.getElementById(PALETTE_ID)).toBeNull();
  });
});

describe('dragstart (CONTRACTS §11.1) — the page never sees an undropped value', () => {
  it('puts an opaque token on dataTransfer and NEVER the value', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value()], h);
    const dt = dragStart(shadow.querySelectorAll('.item')[0]!);

    expect(dt.types).toEqual([DRAG_TYPE]);
    const token = dt.getData(DRAG_TYPE);
    expect(token).not.toBe('');
    expect(token).not.toContain('PA1234567');
    // Nothing else is readable, least of all as text/plain.
    expect(dt.getData('text/plain')).toBe('');
    expect(JSON.stringify(dt.types)).not.toContain('PA1234567');

    // Only the content script can resolve it, through the handler.
    expect(h.started).toEqual([[token, value()]]);
    palette.destroy();
  });

  it('issues a fresh token per drag', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value()], h);
    const item = shadow.querySelectorAll('.item')[0]!;
    const a = dragStart(item).getData(DRAG_TYPE);
    const b = dragStart(item).getData(DRAG_TYPE);
    expect(a).not.toBe(b);
    palette.destroy();
  });

  it('drags while masked — revealing is never required (§11.2)', () => {
    const h = handlers();
    const { palette, shadow } = buildWithPeek([value()], h);
    const item = shadow.querySelectorAll('.item')[0]!;
    expect(item.querySelector('.val')?.textContent).toBe('PA1••••••');
    expect(dragStart(item).getData(DRAG_TYPE)).not.toBe('');
    expect(h.started[0]?.[1].value).toBe('PA1234567');
    palette.destroy();
  });
});

describe('dropFieldFor (CONTRACTS §11.3)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="text" id="passport">
      <input type="date" id="native">
      <select id="country"><option value="NPL">Nepal</option></select>
      <textarea id="notes"></textarea>
      <input type="checkbox" id="agree">`;
  });

  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  it('derives the field type from the drop target', () => {
    expect(fieldTypeOf(el('passport'))).toBe('text');
    expect(fieldTypeOf(el('country'))).toBe('select');
    expect(fieldTypeOf(el('notes'))).toBe('textarea');
    expect(fieldTypeOf(el('agree'))).toBe('checkbox');
    // A native date input takes the canonical ISO value, so it is treated as text.
    expect(fieldTypeOf(el('native'))).toBe('text');
  });

  it('formats a date through the drop target mapping when the field is mapped', () => {
    const mapped: FieldMapping = FieldMapping.parse({
      path: 'dob',
      selector: '#passport',
      type: 'date',
      format: 'dd/MM/yyyy',
    });
    const field = dropFieldFor(el('passport'), value({ kind: 'date' }), mapped);
    expect(field).toMatchObject({ type: 'date', format: 'dd/MM/yyyy', selector: '#passport' });
  });

  it('gives an unmapped target the canonical value', () => {
    const field = dropFieldFor(el('passport'), value({ kind: 'date' }), null);
    expect(field.format).toBeUndefined();
    expect(field.type).toBe('text');
  });

  it('carries the payload path, never the value', () => {
    const field = dropFieldFor(el('passport'), value(), null);
    expect(field.path).toBe('passport.number');
    expect(JSON.stringify(field)).not.toContain('PA1234567');
  });
});
