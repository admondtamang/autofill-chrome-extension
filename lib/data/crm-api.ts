import { z } from 'zod';
import {
  ApplicantPayload,
  FillAudit,
  FormMapping,
  MappingIndexEntry,
  type EntityType,
  type PersonSummary,
} from '@/lib/schema';
import type { DataSource, SearchOpts, Session } from '@/lib/data/types';
import { NotFoundError, UnauthorizedError } from '@/lib/data/errors';

const SESSION_KEY = 'immifill.session';
const LOGOUT_ALARM = 'immifill.logout';
const LOGOUT_LEAD_MS = 60_000; // log out 60s before the token expires

/** Login response. Not in CONTRACTS §1 — `Session` there is a TS interface only. */
const SessionSchema = z.object({
  token: z.string(),
  expiry: z.string(),
  user: z.object({ id: z.number().int(), email: z.string() }),
});

/**
 * A row from an existing CRM list endpoint (`/lead`, `/student`, ...).
 * ponytail: field names assumed from the CRM list contract; no staging backend
 * exists to verify against. Drift fails loudly here rather than silently
 * producing blank names. Adjust this schema when staging is up.
 */
const CrmRow = z.object({
  id: z.number().int(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  email: z.string().nullish(),
  status: z.string().nullish(),
});
const CrmList = z.object({ rows: z.array(CrmRow) });

export class CrmApiDataSource implements DataSource {
  private alarmBound = false;

  constructor(private readonly base: string) {}

  async login(email: string, password: string): Promise<Session> {
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }), // password is never stored
    });
    if (res.status === 401) {
      await this.clearSession();
      throw new UnauthorizedError('invalid credentials');
    }
    if (!res.ok) throw new Error(`login failed: ${res.status}`);

    const session = SessionSchema.parse(await res.json());
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    this.scheduleLogout(session);
    return session;
  }

  async search(
    type: EntityType,
    q: string,
    { order = 'asc', orderBy = 'firstName', limit = 25 }: SearchOpts = {},
  ): Promise<PersonSummary[]> {
    const params = new URLSearchParams({
      q,
      order,
      order_by: orderBy,
      limit: String(limit),
    });
    const { rows } = await this.request(`/${type}?${params}`, CrmList);
    return rows.map((r) => ({
      personRef: { type, id: r.id },
      displayName: [r.first_name, r.last_name].filter(Boolean).join(' '),
      email: r.email ?? null,
      subtitle: r.status ?? null,
    }));
  }

  getPayload(type: EntityType, id: number): Promise<ApplicantPayload> {
    return this.request(`/immifill/payload/${type}/${id}`, ApplicantPayload);
  }

  listMappings(): Promise<MappingIndexEntry[]> {
    return this.request('/immifill/mappings', z.array(MappingIndexEntry));
  }

  getMapping(formKey: string): Promise<FormMapping> {
    return this.request(`/immifill/mappings/${encodeURIComponent(formKey)}`, FormMapping);
  }

  async audit(entry: FillAudit): Promise<void> {
    await this.request('/immifill/audit', z.unknown(), {
      method: 'POST',
      // parse before send: proves the body carries counts only (CONTRACTS §8.1)
      body: JSON.stringify(FillAudit.parse(entry)),
    });
  }

  async logout(): Promise<void> {
    await this.clearSession();
  }

  // --- internals ---------------------------------------------------------

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const session = await this.session();
    if (!session) throw new UnauthorizedError('no session');

    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        // The CRM expects the bare token — no 'Bearer ' prefix.
        authorization: session.token,
        'content-type': 'application/json',
      },
    });
    if (res.status === 401) {
      await this.clearSession();
      throw new UnauthorizedError();
    }
    if (res.status === 404) throw new NotFoundError(path);
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return schema.parse(await res.json());
  }

  private async session(): Promise<Session | null> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const parsed = SessionSchema.safeParse(stored[SESSION_KEY]);
    if (!parsed.success) return null;
    if (Date.parse(parsed.data.expiry) <= Date.now()) {
      await this.clearSession();
      return null;
    }
    return parsed.data;
  }

  private async clearSession(): Promise<void> {
    await chrome.storage.session.remove(SESSION_KEY);
    await chrome.alarms.clear(LOGOUT_ALARM);
  }

  private scheduleLogout(session: Session): void {
    if (!this.alarmBound) {
      chrome.alarms.onAlarm.addListener((a) => {
        if (a.name === LOGOUT_ALARM) void this.clearSession();
      });
      this.alarmBound = true;
    }
    chrome.alarms.create(LOGOUT_ALARM, {
      when: Math.max(Date.parse(session.expiry) - LOGOUT_LEAD_MS, Date.now() + 1_000),
    });
  }
}
