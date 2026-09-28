import {
  isMessage,
  type PanelMessage,
  type PanelResponses,
  type PasteTarget,
  type Result,
} from '@/lib/messages';
import type { FieldMapping, FieldResult } from '@/lib/schema';

// The Playwright demo opens sidepanel.html as a plain tab, where the extension
// APIs may be absent. Every helper degrades to an honest error instead of throwing.
const runtime: typeof chrome.runtime | undefined = globalThis.chrome?.runtime;

const NO_RUNTIME = 'Extension runtime unavailable — open this panel from the ImmiFill toolbar icon.';

/** Fires whenever any call comes back `unauthorized` (CONTRACTS §10.2). */
const unauthorizedSubs = new Set<() => void>();

export function onUnauthorized(cb: () => void): () => void {
  unauthorizedSubs.add(cb);
  return () => {
    unauthorizedSubs.delete(cb);
  };
}

/** Typed wrapper around chrome.runtime.sendMessage — never throws. */
export async function send<K extends PanelMessage['kind']>(
  msg: Extract<PanelMessage, { kind: K }>,
): Promise<Result<PanelResponses[K]>> {
  if (!runtime?.id) return { ok: false, error: NO_RUNTIME };
  try {
    const res: unknown = await runtime.sendMessage(msg);
    if (res && typeof res === 'object' && 'ok' in res) {
      const out = res as Result<PanelResponses[K]>;
      if (!out.ok && out.error === 'unauthorized') {
        for (const cb of unauthorizedSubs) cb();
      }
      return out;
    }
    return { ok: false, error: 'No response from the service worker.' };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Live RECORD_FIELD_CAPTURED broadcasts from the content script. */
export function onFieldCaptured(cb: (field: FieldMapping) => void): () => void {
  if (!runtime?.id) return () => {};
  const listener = (raw: unknown): void => {
    if (isMessage(raw) && raw.kind === 'RECORD_FIELD_CAPTURED') cb(raw.field);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

/** A value dragged onto a field, already run through the engine (§11.3). */
export function onDropped(cb: (result: FieldResult) => void): () => void {
  if (!runtime?.id) return () => {};
  const listener = (raw: unknown): void => {
    if (isMessage(raw) && raw.kind === 'DROPPED') cb(raw.result);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

/** The focused field on the page changed (CONTRACTS §11.4). Identity, no value. */
export function onTargetChanged(cb: (target: PasteTarget | null) => void): () => void {
  if (!runtime?.id) return () => {};
  const listener = (raw: unknown): void => {
    if (isMessage(raw) && raw.kind === 'TARGET_CHANGED') cb(raw.target);
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

/** Fires whenever the active tab changes or the current one navigates. */
export function onTabChanged(cb: () => void): () => void {
  const tabs: typeof chrome.tabs | undefined = globalThis.chrome?.tabs;
  if (!tabs) return () => {};
  const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo): void => {
    if (info.status === 'complete' || info.url !== undefined) cb();
  };
  tabs.onActivated.addListener(cb);
  tabs.onUpdated.addListener(onUpdated);
  return () => {
    tabs.onActivated.removeListener(cb);
    tabs.onUpdated.removeListener(onUpdated);
  };
}
