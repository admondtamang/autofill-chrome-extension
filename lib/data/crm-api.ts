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
import type { PaletteValue } from '@/lib/messages';
import { NotFoundError, UnauthorizedError } from '@/lib/data/errors';
import { extraValues, toApplicantPayload } from '@/lib/data/crm-map';

const SESSION_KEY = 'immifill.session';
const LOGOUT_ALARM = 'immifill.logout';
const LOGOUT_LEAD_MS = 60_000; // log out 60s before the token expires

/** Login response. Not in CONTRACTS §1 — `Session` there is a TS interface only. */
const SessionUser = z.object({
  id: z.number().int(),
  email: z.string(),
  // Drives the admin-only Record mode (roleId === 1). Nullish, so a response
  // without it still signs in — the panel then fails closed and hides Record.
  roleId: z.number().int().nullish().transform((v) => v ?? undefined),
});

const SessionSchema = z.object({
  token: z.string(),
  expiry: z.string(),
  user: SessionUser,
});

/** Express APIs commonly nest the payload under `data`. Look through it. */
function unwrap(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) return null;
  const o = body as Record<string, unknown>;
  const inner = o.data;
  if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
    return { ...(inner as Record<string, unknown>), ...o };
  }
  return o;
}

/** Key names only — never values. Used to diagnose a shape mismatch safely. */
function keysOf(body: unknown): string {
  const o = unwrap(body);
  return o ? Object.keys(o).join(', ') || '(no keys)' : `(${typeof body})`;
}

const TOKEN_KEYS = ['token', 'accessToken', 'access_token', 'jwt', 'idToken', 'id_token'];

function pickToken(body: unknown): string | null {
  const o = unwrap(body);
  if (!o) return null;
  for (const k of TOKEN_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

/** A JWT's own `exp` beats any guess; otherwise fall back to 8 hours. */
function jwtExpiry(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json: unknown = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = (json as { exp?: unknown }).exp;
    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null; // not a JWT, or not base64 — fall through to the default
  }
}

const EXPIRY_KEYS = ['expiry', 'expiresAt', 'expires_at', 'expires'];
const DEFAULT_SESSION_MS = 8 * 60 * 60 * 1000;

function pickExpiry(body: unknown, token: string): string {
  const o = unwrap(body);
  for (const k of EXPIRY_KEYS) {
    const v = o?.[k];
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
    if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
  }
  return jwtExpiry(token) ?? new Date(Date.now() + DEFAULT_SESSION_MS).toISOString();
}

/**
 * A row from a CRM list endpoint (`/lead`, `/student`, ...).
 * Verified against the live CRM 2026-09-27: camelCase, flat, `{count, rows}`.
 * Drift fails loudly here rather than silently producing blank names.
 */
const CrmRow = z.object({
  id: z.number().int(),
  firstName: z.string().nullish(),
  middleName: z.string().nullish(),
  lastName: z.string().nullish(),
  email: z.string().nullish(),
  status: z.string().nullish(),
});
const CrmList = z.object({ count: z.number().int().optional(), rows: z.array(CrmRow) });

/**
 * Bundled mappings — the §10.3 fallback. Same glob (and same eager parse) as
 * StaticDataSource, so a drifted file fails the bundle, not a live fill.
 */
const bundled: FormMapping[] = Object.values(
  import.meta.glob('@/data/mappings/*.json', { eager: true, import: 'default' }),
).map((m) => FormMapping.parse(m));

export class CrmApiDataSource implements DataSource {
  private alarmBound = false;
  /** In-memory only (§10.3): path -> last validated body + its ETag. */
  private readonly mappingCache = new Map<string, { etag: string; value: unknown }>();
  /**
   * The last record fetched, so getPayload + extraValues cost one round trip.
   * This holds real applicant PII, so it lives under the same custody rule as
   * the worker's payload (§8.2): dropped after 60s and on logout, never stored.
   */
  private lastRecord: { key: string; body: unknown } | null = null;
  private recordTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly base: string) {}

  async login(email: string, password: string): Promise<Session> {
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }), // password is never stored
    });
    if (res.status === 401 || res.status === 403) {
      await this.clearSession();
      throw new UnauthorizedError('Email or password not recognised.');
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // 422 is the CRM's validation shape; its message names a field, never a value.
      const message = (body as { message?: unknown } | null)?.message;
      throw new Error(typeof message === 'string' ? message : `login failed: ${res.status}`);
    }

    const token = pickToken(body);
    if (!token) {
      // Names the keys the CRM actually returned — never their values — so a
      // shape mismatch is diagnosable from one real sign-in instead of a guess.
      throw new Error(`login succeeded but no token field was found in: ${keysOf(body)}`);
    }

    const session: Session = {
      token,
      expiry: pickExpiry(body, token),
      user: (await this.identify(body, token)) ?? { id: 0, email },
    };
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    this.scheduleLogout(session);
    return session;
  }

  /** The user may arrive with the token, or from /user/me. Never fatal. */
  private async identify(body: unknown, token: string): Promise<Session['user'] | null> {
    const inline = SessionUser.safeParse(unwrap(body)?.user);
    if (inline.success) return inline.data;
    try {
      const res = await fetch(`${this.base}/user/me`, { headers: { authorization: token } });
      if (!res.ok) return null;
      const me = SessionUser.safeParse(unwrap(await res.json()));
      return me.success ? me.data : null;
    } catch {
      return null; // identity is cosmetic; a working token is what matters
    }
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
      displayName: [r.firstName, r.lastName].filter(Boolean).join(' ') || `#${r.id}`,
      email: r.email ?? null,
      subtitle: r.status ?? null,
    }));
  }

  /**
   * Reads the ordinary CRM record and shapes it (lib/data/crm-map.ts). The
   * backend PRD's `/immifill/payload` route does not exist; when it ships,
   * prefer it and drop the mapper. A record missing most fields is normal —
   * those become `missing` in the fill report, not a failed fetch.
   */
  async getPayload(type: EntityType, id: number): Promise<ApplicantPayload> {
    return toApplicantPayload(type, id, await this.record(type, id));
  }

  /** §11.6 — everything the payload mapping had no home for. */
  async extraValues(type: EntityType, id: number): Promise<PaletteValue[]> {
    return extraValues(await this.record(type, id));
  }

  /** One fetch serves both the payload and the extra values. */
  private async record(type: EntityType, id: number): Promise<unknown> {
    const key = `${type}/${id}`;
    if (this.lastRecord?.key === key) return this.lastRecord.body;
    const body = await this.request(`/${key}`, z.unknown());
    this.lastRecord = { key, body };
    clearTimeout(this.recordTimer);
    this.recordTimer = setTimeout(() => this.forgetRecord(), 60_000);
    return body;
  }

  private forgetRecord(): void {
    clearTimeout(this.recordTimer);
    this.recordTimer = undefined;
    this.lastRecord = null;
  }

  listMappings(): Promise<MappingIndexEntry[]> {
    return this.mappings('/immifill/mappings', z.array(MappingIndexEntry), () =>
      bundled.map((m) => MappingIndexEntry.parse(m)),
    );
  }

  getMapping(formKey: string): Promise<FormMapping> {
    return this.mappings(
      `/immifill/mappings/${encodeURIComponent(formKey)}`,
      FormMapping,
      () => {
        const m = bundled.find((x) => x.formKey === formKey);
        if (!m) throw new NotFoundError(`no mapping for ${formKey}`);
        return FormMapping.parse(m);
      },
    );
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
    const res = await this.send(path, init);
    await this.check(path, res);
    // 204 (audit) has no body to parse.
    if (res.status === 204) return schema.parse(undefined);
    return schema.parse(await res.json());
  }

  /**
   * Mapping fetch with the §10.3 ETag cache and bundled fallback. Anything
   * short of 401/404 — network error, 5xx, or a remote mapping that fails
   * Zod — falls back to the bundled copy; a 401 is never masked by it.
   */
  private async mappings<T>(path: string, schema: z.ZodType<T>, fallback: () => T): Promise<T> {
    const hit = this.mappingCache.get(path);
    try {
      const res = await this.send(path, hit ? { headers: { 'if-none-match': hit.etag } } : {});
      // Already validated when it was cached: serve it without re-parsing.
      if (res.status === 304 && hit) return hit.value as T;
      await this.check(path, res);
      const value = schema.parse(await res.json());
      const etag = res.headers.get('etag');
      if (etag) this.mappingCache.set(path, { etag, value });
      else this.mappingCache.delete(path);
      return value;
    } catch (err) {
      if (err instanceof UnauthorizedError || err instanceof NotFoundError) throw err;
      return fallback();
    }
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const session = await this.session();
    if (!session) throw new UnauthorizedError('no session');

    return fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        // The CRM expects the bare token — no 'Bearer ' prefix.
        authorization: session.token,
        'content-type': 'application/json',
      },
    });
  }

  private async check(path: string, res: Response): Promise<void> {
    if (res.status === 401) {
      await this.clearSession();
      throw new UnauthorizedError();
    }
    if (res.status === 404) throw new NotFoundError(path);
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
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
    this.forgetRecord(); // no applicant data outlives the session
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
