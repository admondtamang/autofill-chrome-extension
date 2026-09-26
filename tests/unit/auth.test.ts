// Named .ts, not .tsx: vitest.config.ts only includes tests/unit/**/*.test.ts.
import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelMessage, PanelResponses, Result } from '@/lib/messages';
// Imported eagerly, before any vi.resetModules(): the panel must share the
// preact instance this file renders with.
import { App } from '@/entrypoints/sidepanel/App';

/* ── Router (CONTRACTS §10.1) ─────────────────────────────────────── */

const SESSION = {
  token: 'tok-secret-do-not-leak',
  expiry: new Date(Date.now() + 3_600_000).toISOString(),
  user: { id: 7, email: 'agent@example.test' },
};

async function loadRouter(mode: 'static' | 'api') {
  vi.resetModules();
  vi.stubEnv('WXT_DATA_SOURCE', mode);
  return (await import('@/entrypoints/background')).route;
}

describe('auth router', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('static mode reports signed in and refuses login — no login wall', async () => {
    const route = await loadRouter('static');
    expect(await route({ kind: 'SESSION' })).toEqual({ ok: true, data: { signedIn: true } });
    expect(await route({ kind: 'LOGIN', email: 'a@example.test', password: 'pw' })).toEqual({
      ok: false,
      error: 'not supported',
    });
    expect(await route({ kind: 'LOGOUT' })).toEqual({ ok: false, error: 'not supported' });
  });

  it('a LOGIN response carries user + expiry and no token key', async () => {
    const login = vi.fn(async () => SESSION);
    vi.doMock('@/lib/data', () => ({ dataSource: { login } }));
    const route = await loadRouter('api');

    const res = (await route({
      kind: 'LOGIN',
      email: 'agent@example.test',
      password: 'hunter2',
    })) as Result<PanelResponses['LOGIN']>;

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.data).sort()).toEqual(['expiry', 'user']);
    expect(JSON.stringify(res)).not.toContain(SESSION.token);
    // The password reaches dataSource.login and goes nowhere else.
    expect(login).toHaveBeenCalledWith('agent@example.test', 'hunter2');
    expect(JSON.stringify(res)).not.toContain('hunter2');
  });

  it('SESSION never returns the token, only who and until when', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async () => ({ 'immifill.session': SESSION })),
          remove: vi.fn(async () => {}),
        },
      },
    });
    const route = await loadRouter('api');
    const res = (await route({ kind: 'SESSION' })) as Result<PanelResponses['SESSION']>;
    expect(res).toEqual({
      ok: true,
      data: { signedIn: true, user: SESSION.user, expiry: SESSION.expiry },
    });
    expect(JSON.stringify(res)).not.toContain(SESSION.token);
  });
});

/* ── Panel (CONTRACTS §10.1 — the panel only ever learns who + when) ─ */

type Send = (msg: PanelMessage) => Promise<Result<unknown>>;

const sent: PanelMessage[] = [];
let sendImpl: Send = async () => ({ ok: true, data: null });
let unauthorized: (() => void) | null = null;

vi.mock('@/entrypoints/sidepanel/messaging', () => ({
  send: (msg: PanelMessage) => {
    sent.push(msg);
    return sendImpl(msg);
  },
  onTabChanged: () => () => {},
  onUnauthorized: (cb: () => void) => {
    unauthorized = cb;
    return () => {
      unauthorized = null;
    };
  },
  onFieldCaptured: () => () => {},
}));

// Preact schedules effects on rAF, so a microtask tick is not enough.
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 50));

describe('side panel sign-in', () => {
  let host: HTMLElement;

  beforeEach(() => {
    sent.length = 0;
    unauthorized = null;
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    render(null, host);
    host.remove();
  });

  const mount = async (): Promise<void> => {
    render(h(App, {}), host);
    await flush();
  };

  const q = (id: string): HTMLElement | null => host.querySelector(`[data-testid="${id}"]`);

  it('static mode: signed in, so no login form and the Phase 1 panel renders', async () => {
    sendImpl = async (msg) => {
      if (msg.kind === 'SESSION') return { ok: true, data: { signedIn: true } };
      if (msg.kind === 'SEARCH' || msg.kind === 'PAYLOAD_PATHS') return { ok: true, data: [] };
      return { ok: true, data: null };
    };
    await mount();

    expect(q('login-form')).toBeNull();
    expect(q('session-bar')).toBeNull(); // no user → no header
    expect(q('fill-button')).not.toBeNull();
  });

  it('an unauthorized reply drops back to the login form, not an error banner', async () => {
    sendImpl = async (msg) =>
      msg.kind === 'SESSION'
        ? { ok: true, data: { signedIn: true, user: { id: 7, email: 'agent@example.test' }, expiry: SESSION.expiry } }
        : msg.kind === 'SEARCH' || msg.kind === 'PAYLOAD_PATHS'
          ? { ok: true, data: [] }
          : { ok: true, data: null };
    await mount();
    expect(q('session-user')?.textContent).toBe('agent@example.test');
    expect(q('session-expiry')?.textContent).toMatch(/^Signs out at /);

    unauthorized?.();
    await flush();

    expect(q('login-form')).not.toBeNull();
    expect(q('session-expired')?.textContent).toContain('session expired');
    expect(q('login-error')).toBeNull();
  });

  it('a wrong password shows a clear message and is never retained or echoed', async () => {
    sendImpl = async (msg) =>
      msg.kind === 'SESSION'
        ? { ok: true, data: { signedIn: false } }
        : { ok: false, error: 'unauthorized' };
    await mount();

    const email = q('login-email') as HTMLInputElement;
    const password = q('login-password') as HTMLInputElement;
    email.value = 'agent@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'wrong-pw-42';
    (q('login-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();

    expect(q('login-error')?.textContent).toBe('Email or password not recognised.');
    expect(q('session-expired')).toBeNull(); // bad creds ≠ expired session
    expect((q('login-password') as HTMLInputElement).value).toBe('');
    expect(host.innerHTML).not.toContain('wrong-pw-42');
    // Exactly one message ever carried the password, and none after it.
    const login = sent.filter((m) => m.kind === 'LOGIN');
    expect(login).toHaveLength(1);
    const after = sent.slice(sent.indexOf(login[0]!) + 1);
    expect(JSON.stringify(after)).not.toContain('wrong-pw-42');
  });
});
