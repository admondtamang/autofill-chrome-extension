import { fillPage, restore } from '@/lib/fill-engine';
import { isFillable, stableSelector, type Fillable } from '@/lib/fill-engine/dom';
import { formatValue } from '@/lib/fill-engine/format';
import { applyField } from '@/lib/fill-engine/handlers';
import { isUnsafe } from '@/lib/fill-engine/safety';
import { verify } from '@/lib/fill-engine/verify';
import {
  err,
  isMessage,
  ok,
  type ContentMessage,
  type ContentResponses,
  type PaletteDropMsg,
  type PaletteValue,
  type RecordFieldCapturedMsg,
  type Result,
} from '@/lib/messages';
import { detectFormKey } from '@/lib/page-detect';
import { buildPalette, dropFieldFor, DRAG_TYPE, type Palette } from '@/lib/palette';
import { startRecording } from '@/lib/record';
import {
  ApplicantPayload,
  FormMapping,
  type FieldMapping,
  type FieldResult,
  type FieldStatus,
  type FillReport,
} from '@/lib/schema';

/** chrome.scripting.executeScript may re-inject us into an already-live tab. */
const INJECTED = Symbol.for('immifill.injected');

const CONTENT_KINDS: ReadonlySet<string> = new Set<ContentMessage['kind']>([
  'DETECT_PAGE', 'FILL_PAGE', 'UNDO_PAGE', 'RECORD_MODE', 'RECORD_GET', 'SHOW_PALETTE',
]);

/** CONTRACTS §11 amendment: values in the page get the same 60s budget. */
const PALETTE_IDLE_MS = 60_000;

const HIGHLIGHT_ID = 'immifill-style';

// ponytail: the same four rules lib/fill-engine/index.ts injects. The engine
// does not export ensureStyle() and §5 freezes its surface, so a drop that
// happens before any fill re-declares them rather than widening that contract.
const HIGHLIGHT_CSS = `.immifill-filled{outline:2px solid #2e7d32!important}
.immifill-missing{outline:2px dashed #ef6c00!important}
.immifill-not_found{outline:2px dashed #6a1b9a!important}
.immifill-rejected{outline:2px solid #c62828!important}`;

export default defineContentScript({
  // Every site, per the owner's all-sites decision. The engine's safety gate
  // (lib/fill-engine/safety.ts) is what keeps this from being dangerous.
  matches: ['<all_urls>'],
  main() {
    const flags = window as unknown as Record<symbol, boolean | undefined>;
    if (flags[INJECTED]) return;
    flags[INJECTED] = true;

    let snapshot: FillReport['snapshot'] = [];
    let stopRecording: (() => void) | null = null;
    let captured: FieldMapping[] = [];

    /* ── Value palette (CONTRACTS §11) ─────────────────────────────────
       Applicant values live here ONLY while the palette is open. They are
       dropped on close, on navigation, when the tab hides, and after 60s
       idle. Never chrome.storage, never logged. */

    let palette: Palette | null = null;
    let tokens = new Map<string, PaletteValue>();
    let palettePos: { x: number; y: number } | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    /** The mapping of the last fill on this page — the only one the page knows. */
    let lastMapping: FormMapping | null = null;

    const headings = (): string[] =>
      Array.from(document.querySelectorAll('h1,h2,h3,legend,[role=heading]'), (el) =>
        (el.textContent ?? '').trim(),
      ).filter(Boolean);

    function ensureHighlightStyle(): void {
      if (document.getElementById(HIGHLIGHT_ID)) return;
      const style = document.createElement('style');
      style.id = HIGHLIGHT_ID;
      style.textContent = HIGHLIGHT_CSS;
      (document.head ?? document.documentElement).appendChild(style);
    }

    function highlight(el: Element, status: FieldStatus): void {
      el.classList.remove(
        'immifill-filled', 'immifill-missing', 'immifill-not_found', 'immifill-rejected',
      );
      el.classList.add(`immifill-${status}`);
    }

    function closePalette(): void {
      clearTimeout(idleTimer);
      idleTimer = undefined;
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('drop', onDrop, true);
      palette?.destroy();
      palette = null;
      tokens = new Map(); // the values themselves go with it
    }

    const touchIdle = (): void => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(closePalette, PALETTE_IDLE_MS);
    };

    /** Prior value of a manual drop target, captured before the first write (§11.3). */
    function snapshotTarget(el: Fillable): void {
      const base = stableSelector(el);
      const entry: FillReport['snapshot'][number] =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? {
              // Group members share a name, so each needs its own value selector.
              selector: base.startsWith('[name=')
                ? `${base}[value="${el.value.replace(/"/g, '\\"')}"]`
                : base,
              kind: 'checked',
              value: String(el.checked),
            }
          : { selector: base, kind: 'value', value: el.value };
      if (snapshot.some((s) => s.selector === entry.selector)) return; // keep the oldest
      snapshot.push(entry);
    }

    const mappedField = (el: Element): FieldMapping | null =>
      lastMapping?.fields.find(
        (f) => !f.selector.includes('{value}') && document.querySelector(f.selector) === el,
      ) ?? null;

    /**
     * §11.3 — a drop is a single-field fill on the SAME engine path:
     * isUnsafe() gate → applyField (setNative) → verify → highlight → FieldResult.
     * Manual placement is not a bypass of the safety rules.
     */
    function dropValue(target: EventTarget | null, v: PaletteValue): FieldResult {
      if (!(target instanceof Element)) {
        return { path: v.path, status: 'not_found', detail: 'no drop target' };
      }
      // First gate, before anything is read or written: Submit buttons and
      // declaration checkboxes are not drop targets.
      if (isUnsafe(target)) return { path: v.path, status: 'rejected', detail: 'unsafe target' };
      if (!isFillable(target)) {
        return { path: v.path, status: 'not_found', detail: 'not a form field' };
      }

      const field = dropFieldFor(target, v, mappedField(target));
      const value = formatValue(v.value, field);
      if (value === null || value === '') return { path: v.path, status: 'missing' };

      ensureHighlightStyle();
      snapshotTarget(target);
      applyField(target, field, value);
      if (!verify(target, field, value)) {
        highlight(target, 'rejected');
        return { path: v.path, status: 'rejected', detail: 'value not accepted by the page' };
      }
      highlight(target, 'filled');
      return { path: v.path, status: 'filled' };
    }

    function onDragOver(ev: DragEvent): void {
      // Only our own drags are droppable; everything else keeps page behaviour.
      if (ev.dataTransfer?.types.includes(DRAG_TYPE)) ev.preventDefault();
    }

    function onDrop(ev: DragEvent): void {
      const token = ev.dataTransfer?.getData(DRAG_TYPE);
      const v = token ? tokens.get(token) : undefined;
      if (!v) return;
      ev.preventDefault();
      ev.stopPropagation();
      touchIdle();
      const msg: PaletteDropMsg = { kind: 'PALETTE_DROP', result: dropValue(ev.target, v) };
      void chrome.runtime.sendMessage(msg).catch(() => {});
    }

    // Navigation and tab-hide both end the palette's custody of the values.
    window.addEventListener('pagehide', closePalette);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) closePalette();
    });

    async function route(
      msg: ContentMessage,
    ): Promise<Result<ContentResponses[ContentMessage['kind']]>> {
      switch (msg.kind) {
        case 'DETECT_PAGE': {
          const formKey = detectFormKey(msg.index, {
            host: location.host,
            url: location.href,
            headings: headings(),
          });
          return ok(formKey ? { formKey } : null);
        }

        case 'FILL_PAGE': {
          // Defence in depth: both sides of the port validate.
          const mapping = FormMapping.parse(msg.mapping);
          const payload = ApplicantPayload.parse(msg.payload);
          const report = await fillPage(mapping, payload);
          snapshot = report.snapshot;
          lastMapping = mapping;
          return ok(report);
        }

        case 'UNDO_PAGE': {
          const restored = restore(snapshot);
          snapshot = [];
          return ok({ restored });
        }

        case 'RECORD_MODE': {
          stopRecording?.();
          stopRecording = null;
          if (msg.on) {
            captured = [];
            stopRecording = startRecording((field: FieldMapping) => {
              captured.push(field);
              const broadcast: RecordFieldCapturedMsg = { kind: 'RECORD_FIELD_CAPTURED', field };
              void chrome.runtime.sendMessage(broadcast).catch(() => {});
            });
          }
          return ok({ on: msg.on });
        }

        case 'RECORD_GET':
          return ok(captured);

        case 'SHOW_PALETTE': {
          closePalette(); // a person change rebuilds, which also resets every reveal
          if (msg.on && msg.values) {
            palette = buildPalette(
              msg.values,
              {
                onDragStart: (token, value) => {
                  tokens.set(token, value);
                  touchIdle();
                },
                onDragEnd: (token) => {
                  tokens.delete(token);
                },
                onMove: (x, y) => {
                  palettePos = { x, y };
                },
                onClose: closePalette,
              },
              palettePos ?? undefined,
            );
            document.body.appendChild(palette.root);
            document.addEventListener('dragover', onDragOver, true);
            document.addEventListener('drop', onDrop, true);
            touchIdle();
          }
          return ok({ on: palette !== null });
        }
      }
    }

    chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      if (!isMessage(raw) || !CONTENT_KINDS.has(raw.kind)) return false;
      route(raw as ContentMessage)
        .catch((e: unknown) => err(e instanceof Error ? e.message : String(e)))
        .then(sendResponse);
      return true; // async response
    });
  },
});
