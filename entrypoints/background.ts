import { dataSource } from '@/lib/data';
import { preflight } from '@/lib/fill-engine';
import {
  err,
  isMessage,
  ok,
  type ContentMessage,
  type ContentResponses,
  type PanelMessage,
  type PanelResponses,
  type Result,
} from '@/lib/messages';
import type { ApplicantPayload, FieldStatus, FormMapping } from '@/lib/schema';
import { payloadPaths } from '@/lib/record';

/* ── Applicant payload custody (CONTRACTS §8.2) ───────────────────────
   The payload exists ONLY in this module-level slot, only for the span of
   one fill. It is dropped when the fill returns, or 60s later, whichever
   comes first. It is never persisted, never logged. */

let heldPayload: ApplicantPayload | null = null;
let holdTimer: ReturnType<typeof setTimeout> | undefined;

function holdPayload(p: ApplicantPayload): ApplicantPayload {
  releasePayload();
  heldPayload = p;
  holdTimer = setTimeout(releasePayload, 60_000);
  return heldPayload;
}

function releasePayload(): void {
  heldPayload = null;
  if (holdTimer !== undefined) {
    clearTimeout(holdTimer);
    holdTimer = undefined;
  }
}

/* ── Mapping cache ─────────────────────────────────────────────────── */

const mappingCache = new Map<string, FormMapping>();

async function loadMapping(formKey: string): Promise<FormMapping> {
  const hit = mappingCache.get(formKey);
  if (hit) return hit;
  const m = await dataSource.getMapping(formKey);
  mappingCache.set(formKey, m);
  return m;
}

/* ── Tab plumbing ──────────────────────────────────────────────────── */

const NO_TAB = 'No active tab.';
const NOT_REACHABLE =
  'ImmiFill is not running on this tab. Use “Enable on this site”, then reload.';

async function activeTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error(NO_TAB);
  return { id: tab.id, url: tab.url };
}

/** Talk to the content script. A missing receiver becomes a clean error. */
async function toTab<K extends ContentMessage['kind']>(
  tabId: number,
  msg: Extract<ContentMessage, { kind: K }>,
): Promise<ContentResponses[K]> {
  let res: Result<ContentResponses[K]>;
  try {
    res = await chrome.tabs.sendMessage<ContentMessage, Result<ContentResponses[K]>>(
      tabId,
      msg,
    );
  } catch {
    throw new Error(NOT_REACHABLE);
  }
  if (!res || !res.ok) throw new Error(res?.error ?? NOT_REACHABLE);
  return res.data;
}

async function detect(
  tabId: number,
): Promise<{ formKey: string; mappingVersion: number } | null> {
  const index = await dataSource.listMappings();
  const hit = await toTab(tabId, { kind: 'DETECT_PAGE', index });
  if (!hit) return null;
  const entry = index.find((e) => e.formKey === hit.formKey);
  return entry ? { formKey: entry.formKey, mappingVersion: entry.version } : null;
}

const countStatuses = (
  statuses: readonly FieldStatus[],
): Partial<Record<FieldStatus, number>> => {
  const counts: Partial<Record<FieldStatus, number>> = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
};

const PANEL_KINDS: ReadonlySet<string> = new Set<PanelMessage['kind']>([
  'SEARCH', 'DETECT', 'PREFLIGHT', 'FILL', 'UNDO',
  'ENABLE_SITE', 'RECORD_MODE', 'RECORD_GET', 'PAYLOAD_PATHS',
]);

/* ── Router ────────────────────────────────────────────────────────── */

async function route(msg: PanelMessage): Promise<Result<PanelResponses[PanelMessage['kind']]>> {
  switch (msg.kind) {
    case 'SEARCH':
      return ok(await dataSource.search(msg.type, msg.q, { limit: msg.limit ?? 25 }));

    case 'DETECT': {
      const { id } = await activeTab();
      return ok(await detect(id));
    }

    case 'PREFLIGHT': {
      const { id } = await activeTab();
      const det = await detect(id);
      if (!det) return ok(null);
      const mapping = await loadMapping(det.formKey);
      // preflight() is pure (mapping + payload), so it runs here, not in the page.
      const payload = holdPayload(await dataSource.getPayload(msg.type, msg.personId));
      try {
        return ok({ formKey: det.formKey, missingRequired: preflight(mapping, payload) });
      } finally {
        releasePayload();
      }
    }

    case 'FILL': {
      const { id } = await activeTab();
      const det = await detect(id);
      if (!det) return err('Unsupported page — no mapping matches this form.');
      const mapping = await loadMapping(det.formKey);
      const payload = holdPayload(await dataSource.getPayload(msg.type, msg.personId));
      let report;
      try {
        report = await toTab(id, { kind: 'FILL_PAGE', mapping, payload });
      } finally {
        releasePayload();
      }
      await dataSource.audit({
        formKey: report.formKey,
        mappingVersion: report.mappingVersion,
        personType: msg.type,
        personId: msg.personId,
        counts: countStatuses(report.results.map((r) => r.status)),
        at: new Date().toISOString(),
      });
      return ok(report);
    }

    case 'UNDO': {
      const { id } = await activeTab();
      return ok(await toTab(id, { kind: 'UNDO_PAGE' }));
    }

    case 'ENABLE_SITE': {
      const tab = await activeTab();
      const origin = new URL(tab.url).origin + '/*';
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (granted) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/content.js'],
        });
      }
      return ok({ granted, origin });
    }

    case 'RECORD_MODE': {
      const { id } = await activeTab();
      return ok(await toTab(id, { kind: 'RECORD_MODE', on: msg.on, paths: payloadPaths() }));
    }

    case 'RECORD_GET': {
      const tab = await activeTab();
      const fields = await toTab(tab.id, { kind: 'RECORD_GET' });
      const url = new URL(tab.url);
      const slug = url.host.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      return ok({
        formKey: `${slug}-draft`,
        version: 1,
        pageMatch: { host: url.host, urlIncludes: url.pathname, headingText: '' },
        fields,
      });
    }

    case 'PAYLOAD_PATHS':
      return ok(payloadPaths());
  }
}

export default defineBackground(() => {
  // Clicking the toolbar action opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e: unknown) => console.error('[immifill] sidePanel behavior', e));

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    // Content-script broadcasts (RECORD_FIELD_CAPTURED) pass straight through
    // to the side panel; only panel→worker messages are routed here.
    if (!isMessage(raw) || sender.tab || !PANEL_KINDS.has(raw.kind)) return false;
    route(raw as PanelMessage)
      .catch((e: unknown) => err(e instanceof Error ? e.message : String(e)))
      .then(sendResponse);
    return true; // async response
  });
});
