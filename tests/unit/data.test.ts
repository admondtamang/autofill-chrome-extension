import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import peopleJson from '@/data/people.json';
import { ApplicantPayload, FormMapping } from '@/lib/schema';
import { NotFoundError, UnauthorizedError } from '@/lib/data/errors';
import { StaticDataSource } from '@/lib/data/static';
import { CrmApiDataSource } from '@/lib/data/crm-api';

const MAPPING_KEYS = [
  'fixture-plain',
  'fixture-postback',
  'fixture-react',
  'fixture-repeat',
  'fixture-traps',
  'immi-personal-details',
];

// --- contract-drift tripwire ---------------------------------------------

describe('bundled data parses against the frozen schemas', () => {
  it('every person in data/people.json is a valid ApplicantPayload', () => {
    const people = z.array(ApplicantPayload).parse(peopleJson);
    expect(people).toHaveLength(5);
    for (const p of people) expect(() => ApplicantPayload.parse(p)).not.toThrow();
  });

  it('every mapping file is a valid FormMapping', async () => {
    const files = import.meta.glob('@/data/mappings/*.json', {
      eager: true,
      import: 'default',
    });
    const parsed = Object.values(files).map((m) => FormMapping.parse(m));
    expect(parsed).toHaveLength(6); // a wrong glob base silently yields {}
    expect(parsed.map((m) => m.formKey).sort()).toEqual(MAPPING_KEYS);
  });
});

// --- StaticDataSource -----------------------------------------------------

describe('StaticDataSource', () => {
  const ds = new StaticDataSource();

  it('filters by entity type', async () => {
    expect((await ds.search('lead', '')).map((p) => p.personRef.id)).toEqual([1001, 1002]);
    expect((await ds.search('student', '')).map((p) => p.personRef.id)).toEqual([1003]);
    expect(await ds.search('tribunal', '')).toEqual([]);
  });

  it('matches a case-insensitive substring over given, family and email', async () => {
    expect((await ds.search('lead', 'SPARSE')).map((p) => p.personRef.id)).toEqual([1002]);
    expect(
      (await ds.search('lead', 'complete.applicant@example.test')).map((p) => p.personRef.id),
    ).toEqual([1001]);
    expect(await ds.search('lead', 'nobody')).toEqual([]);
  });

  it('orders asc and desc by the aliased field', async () => {
    const asc = await ds.search('lead', '', { order: 'asc', orderBy: 'firstName' });
    const desc = await ds.search('lead', '', { order: 'desc', orderBy: 'firstName' });
    expect(asc.map((p) => p.personRef.id)).toEqual([1001, 1002]);
    expect(desc.map((p) => p.personRef.id)).toEqual([1002, 1001]);

    // 'lastName'/'email' are aliases too; both leads share a family name, so
    // email is the discriminating one.
    const byEmail = await ds.search('lead', '', { orderBy: 'email', order: 'desc' });
    expect(byEmail.map((p) => p.email)).toEqual([
      'sparse.applicant@example.test',
      'complete.applicant@example.test',
    ]);
  });

  it('honours limit', async () => {
    expect(await ds.search('lead', '', { limit: 1 })).toHaveLength(1);
  });

  it('getPayload returns a clean parse for all five people', async () => {
    const people = z.array(ApplicantPayload).parse(peopleJson);
    for (const p of people) {
      const got = await ds.getPayload(p.personRef.type, p.personRef.id);
      expect(got).toEqual(p);
    }
  });

  it('getPayload throws NotFoundError for an unknown id', async () => {
    await expect(ds.getPayload('lead', 999999)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('listMappings returns all six index entries without fields', async () => {
    const index = await ds.listMappings();
    expect(index.map((m) => m.formKey).sort()).toEqual(MAPPING_KEYS);
    for (const e of index) {
      expect(e).not.toHaveProperty('fields');
      expect(e.pageMatch.host).toBeTruthy();
    }
  });

  it('getMapping round-trips and throws on an unknown key', async () => {
    const m = await ds.getMapping('fixture-plain');
    expect(FormMapping.parse(m)).toEqual(m);
    expect(m.fields.length).toBeGreaterThan(0);
    await expect(ds.getMapping('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('audit logs counts only and rejects a payload carrying values', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const entry = {
      formKey: 'fixture-plain',
      mappingVersion: 1,
      personType: 'lead' as const,
      personId: 1001,
      counts: { filled: 3, missing: 1 },
      at: new Date().toISOString(),
    };
    await ds.audit(entry);
    expect(spy).toHaveBeenCalledWith('[immifill audit]', entry);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Complete');
    spy.mockRestore();
  });
});

// --- CrmApiDataSource -----------------------------------------------------

type FetchArgs = [string, RequestInit];

function stubChrome(session: unknown) {
  const store: Record<string, unknown> = session === undefined ? {} : { 'immifill.session': session };
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
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() },
    },
  };
  vi.stubGlobal('chrome', chromeStub);
  return { chromeStub, store };
}

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const VALID_SESSION = {
  token: 'tok-abc',
  expiry: new Date(Date.now() + 3_600_000).toISOString(),
  user: { id: 7, email: 'agent@example.test' },
};

describe('CrmApiDataSource', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sends the bare token with no Bearer prefix', async () => {
    stubChrome(VALID_SESSION);
    const fetchFn = stubFetch(200, { rows: [] });
    await new CrmApiDataSource('https://crm.test').search('lead', 'ann');

    const [url, init] = fetchFn.mock.calls[0] as unknown as FetchArgs;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('tok-abc');
    expect(headers.authorization).not.toMatch(/^Bearer/i);
    expect(url).toContain('/lead?');
    expect(url).toContain('order_by=firstName');
    expect(url).toContain('limit=25');
  });

  it('maps rows to PersonSummary', async () => {
    stubChrome(VALID_SESSION);
    stubFetch(200, {
      rows: [{ id: 42, first_name: 'Ann', last_name: 'Lee', email: 'a@example.test', status: 'New' }],
    });
    const out = await new CrmApiDataSource('https://crm.test').search('student', '');
    expect(out).toEqual([
      {
        personRef: { type: 'student', id: 42 },
        displayName: 'Ann Lee',
        email: 'a@example.test',
        subtitle: 'New',
      },
    ]);
  });

  it('login stores the session and schedules the logout alarm', async () => {
    const { chromeStub, store } = stubChrome(undefined);
    stubFetch(200, VALID_SESSION);
    await new CrmApiDataSource('https://crm.test').login('a@example.test', 'pw');

    expect(store['immifill.session']).toEqual(VALID_SESSION);
    expect(JSON.stringify(store)).not.toContain('pw'); // password never stored
    const when = chromeStub.alarms.create.mock.calls[0]?.[1] as { when: number };
    expect(when.when).toBeLessThan(Date.parse(VALID_SESSION.expiry));
  });

  it('a 401 clears the session and throws UnauthorizedError', async () => {
    const { chromeStub, store } = stubChrome(VALID_SESSION);
    stubFetch(401, {});
    await expect(
      new CrmApiDataSource('https://crm.test').getPayload('lead', 1001),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(store['immifill.session']).toBeUndefined();
    expect(chromeStub.alarms.clear).toHaveBeenCalledWith('immifill.logout');
  });

  it('a malformed body fails the Zod parse instead of returning junk', async () => {
    stubChrome(VALID_SESSION);
    stubFetch(200, { name: { given: 'Ann' } }); // not an ApplicantPayload
    await expect(
      new CrmApiDataSource('https://crm.test').getPayload('lead', 1001),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it('refuses to call without a session', async () => {
    stubChrome(undefined);
    stubFetch(200, {});
    await expect(
      new CrmApiDataSource('https://crm.test').listMappings(),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
