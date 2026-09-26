/**
 * Phase 2 (`WXT_DATA_SOURCE=api`) — the CONTRACTS §10 behaviours, in a real
 * browser, against the contract-faithful mock CRM (§10.4).
 *
 * Parity with Phase 1 is NOT asserted here: `pnpm e2e:api` re-runs the very
 * same fill.spec / panel.spec / safety.spec against the api build, so the
 * expectations in harness.ts are the single source of truth for both modes.
 * This file only covers what Phase 1 cannot have: auth, sessions, 401s, the
 * ETag cache, and the bundled mapping fallback.
 *
 * playwright.config.ts ignores this file unless IMMIFILL_MODE=api.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_EMAIL, DEV_PASSWORD } from '@/mock-crm/server';
import {
  CRM_BASE,
  FIXTURES,
  ROOT,
  assertFilledValue,
  expectedResults,
  extDirFor,
  launchApp,
  mappings,
  personOf,
  readField,
  test,
  expect,
} from './harness';
import type { App, LaunchOpts } from './harness';
import type { FillReport } from '@/lib/schema';

const PLAIN = FIXTURES[0];
const SESSION_KEY = 'immifill.session';

/** One browser per describe block, so a broken session cannot leak sideways. */
function ownApp(opts: LaunchOpts = {}): () => App {
  let app: App;
  test.beforeAll(async () => {
    app = await launchApp(opts);
  });
  test.afterAll(async () => {
    await app.close();
  });
  return () => app;
}

const failMappings = (on: boolean): Promise<Response> =>
  fetch(`${CRM_BASE}/__fail/mappings?on=${on ? 1 : 0}`, { method: 'POST' });

/** The token as the service worker holds it — the panel must never see this. */
const workerToken = (app: App): Promise<string | null> =>
  app.sw.evaluate(async (key: string) => {
    const s = (await chrome.storage.session.get(key))[key] as { token?: string } | undefined;
    return s?.token ?? null;
  }, SESSION_KEY);

/* ── §10.1 the login wall ──────────────────────────────────────────── */

test.describe.serial('no session', () => {
  const app = ownApp({ signIn: false });

  test('an api build with no session shows the login form and blocks filling', async () => {
    const a = app();
    await a.open(PLAIN.url);

    expect(await a.panel.count('login-form')).toBe(1);
    expect(await a.panel.count('fill-button'), 'no Fill button behind the wall').toBe(0);

    // The wall is not cosmetic: the worker refuses the work too.
    const session = await a.panel.expectOk<{ signedIn: boolean }>({ kind: 'SESSION' });
    expect(session.signedIn).toBe(false);
    const fill = await a.panel.msg({ kind: 'FILL', type: 'lead', personId: 1001 });
    expect(fill).toEqual({ ok: false, error: 'unauthorized' });
    expect(await a.page.inputValue('#given'), 'nothing was filled').toBe('');
  });

  test('bad credentials show an error and leave no session', async () => {
    const a = app();
    await a.panel.fillLogin(DEV_EMAIL, 'wrong-password');
    await a.panel.waitFor(`document.querySelector('[data-testid="login-error"]')`);

    expect((await a.panel.texts('login-error'))[0]).toBe('Email or password not recognised.');
    // A rejected credential is not an expired session (§10.2).
    expect(await a.panel.count('session-expired')).toBe(0);
    expect(await a.panel.count('login-form')).toBe(1);
    expect(await workerToken(a), 'no token was stored').toBeNull();
  });

  test('the same form with the real credentials signs in', async () => {
    const a = app();
    await a.panel.signIn(DEV_EMAIL, DEV_PASSWORD);
    expect((await a.panel.texts('session-user'))[0]).toBe(DEV_EMAIL);
    expect(await workerToken(a)).toMatch(/^mock-/);
  });
});

/* ── §10.1 the token never crosses the port ────────────────────────── */

test('the token never reaches the side panel', async ({ app }) => {
  // LOGIN's own response first: `{ user, expiry }`, nothing else.
  const login = await app.panel.expectOk<Record<string, unknown>>({
    kind: 'LOGIN',
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });
  expect(Object.keys(login).sort()).toEqual(['expiry', 'user']);

  const token = await workerToken(app);
  expect(token, 'the worker must hold a token to hide').toMatch(/^mock-/);

  // Everything the panel has: message replies, its own storage, its own DOM.
  const seen = await app.panel.eval<Record<string, unknown>>(`(async () => ({
    session: await chrome.runtime.sendMessage({ kind: 'SESSION' }),
    local: JSON.stringify(localStorage),
    sessionStorage: JSON.stringify(sessionStorage),
    dom: document.documentElement.innerHTML,
  }))()`);

  const flat = JSON.stringify(seen);
  expect(flat, 'the token leaked into the panel').not.toContain(token);
  expect(flat.toLowerCase(), 'no token-shaped key crossed the port').not.toContain('"token"');
  const session = seen.session as { data?: Record<string, unknown> };
  expect(Object.keys(session.data ?? {}).sort()).toEqual(['expiry', 'signedIn', 'user']);
});

/* ── §10.3 ETag / 304 ──────────────────────────────────────────────── */

test.describe.serial('mapping cache', () => {
  const app = ownApp({ signIn: false });

  test('a second mapping load is served from the ETag cache (304)', async () => {
    const a = app();
    // Instrument the worker's fetch BEFORE the first authenticated call, so the
    // 200 → 304 transition is observed rather than inferred.
    await a.sw.evaluate(() => {
      const g = globalThis as unknown as { __fetchLog?: { url: string; status: number }[] };
      if (g.__fetchLog) return;
      g.__fetchLog = [];
      const original = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await original(input, init);
        g.__fetchLog?.push({ url: String(input), status: res.status });
        return res;
      };
    });

    await a.panel.signIn();
    await a.open(PLAIN.url);
    await a.panel.expectOk({ kind: 'DETECT' });
    await a.panel.expectOk({ kind: 'DETECT' });

    const log = await a.sw.evaluate(
      () => (globalThis as unknown as { __fetchLog: { url: string; status: number }[] }).__fetchLog,
    );
    const mapping = log.filter((e) => e.url.includes('/immifill/mappings'));
    expect(mapping.length, 'several mapping loads happened').toBeGreaterThanOrEqual(2);
    expect(mapping[0]?.status, 'the first load is a cold 200').toBe(200);
    expect(
      mapping.slice(1).map((e) => e.status),
      'every later load is a conditional 304',
    ).toEqual(mapping.slice(1).map(() => 304));

    // A 304 still yields a usable index — the cache is served, not dropped.
    const detected = await a.panel.expectOk<{ formKey: string } | null>({ kind: 'DETECT' });
    expect(detected?.formKey).toBe(PLAIN.formKey);
  });
});

/* ── §10.3 the bundled fallback, and what it must NOT mask ─────────── */

test.describe.serial('mapping fallback', () => {
  const app = ownApp();

  test.afterAll(async () => {
    await failMappings(false);
  });

  test('a 500 on the mapping routes falls back to the bundled mapping', async () => {
    const a = app();
    await failMappings(true);
    const person = personOf(1001);

    await a.open(PLAIN.url);
    const detected = await a.panel.expectOk<{ formKey: string } | null>({ kind: 'DETECT' });
    expect(detected?.formKey, 'detection survives a dead mapping index').toBe(PLAIN.formKey);

    const report = await a.panel.expectOk<FillReport>({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });

    // Identical to the Phase 1 expectation: the bundled copy IS the same data.
    const wanted = expectedResults(mappings.get(PLAIN.formKey)!, person);
    expect(report.results.map((r) => `${r.path}=${r.status}`)).toEqual(
      wanted.map((w) => `${w.path}=${w.status}`),
    );
    for (const e of wanted.filter((w) => w.status === 'filled')) {
      assertFilledValue(e, await readField(a.page, e));
    }
  });
});

test.describe.serial('401 is never masked', () => {
  const app = ownApp();

  test('a revoked token fails as unauthorized rather than falling back', async () => {
    const a = app();
    await failMappings(true); // fallback armed: it still must not swallow the 401
    try {
      await a.sw.evaluate(async (key: string) => {
        const s = (await chrome.storage.session.get(key))[key] as Record<string, unknown>;
        await chrome.storage.session.set({ [key]: { ...s, token: 'revoked-by-test' } });
      }, SESSION_KEY);

      const detect = await a.panel.msg({ kind: 'DETECT' });
      expect(detect, '§10.3(4): a 401 propagates, the bundled copy must not hide it').toEqual({
        ok: false,
        error: 'unauthorized',
      });
    } finally {
      await failMappings(false);
    }
  });

  test('the panel falls back to the login form with the session-expired note', async () => {
    const a = app();
    // The worker cleared the session on that 401 (§10.2); the panel learns of it
    // through its OWN next call — here the re-detect a tab navigation triggers.
    await a.open(PLAIN.url);
    await a.panel.waitFor(`document.querySelector('[data-testid="login-form"]')`);

    expect((await a.panel.texts('session-expired'))[0]).toContain('session expired');
    expect(await a.panel.count('login-error'), 'expired is not a credential error').toBe(0);
    expect(await workerToken(a), 'the token was cleared on the 401').toBeNull();
  });
});

/* ── PRD acceptance criterion 7 ────────────────────────────────────── */

test('criterion 7 — switching WXT_DATA_SOURCE touches no fill-engine code', () => {
  // (a) the source tree: nothing under lib/fill-engine changed for Phase 2.
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'lib/fill-engine'], {
    cwd: ROOT,
  })
    .toString()
    .trim();
  expect(dirty, 'lib/fill-engine must be byte-identical to the Phase 1 commit').toBe('');

  // (b) the artefacts: the engine ships entirely inside content.js, which has no
  // import path to lib/data — so both builds' content scripts must hash alike.
  const hash = (mode: 'static' | 'api'): string => {
    const file = join(ROOT, extDirFor(mode), 'content-scripts/content.js');
    if (!existsSync(file)) {
      throw new Error(`missing ${file} — run \`pnpm build\` and \`pnpm build:api\` first`);
    }
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  };
  expect(hash('api'), 'the api build ships a different fill engine').toBe(hash('static'));
});
