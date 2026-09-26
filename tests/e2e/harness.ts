/**
 * E2E harness: a real unpacked MV3 build, a real Chrome side panel, a real
 * content script. Nothing here is mocked.
 *
 * The one non-obvious trick is `openSidePanel()`. `chrome.sidePanel.open()`
 * needs a user gesture, and Playwright cannot click the toolbar icon — but a
 * Playwright click inside an *extension page* is a trusted gesture, so a
 * throwaway tab of `sidepanel.html` opens the genuine side panel and then
 * closes itself. This matters: `entrypoints/background.ts` drops any message
 * whose `sender.tab` is set, so a panel opened as a plain tab is inert (every
 * request answers `undefined`), and `activeTab()` would resolve to the panel's
 * own tab anyway. The genuine side panel has no tab, so the router accepts it
 * and `chrome.tabs.query({active:true,currentWindow:true})` returns the
 * fixture tab — the exact path a human exercises.
 *
 * Playwright does not attach to the side-panel target, so it is driven over
 * raw CDP (`PanelClient`).
 */
import { test as base, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { DEV_EMAIL, DEV_PASSWORD } from '@/mock-crm/server';
import { ApplicantPayload, FormMapping } from '@/lib/schema';
import type { FieldMapping, FieldStatus, FillReport } from '@/lib/schema';
import { formatValue, isTruthy } from '@/lib/fill-engine/format';

/** Both builds coexist: `wxt build -b api` writes to its own `.output` dir. */
export const extDirFor = (mode: 'static' | 'api'): string =>
  mode === 'api' ? '.output/api-mv3-dev' : '.output/chrome-mv3-dev';

export const ROOT = resolve(import.meta.dirname, '../..');
export const BASE_URL = 'http://localhost:5174';

/**
 * Phase 1 (`static`) and Phase 2 (`api`) run the SAME spec files. `IMMIFILL_MODE`
 * picks which build is loaded and whether the run signs in first; every
 * expectation below is shared, so a divergence is a real Phase 2 defect and not
 * a forked assertion. See docs/DEMO.md "Phase 2".
 */
export const MODE: 'static' | 'api' = process.env.IMMIFILL_MODE === 'api' ? 'api' : 'static';
export const CRM_BASE = process.env.WXT_CRM_BASE ?? 'http://localhost:5176';
export const EXT_DIR = join(ROOT, extDirFor(MODE));

/* ── Data read straight off disk, through the real schemas ───────────── */

const readJson = (p: string): unknown => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

export const people = ApplicantPayload.array().parse(readJson('data/people.json'));

export const mappings = new Map<string, FormMapping>(
  readdirSync(join(ROOT, 'data/mappings'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => FormMapping.parse(readJson(`data/mappings/${f}`)))
    .map((m) => [m.formKey, m]),
);

export const personOf = (id: number): ApplicantPayload => {
  const p = people.find((x) => x.personRef.id === id);
  if (!p) throw new Error(`no synthetic person ${id}`);
  return p;
};

export const displayName = (p: ApplicantPayload): string =>
  `${p.name.given}${p.name.middle ? ` ${p.name.middle}` : ''} ${p.name.family}`;

/** The five fixtures the PRD's E2E matrix covers, plus the safety page. */
export const FIXTURES = [
  { formKey: 'fixture-plain', url: `${BASE_URL}/plain.html`, label: 'plain' },
  { formKey: 'fixture-postback', url: `${BASE_URL}/postback.html`, label: 'postback' },
  { formKey: 'fixture-react', url: `${BASE_URL}/react.html`, label: 'react' },
  { formKey: 'fixture-repeat', url: `${BASE_URL}/repeat.html`, label: 'repeat' },
  { formKey: 'immi-personal-details', url: `${BASE_URL}/immi-saved/index.html`, label: 'immi-saved' },
] as const;

export const TRAPS = { formKey: 'fixture-traps', url: `${BASE_URL}/traps.html`, label: 'traps' } as const;

/* ── Expected outcomes ───────────────────────────────────────────────── */

/**
 * Fields that are *designed* to fail, per docs/CONTRACTS.md §9.3. Everything
 * else with a value is expected to end `filled`; everything without a value is
 * expected to end `missing`. A status outside this table is a real defect.
 */
const DESIGNED_REJECTS: Record<string, readonly string[]> = {
  'fixture-traps': ['contact.phone', 'citizenship.label', 'address.residential'],
};

/** traps.html's occupation input has no id/name — the engine finds it by label. */
const READ_SELECTOR_OVERRIDE: Record<string, Record<string, string>> = {
  'fixture-traps': { 'employment.occupation': '.whsOnd' },
};

export type Expected = {
  path: string;
  status: FieldStatus;
  value: string | null;
  field: FieldMapping;
  /** Selector to read the final DOM value from; null when nothing should be read. */
  readSelector: string | null;
  rowIndex: number | null;
};

const token = (selector: string, value: string): string => selector.split('{value}').join(value);

const getPath = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);

function expectedOne(
  field: FieldMapping,
  raw: unknown,
  path: string,
  formKey: string,
  rowIndex: number | null,
): Expected {
  const value = formatValue(raw, field);
  const override = READ_SELECTOR_OVERRIDE[formKey]?.[field.path];
  const status: FieldStatus =
    value === null || value === ''
      ? 'missing'
      : DESIGNED_REJECTS[formKey]?.includes(field.path)
        ? 'rejected'
        : 'filled';
  return {
    path,
    status,
    value,
    field,
    readSelector: value === null ? null : (override ?? token(field.selector, value)),
    rowIndex,
  };
}

/** Mirrors fillPage's iteration order, including §9.1 repeat-group expansion. */
export function expectedResults(m: FormMapping, data: ApplicantPayload): Expected[] {
  const out: Expected[] = [];
  for (const field of m.fields) {
    if (field.repeatGroup) {
      const raw = getPath(data, field.repeatGroup);
      const items = Array.isArray(raw) ? raw : [];
      const key = field.path.slice(field.path.indexOf('[].') + 3);
      if (items.length === 0) {
        out.push({ path: field.path, status: 'missing', value: null, field, readSelector: null, rowIndex: null });
        continue;
      }
      items.forEach((item, i) =>
        out.push(expectedOne(field, getPath(item, key), `${field.repeatGroup}[${i}].${key}`, m.formKey, i)),
      );
      continue;
    }
    out.push(expectedOne(field, getPath(data, field.path), field.path, m.formKey, null));
  }
  return out;
}

/* ── Reading the page back ───────────────────────────────────────────── */

export type DomRead = {
  found: boolean;
  value: string;
  checked: boolean;
  optionLabel: string;
  classes: string;
};

export async function readField(page: Page, e: Expected): Promise<DomRead> {
  if (e.readSelector === null) throw new Error(`no read selector for ${e.path}`);
  const rowSelector = e.rowIndex === null ? null : (e.field.rowSelector ?? null);
  return page.evaluate(
    ({ selector, rowSelector: rs, rowIndex }) => {
      const root =
        rs === null || rowIndex === null
          ? document
          : (document.querySelectorAll(rs)[rowIndex] ?? null);
      const el = root ? root.querySelector(selector) : null;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
        return { found: false, value: '', checked: false, optionLabel: '', classes: '' };
      }
      const opt = el instanceof HTMLSelectElement ? el.selectedOptions[0] : undefined;
      return {
        found: true,
        value: el.value,
        checked: el instanceof HTMLInputElement ? el.checked : false,
        optionLabel: (opt?.label || opt?.textContent || '').trim(),
        classes: el.className,
      };
    },
    { selector: e.readSelector, rowSelector, rowIndex: e.rowIndex },
  );
}

/** Asserts the final DOM value for one expected `filled` field. */
export function assertFilledValue(e: Expected, dom: DomRead): void {
  const want = e.value ?? '';
  expect(dom.found, `${e.path}: element not found via ${e.readSelector}`).toBe(true);
  switch (e.field.type) {
    case 'radio':
      expect(dom.checked, `${e.path}: radio not checked`).toBe(true);
      break;
    case 'checkbox':
      expect(dom.checked, `${e.path}: checkbox state`).toBe(isTruthy(want));
      break;
    case 'select':
      // CONTRACTS §5: option.value exactly, else label case-insensitively.
      expect(
        dom.value === want || dom.optionLabel.toLowerCase() === want.toLowerCase(),
        `${e.path}: select landed on value="${dom.value}" label="${dom.optionLabel}"`,
      ).toBe(true);
      break;
    default:
      expect(dom.value, `${e.path}: final input value`).toBe(want);
  }
}

export const countBy = (report: FillReport): Record<FieldStatus, number> => {
  const c: Record<FieldStatus, number> = { filled: 0, missing: 0, not_found: 0, rejected: 0 };
  for (const r of report.results) c[r.status] += 1;
  return c;
};

/* ── Side panel over raw CDP ─────────────────────────────────────────── */

type CdpReply = { id?: number; result?: Record<string, unknown>; error?: { message: string } };

export class PanelClient {
  #ws: WebSocket;
  #seq = 0;
  #pending = new Map<number, (m: CdpReply) => void>();

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    this.#ws.onmessage = (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data)) as CdpReply;
      if (m.id === undefined) return;
      this.#pending.get(m.id)?.(m);
      this.#pending.delete(m.id);
    };
  }

  static async connect(wsUrl: string): Promise<PanelClient> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error(`cannot open CDP socket ${wsUrl}`));
    });
    return new PanelClient(ws);
  }

  cdp(method: string, params: Record<string, unknown> = {}): Promise<CdpReply> {
    const id = ++this.#seq;
    return new Promise((res) => {
      this.#pending.set(id, res);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates in the side panel's own page context. */
  async eval<T>(expression: string): Promise<T> {
    const r = await this.cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    const res = r.result as { result?: { value?: T }; exceptionDetails?: { text?: string } } | undefined;
    if (res?.exceptionDetails) throw new Error(`panel eval failed: ${res.exceptionDetails.text}`);
    return res?.result?.value as T;
  }

  /** The real panel→worker round trip: same call `entrypoints/sidepanel/messaging.ts` makes. */
  msg<T>(message: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    return this.eval(`chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  }

  async expectOk<T>(message: Record<string, unknown>): Promise<T> {
    const res = await this.msg<T>(message);
    if (!res.ok) throw new Error(`${String(message.kind)} failed: ${res.error}`);
    return res.data;
  }

  /**
   * Signs in through the REAL login form: panel → `LOGIN` → service worker →
   * `CrmApiDataSource.login()` → mock CRM. Nothing is stubbed.
   */
  async fillLogin(email: string, password: string): Promise<void> {
    await this.waitFor(`document.querySelector('[data-testid="login-form"]')`);
    await this.setControl('login-email', email);
    await this.setControl('login-password', password);
    await this.click('login-submit');
  }

  /** Same, but the sign-in must succeed; a rejection surfaces the panel's message. */
  async signIn(email = DEV_EMAIL, password = DEV_PASSWORD): Promise<void> {
    await this.fillLogin(email, password);
    try {
      // Waiting on the session bar alone, not "bar or error": App.tsx leaves a
      // previous attempt's error on screen until the next one succeeds, so an
      // `||` here would resolve instantly against a stale message.
      await this.waitFor(`document.querySelector('[data-testid="session-bar"]')`);
    } catch (e: unknown) {
      const [error] = await this.texts('login-error');
      throw new Error(error === undefined ? String(e) : `sign-in failed: ${error}`);
    }
  }

  click(testid: string, nth = 0): Promise<void> {
    return this.eval(
      `void document.querySelectorAll('[data-testid="${testid}"]')[${nth}].click()`,
    );
  }

  /** Native setter + bubbling event, so Preact's onInput/onChange sees it. */
  setControl(testid: string, value: string, proto: 'HTMLInputElement' | 'HTMLSelectElement' = 'HTMLInputElement'): Promise<void> {
    return this.eval(`(() => {
      const el = document.querySelector('[data-testid="${testid}"]');
      Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  /**
   * Picks a person through the real list. Waits for the *named* row rather than
   * a row count: the previous query's list can also be one row long, and
   * clicking it selects the wrong person.
   */
  async selectPerson(type: string, query: string, nameFragment: string): Promise<void> {
    const want = JSON.stringify(nameFragment);
    await this.setControl('entity-type', type, 'HTMLSelectElement');
    await this.setControl('person-search', query);
    const row = `[...document.querySelectorAll('[data-testid="person-result"]')].find((e) => e.innerText.includes(${want}))`;
    await this.waitFor(row);
    await this.eval(`void ${row}.click()`);
    await this.waitFor(`document.querySelector('[data-testid="selected-person"]')?.innerText.includes(${want})`);
  }

  texts(testid: string): Promise<string[]> {
    return this.eval(
      `Array.from(document.querySelectorAll('[data-testid="${testid}"]'), (e) => e.textContent.trim())`,
    );
  }

  count(testid: string): Promise<number> {
    return this.eval(`document.querySelectorAll('[data-testid="${testid}"]').length`);
  }

  async waitFor(expression: string, timeoutMs = 10_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      if (await this.eval<boolean>(`!!(${expression})`)) return;
      if (Date.now() > until) throw new Error(`panel condition timed out: ${expression}`);
      await sleep(120);
    }
  }

  async screenshot(file: string): Promise<void> {
    const r = await this.cdp('Page.captureScreenshot', { format: 'png' });
    const data = (r.result as { data?: string } | undefined)?.data ?? '';
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
  }

  close(): void {
    this.#ws.close();
  }
}

/* ── Launch ──────────────────────────────────────────────────────────── */

export type App = {
  context: BrowserContext;
  page: Page;
  sw: Worker;
  panel: PanelClient;
  extensionId: string;
  /** Navigates the fixture tab and leaves it as the active tab. */
  open(url: string): Promise<void>;
  close(): Promise<void>;
};

export type LaunchOpts = {
  slowMo?: number;
  videoDir?: string;
  /** api mode only: skip the sign-in, leaving the panel on the login wall. */
  signIn?: boolean;
};

async function devtoolsPort(userDataDir: string): Promise<number> {
  for (let i = 0; i < 100; i += 1) {
    try {
      const line = readFileSync(join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      const port = Number(line);
      if (port > 0) return port;
    } catch {
      /* not written yet */
    }
    await sleep(100);
  }
  throw new Error('Chromium never wrote DevToolsActivePort');
}

/**
 * The dev manifest declares only the fixture origin plus
 * `optional_host_permissions: ['<all_urls>']`, and the only runtime grant the
 * product offers ("Enable on this site") grants the ACTIVE TAB's origin — the
 * CRM is never a tab, so a dev build cannot reach `WXT_CRM_BASE` and every
 * `fetch` dies as "Failed to fetch". The production manifest already declares
 * the CRM host (`https://api.successedu.com.au/*`), so this adds the mock's
 * origin to the loaded build to model production. Harness-only, idempotent;
 * see docs/DEMO.md "What the mock does NOT prove" for the real fix.
 */
function ensureCrmHostPermission(): void {
  const file = join(EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { host_permissions?: string[] };
  const origin = `${CRM_BASE}/*`;
  const hosts = manifest.host_permissions ?? [];
  if (hosts.includes(origin)) return;
  manifest.host_permissions = [...hosts, origin];
  writeFileSync(file, JSON.stringify(manifest, null, 2));
}

export async function launchApp(opts: LaunchOpts = {}): Promise<App> {
  if (MODE === 'api') ensureCrmHostPermission();
  const userDataDir = mkdtempSync(join(tmpdir(), 'immifill-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false, // MV3 service workers need a real browser; DISPLAY must be set
    slowMo: opts.slowMo,
    viewport: { width: 1280, height: 900 },
    recordVideo: opts.videoDir ? { dir: opts.videoDir, size: { width: 1280, height: 900 } } : undefined,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--remote-debugging-port=0',
    ],
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = new URL(sw.url()).host;

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${BASE_URL}/index.html`);
  const tabId = await sw.evaluate(
    async (url: string) => (await chrome.tabs.query({ url }))[0]?.id ?? -1,
    `${BASE_URL}/*`,
  );
  if (tabId < 0) throw new Error('fixture tab not visible to the extension');

  // Trusted gesture inside an extension page → the genuine side panel.
  const opener = await context.newPage();
  await opener.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await opener.evaluate((tid: number) => {
    const b = document.createElement('button');
    b.id = 'immifill-e2e-open';
    b.textContent = 'open panel';
    b.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:99999;width:140px;height:40px';
    b.onclick = () => {
      void chrome.sidePanel.open({ tabId: tid }).then(
        () => (document.title = 'PANEL_OPEN'),
        (e: Error) => (document.title = `PANEL_ERR ${e.message}`),
      );
    };
    document.body.appendChild(b);
  }, tabId);
  await opener.click('#immifill-e2e-open');
  await expect.poll(() => opener.title(), { timeout: 10_000 }).toBe('PANEL_OPEN');
  await opener.close();

  const port = await devtoolsPort(userDataDir);
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
    url: string;
    webSocketDebuggerUrl: string;
  }[];
  const target = targets.find((t) => t.url.endsWith('/sidepanel.html'));
  if (!target) throw new Error('side panel target not found — sidePanel.open did not stick');
  const panel = await PanelClient.connect(target.webSocketDebuggerUrl);

  // Which build actually got loaded? `LOGOUT` answers `not supported` in a
  // static build (CONTRACTS §10.1) and `ok` in an api one — so a stale or
  // wrong-mode `.output` fails here instead of as a baffling timeout.
  const probe = await panel.msg({ kind: 'LOGOUT' });
  const built = probe.ok ? 'api' : 'static';
  if (built !== MODE) {
    throw new Error(
      `${EXT_DIR} is a ${built}-mode build but IMMIFILL_MODE=${MODE} — rebuild with ` +
        (MODE === 'api' ? '`pnpm build:api`' : '`pnpm build`'),
    );
  }

  if (MODE === 'api' && opts.signIn === false) {
    await panel.waitFor(`document.querySelector('[data-testid="login-form"]')`);
  } else {
    if (MODE === 'api') await panel.signIn();
    await panel.waitFor(`document.querySelector('[data-testid="fill-button"]')`);
  }

  await page.bringToFront();

  return {
    context,
    page,
    sw,
    panel,
    extensionId,
    async open(url: string) {
      await page.goto(url);
      await page.bringToFront();
      // The panel re-detects on tabs.onUpdated; give that round trip a moment.
      await sleep(250);
    },
    async close() {
      panel.close();
      await context.close();
    },
  };
}

export const test = base.extend<object, { app: App }>({
  app: [
    async ({}, use) => {
      const app = await launchApp();
      await use(app);
      await app.close();
    },
    { scope: 'worker' },
  ],
});

export { expect };
