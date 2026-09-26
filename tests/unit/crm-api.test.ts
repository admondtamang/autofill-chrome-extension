/**
 * Phase 2 data layer: CONTRACTS §10.2–§10.4.
 * Stubbed-fetch cases below; the real mock server is driven end to end at the
 * bottom — that one is the contract-parity proof against StaticDataSource.
 */
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApplicantPayload, FormMapping, MappingIndexEntry } from '@/lib/schema';
import { NotFoundError, UnauthorizedError } from '@/lib/data/errors';
import { StaticDataSource } from '@/lib/data/static';
import { CrmApiDataSource } from '@/lib/data/crm-api';
import { createMockCrm, DEV_EMAIL, DEV_PASSWORD } from '@/mock-crm/server';

const SESSION_KEY = 'immifill.session';
const BASE = 'https://crm.test';

function session(expiry = new Date(Date.now() + 3_600_000).toISOString()) {
  return { token: 'tok-abc', expiry, user: { id: 7, email: DEV_EMAIL } };
}

function stubChrome(stored?: unknown) {
  const store: Record<string, unknown> = stored === undefined ? {} : { [SESSION_KEY]: stored };
  const chromeStub = {
    storage: {
      session: {
        get: vi.fn(async (k: string) => (k in store ? { [k]: store[k] } : {})),
        set: vi.fn(async (o: Record<string, unknown>) => Object.assign(store, o)),
        remove: vi.fn(async (k: string) => {
          delete store[k];
        }),
      },
    },
    alarms: { create: vi.fn(), clear: vi.fn(async () => true), onAlarm: { addListener: vi.fn() } },
  };
  vi.stubGlobal('chrome', chromeStub);
  return { chromeStub, store };
}

interface Reply {
  status: number;
  body?: unknown;
  etag?: string;
  throws?: boolean;
}

/** Queue of replies; the last one repeats. Records the init of every call. */
function stubFetch(replies: Reply[]) {
  let i = 0;
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = replies[Math.min(i++, replies.length - 1)] as Reply;
    if (r.throws) throw new TypeError('network down');
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h: string) => (h === 'etag' && r.etag ? r.etag : null) },
      json: async () => r.body,
    };
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const headersOf = (fn: ReturnType<typeof stubFetch>, call: number): Record<string, string> =>
  (fn.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;

describe('CrmApiDataSource auth (§10.2)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sends the bare token, never a Bearer prefix', async () => {
    stubChrome(session());
    const fetchFn = stubFetch([{ status: 200, body: { rows: [] } }]);
    await new CrmApiDataSource(BASE).search('lead', 'ann');
    expect(headersOf(fetchFn, 0).authorization).toBe('tok-abc');
  });

  it('login: 401 clears the session and throws UnauthorizedError', async () => {
    const { store } = stubChrome(session());
    stubFetch([{ status: 401, body: {} }]);
    await expect(new CrmApiDataSource(BASE).login(DEV_EMAIL, 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(store[SESSION_KEY]).toBeUndefined();
  });

  it('request: 401 clears the session and throws UnauthorizedError', async () => {
    const { chromeStub, store } = stubChrome(session());
    stubFetch([{ status: 401, body: {} }]);
    await expect(new CrmApiDataSource(BASE).getPayload('lead', 1001)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(store[SESSION_KEY]).toBeUndefined();
    expect(chromeStub.alarms.clear).toHaveBeenCalledWith('immifill.logout');
  });

  it('an expired stored session counts as no session', async () => {
    const { store } = stubChrome(session(new Date(Date.now() - 1_000).toISOString()));
    const fetchFn = stubFetch([{ status: 200, body: { rows: [] } }]);
    await expect(new CrmApiDataSource(BASE).search('lead', '')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store[SESSION_KEY]).toBeUndefined();
  });

  it('the password is never persisted', async () => {
    const { chromeStub, store } = stubChrome();
    stubFetch([{ status: 200, body: session() }]);
    await new CrmApiDataSource(BASE).login(DEV_EMAIL, 'hunter2');
    expect(JSON.stringify(chromeStub.storage.session.set.mock.calls)).not.toContain('hunter2');
    expect(JSON.stringify(store)).not.toContain('hunter2');
  });

  it('a malformed body fails the Zod parse loudly', async () => {
    stubChrome(session());
    stubFetch([{ status: 200, body: { rows: [{ id: 'not-a-number' }] } }]);
    await expect(new CrmApiDataSource(BASE).search('lead', '')).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe('mapping ETag cache and bundled fallback (§10.3)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  const INDEX = [
    {
      formKey: 'remote-only',
      version: 9,
      pageMatch: { host: 'x.test', urlIncludes: '', headingText: '' },
    },
  ];

  it('sends if-none-match once an ETag is cached, and a 304 serves the cache', async () => {
    stubChrome(session());
    const fetchFn = stubFetch([
      { status: 200, body: INDEX, etag: '"v1"' },
      { status: 304 }, // no body: a re-parse would throw
    ]);
    const ds = new CrmApiDataSource(BASE);
    const first = await ds.listMappings();
    expect(headersOf(fetchFn, 0)['if-none-match']).toBeUndefined();

    const second = await ds.listMappings();
    expect(headersOf(fetchFn, 1)['if-none-match']).toBe('"v1"');
    expect(second).toEqual(first);
  });

  it('a 200 replaces the cache and the ETag', async () => {
    stubChrome(session());
    const bumped = [{ ...INDEX[0], version: 10 }];
    const fetchFn = stubFetch([
      { status: 200, body: INDEX, etag: '"v1"' },
      { status: 200, body: bumped, etag: '"v2"' },
      { status: 304 },
    ]);
    const ds = new CrmApiDataSource(BASE);
    await ds.listMappings();
    expect((await ds.listMappings())[0]?.version).toBe(10);
    expect((await ds.listMappings())[0]?.version).toBe(10); // 304 serves the new copy
    expect(headersOf(fetchFn, 2)['if-none-match']).toBe('"v2"');
  });

  it('falls back to the bundled mappings on a network failure', async () => {
    stubChrome(session());
    stubFetch([{ status: 0, throws: true }]);
    const index = await new CrmApiDataSource(BASE).listMappings();
    expect(index.map((m) => m.formKey)).toContain('fixture-plain');
    expect(index).toEqual(await new StaticDataSource().listMappings());
  });

  it('falls back on a 5xx, and discards a remote mapping that fails FormMapping.parse', async () => {
    stubChrome(session());
    stubFetch([{ status: 503, body: {} }]);
    expect(await new CrmApiDataSource(BASE).getMapping('fixture-plain')).toEqual(
      await new StaticDataSource().getMapping('fixture-plain'),
    );

    // Hostile remote mapping: fields is not an array of FieldMapping.
    stubFetch([
      { status: 200, body: { formKey: 'fixture-plain', version: 99, fields: 'drop table' } },
    ]);
    const got = await new CrmApiDataSource(BASE).getMapping('fixture-plain');
    expect(got.version).toBe(1); // the bundled copy, not the half-validated one
    expect(FormMapping.parse(got)).toEqual(got);
  });

  it('a 401 is never masked by the fallback', async () => {
    const { store } = stubChrome(session());
    stubFetch([{ status: 401, body: {} }]);
    await expect(new CrmApiDataSource(BASE).listMappings()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(new CrmApiDataSource(BASE).getMapping('fixture-plain')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(store[SESSION_KEY]).toBeUndefined();
  });

  it('a 404 on an unknown formKey stays a NotFoundError', async () => {
    stubChrome(session());
    stubFetch([{ status: 404, body: {} }]);
    await expect(new CrmApiDataSource(BASE).getMapping('nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// --- the real mock server -------------------------------------------------

describe('CrmApiDataSource against the real mock-crm (§10.4)', () => {
  const server = createMockCrm();
  let base = '';
  let ds: CrmApiDataSource;
  const staticDs = new StaticDataSource();

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    vi.unstubAllGlobals();
    stubChrome();
    ds = new CrmApiDataSource(base);
  });

  it('rejects every route without the authorization header', async () => {
    for (const path of ['/lead', '/immifill/mappings', '/immifill/payload/lead/1001']) {
      expect((await fetch(`${base}${path}`)).status).toBe(401);
    }
    expect((await fetch(`${base}/lead`, { headers: { authorization: 'bogus' } })).status).toBe(401);
  });

  it('logs in, and bad credentials are a 401', async () => {
    await expect(ds.login(DEV_EMAIL, 'nope')).rejects.toBeInstanceOf(UnauthorizedError);
    const s = await ds.login(DEV_EMAIL, DEV_PASSWORD);
    expect(s.user.email).toBe(DEV_EMAIL);
    expect(Date.parse(s.expiry)).toBeGreaterThan(Date.now());
  });

  it('serves the same five synthetic people as StaticDataSource', async () => {
    await ds.login(DEV_EMAIL, DEV_PASSWORD);
    for (const type of ['lead', 'student', 'visa', 'skill-assessment'] as const) {
      expect(await ds.search(type, '')).toEqual(await staticDs.search(type, ''));
    }
    const all = await Promise.all(
      (['lead', 'student', 'visa', 'skill-assessment'] as const).map((t) => ds.search(t, '')),
    );
    const refs = all.flat().map((p) => p.personRef);
    expect(refs).toHaveLength(5);

    for (const ref of refs) {
      const got = await ds.getPayload(ref.type, ref.id);
      expect(got).toEqual(await staticDs.getPayload(ref.type, ref.id));
      expect(ApplicantPayload.parse(got)).toEqual(got);
    }
    await expect(ds.getPayload('lead', 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mappings match the bundle, emit an ETag, and 304 on the follow-up', async () => {
    const s = await ds.login(DEV_EMAIL, DEV_PASSWORD);
    expect(await ds.listMappings()).toEqual(await staticDs.listMappings());
    expect(await ds.getMapping('fixture-traps')).toEqual(
      await staticDs.getMapping('fixture-traps'),
    );

    const first = await fetch(`${base}/immifill/mappings`, {
      headers: { authorization: s.token },
    });
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{40}"$/);
    const second = await fetch(`${base}/immifill/mappings`, {
      headers: { authorization: s.token, 'if-none-match': etag as string },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(z.array(MappingIndexEntry).parse(await first.json())).toHaveLength(6);
  });

  it('falls back to the bundle while the server is failing, then recovers', async () => {
    await ds.login(DEV_EMAIL, DEV_PASSWORD);
    await fetch(`${base}/__fail/mappings?on=1`, { method: 'POST' });
    expect(await ds.listMappings()).toEqual(await staticDs.listMappings());
    await fetch(`${base}/__fail/mappings?on=0`, { method: 'POST' });
    expect(await ds.listMappings()).toEqual(await staticDs.listMappings());
  });

  it('accepts a counts-only audit and rejects a payload-shaped one', async () => {
    const s = await ds.login(DEV_EMAIL, DEV_PASSWORD);
    await expect(
      ds.audit({
        formKey: 'fixture-plain',
        mappingVersion: 1,
        personType: 'lead',
        personId: 1001,
        counts: { filled: 3, missing: 1 },
        at: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();

    const leaky = await fetch(`${base}/immifill/audit`, {
      method: 'POST',
      headers: { authorization: s.token, 'content-type': 'application/json' },
      body: JSON.stringify({
        formKey: 'fixture-plain',
        mappingVersion: 1,
        personType: 'lead',
        personId: 1001,
        counts: { filled: 3 },
        at: new Date().toISOString(),
        payload: { name: { given: 'Complete' } },
      }),
    });
    expect(leaky.status).toBe(400);
  });

  it('an expired token is a 401 from the server', async () => {
    const res = await fetch(`${base}/auth/login?expiry_ms=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    });
    const { token } = (await res.json()) as { token: string };
    await new Promise((r) => setTimeout(r, 10));
    expect((await fetch(`${base}/lead`, { headers: { authorization: token } })).status).toBe(401);
  });
});
