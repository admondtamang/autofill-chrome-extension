import { dataSource } from '@/lib/data';
import { UnauthorizedError } from '@/lib/data/errors';
import { preflight } from '@/lib/fill-engine';
import { getPath } from '@/lib/fill-engine/format';
import {
  err,
  isMessage,
  ok,
  type ContentMessage,
  type ContentResponses,
  type PaletteValue,
  type PanelMessage,
  type PanelResponses,
  type Result,
} from '@/lib/messages';
import type { ApplicantPayload, FieldStatus, FormMapping } from '@/lib/schema';
import type { Session } from '@/lib/data/types';
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

/* ── Session (CONTRACTS §10.1/§10.2) ──────────────────────────────────
   The token lives only in chrome.storage.session; it never crosses a port.
   The panel learns who is signed in and when the session ends, nothing more. */

const SESSION_KEY = 'immifill.session';
const IS_API = import.meta.env.WXT_DATA_SOURCE === 'api';
const NOT_SUPPORTED = 'not supported';

async function readSession(): Promise<Session | null> {
  const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as
    | Session
    | undefined;
  if (!stored) return null;
  if (Date.parse(stored.expiry) <= Date.now()) {
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
  return stored;
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

/* ── Value palette (CONTRACTS §11) ─────────────────────────────
   The worker flattens the payload so the page never carries that logic, and
   the labels are the agent's words, not the payload's dot paths. */

type Row = readonly [path: string, label: string, kind: PaletteValue['kind']];

const PALETTE_FIELDS: readonly Row[] = [
  ['name.given', 'Given name', 'text'],
  ['name.middle', 'Middle name', 'text'],
  ['name.family', 'Family name', 'text'],
  ['dob', 'Date of birth', 'date'],
  ['contact.email', 'Email address', 'email'],
  ['contact.phone', 'Phone number', 'text'],
  ['passport.number', 'Passport number', 'text'],
  ['passport.issued', 'Passport issue date', 'date'],
  ['passport.expires', 'Passport expiry date', 'date'],
  ['citizenship.label', 'Country of citizenship', 'text'],
  ['citizenship.code', 'Citizenship code', 'text'],
  ['currentVisa.type', 'Current visa', 'text'],
  ['currentVisa.expires', 'Current visa expiry', 'date'],
  ['address.residential', 'Residential address', 'text'],
  ['location', 'Onshore or offshore', 'text'],
  ['employment.occupation', 'Occupation', 'text'],
  ['education.highest', 'Highest education', 'text'],
  ['serviceTypes', 'Service types', 'text'],
];

const PALETTE_ROW_FIELDS: readonly Row[] = [
  ['street', 'street', 'text'],
  ['city', 'city', 'text'],
  ['country', 'country', 'text'],
  ['from', 'from', 'date'],
  ['to', 'to', 'date'],
];

/**
 * CONTRACTS §11.5 — Array<{ path, label, value, kind }>.
 * Every mapped field is emitted, empty ones included: an agent needs to see
 * that a person has no passport on file, not have the row silently absent.
 * An empty `value` renders as "Not set" and is not pasteable.
 */
function flattenPayload(p: ApplicantPayload): PaletteValue[] {
  const out: PaletteValue[] = [];
  const push = (path: string, label: string, kind: PaletteValue['kind'], raw: unknown): void => {
    const value = Array.isArray(raw)
      ? raw.join(', ')
      : raw === null || raw === undefined
        ? ''
        : String(raw);
    out.push({ path, label, value, kind });
  };
  for (const [path, label, kind] of PALETTE_FIELDS) push(path, label, kind, getPath(p, path));
  p.addressHistory.forEach((item, i) => {
    for (const [key, label, kind] of PALETTE_ROW_FIELDS) {
      // §9.1: the literal index, exactly as the fill report renders it.
      push(`addressHistory[${i}].${key}`, `Address ${i + 1} — ${label}`, kind, getPath(item, key));
    }
  });
  return out;
}

const PANEL_KINDS: ReadonlySet<string> = new Set<PanelMessage['kind']>([
  'SEARCH', 'DETECT', 'PREFLIGHT', 'FILL', 'UNDO',
  'ENABLE_SITE', 'RECORD_MODE', 'RECORD_GET', 'PAYLOAD_PATHS',
  'LOGIN', 'LOGOUT', 'SESSION', 'VALUES', 'PASTE', 'TARGET',
]);

/* ── Router ────────────────────────────────────────────────────────── */

export async function route(msg: PanelMessage): Promise<Result<PanelResponses[PanelMessage['kind']]>> {
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

    case 'VALUES': {
      // Same custody as every other route (§8.2): the payload is held only long
      // enough to flatten it. The side panel then owns the list; nothing is put
      // into the page until the agent clicks a value (§11.1).
      const payload = holdPayload(await dataSource.getPayload(msg.type, msg.personId));
      let flat: PaletteValue[];
      try {
        flat = flattenPayload(payload);
      } finally {
        releasePayload();
      }
      // §11.6 — plus the CRM fields ApplicantPayload has no slot for, so the
      // list reflects the record rather than just what the engine can map.
      const extra = (await dataSource.extraValues?.(msg.type, msg.personId)) ?? [];
      return ok([...flat, ...extra]);
    }

    case 'TARGET': {
      const { id } = await activeTab();
      return ok(await toTab(id, { kind: 'GET_TARGET' }));
    }

    case 'PASTE': {
      // The value travels with the message. The worker holds no lookup table:
      // MV3 kills it after ~30s idle, so anything module-level is gone by the
      // time the agent actually clicks.
      const value = msg.value;
      const { id } = await activeTab();
      return ok(await toTab(id, { kind: 'PASTE_INTO', value }));
    }

    case 'LOGIN': {
      // `password` is passed straight through and never stored, logged or
      // echoed back — not even into an error message.
      if (!IS_API || !dataSource.login) return err(NOT_SUPPORTED);
      const { user, expiry } = await dataSource.login(msg.email, msg.password);
      return ok({ user, expiry });
    }

    case 'LOGOUT': {
      if (!IS_API) return err(NOT_SUPPORTED);
      await chrome.storage.session.remove(SESSION_KEY);
      return ok({ ok: true });
    }

    case 'SESSION': {
      if (!IS_API) return ok({ signedIn: true }); // Phase 1 has no login wall.
      const s = await readSession();
      return s ? ok({ signedIn: true, user: s.user, expiry: s.expiry }) : ok({ signedIn: false });
    }
  }
}

export default defineBackground(() => {
  // Clicking the toolbar action opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e: unknown) => console.error('[immifill] sidePanel behavior', e));

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (!isMessage(raw)) return false;
    // Content-script broadcasts (RECORD_FIELD_CAPTURED) pass straight through
    // to the side panel; only panel→worker messages are routed here.
    if (sender.tab || !PANEL_KINDS.has(raw.kind)) return false;
    route(raw as PanelMessage)
      // Any UnauthorizedError from any route surfaces verbatim so the panel
      // can show the login form instead of a generic failure (§10.2).
      .catch((e: unknown) =>
        e instanceof UnauthorizedError
          ? err('unauthorized')
          : err(e instanceof Error ? e.message : String(e)),
      )
      .then(sendResponse);
    return true; // async response
  });
});
