import { fillPage, restore } from '@/lib/fill-engine';
import {
  err,
  isMessage,
  ok,
  type ContentMessage,
  type ContentResponses,
  type RecordFieldCapturedMsg,
  type Result,
} from '@/lib/messages';
import { detectFormKey } from '@/lib/page-detect';
import { startRecording } from '@/lib/record';
import { ApplicantPayload, FormMapping, type FieldMapping, type FillReport } from '@/lib/schema';

/** chrome.scripting.executeScript may re-inject us into an already-live tab. */
const INJECTED = Symbol.for('immifill.injected');

const CONTENT_KINDS: ReadonlySet<string> = new Set<ContentMessage['kind']>([
  'DETECT_PAGE', 'FILL_PAGE', 'UNDO_PAGE', 'RECORD_MODE', 'RECORD_GET',
]);

export default defineContentScript({
  matches: [
    'http://localhost:5174/*',
    'http://127.0.0.1:5175/*',
    'https://online.immi.gov.au/*',
  ],
  main() {
    const flags = window as unknown as Record<symbol, boolean | undefined>;
    if (flags[INJECTED]) return;
    flags[INJECTED] = true;

    let snapshot: FillReport['snapshot'] = [];
    let stopRecording: (() => void) | null = null;
    let captured: FieldMapping[] = [];

    const headings = (): string[] =>
      Array.from(document.querySelectorAll('h1,h2,h3,legend,[role=heading]'), (el) =>
        (el.textContent ?? '').trim(),
      ).filter(Boolean);

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
            stopRecording = startRecording(msg.paths, (field: FieldMapping) => {
              captured.push(field);
              const broadcast: RecordFieldCapturedMsg = { kind: 'RECORD_FIELD_CAPTURED', field };
              void chrome.runtime.sendMessage(broadcast).catch(() => {});
            });
          }
          return ok({ on: msg.on });
        }

        case 'RECORD_GET':
          return ok(captured);
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
