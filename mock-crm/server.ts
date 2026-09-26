/**
 * Contract-faithful mock of the CRM routes in docs/CONTRACTS.md §10.4.
 *
 * Dependency-free (`node:http` only) and data-free: it re-serves
 * `data/people.json` and `data/mappings/*.json` verbatim, so a Phase 2 run
 * produces the same outcomes as Phase 1 against `StaticDataSource`.
 *
 * Run: `pnpm mock-crm`  (http://localhost:5176)
 * Knobs, for tests:
 *   MOCK_CRM_PORT, MOCK_CRM_EXPIRY_MS, MOCK_CRM_FAIL=mappings
 *   POST /__fail/mappings?on=1|0   toggle 500s on the mapping routes
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_EMAIL = 'agent@example.test';
export const DEV_PASSWORD = 'dev-password';

const DEFAULT_EXPIRY_MS = Number(process.env.MOCK_CRM_EXPIRY_MS ?? 3_600_000);
const ENTITY_TYPES = new Set([
  'lead', 'student', 'education', 'visa', 'skill-assessment', 'tribunal', 'insurance',
]);
const FIELD_STATUS = new Set(['filled', 'missing', 'not_found', 'rejected']);

type Json = Record<string, unknown>;

interface Person extends Json {
  personRef: { type: string; id: number };
  name: { given: string; middle: string | null; family: string };
  contact: { email: string | null };
  currentVisa: { type: string | null };
  citizenship: { label: string | null };
}

interface Mapping extends Json {
  formKey: string;
  version: number;
  pageMatch: Json;
}

// import.meta.url is a file: URL under node, a bare path under Vitest's SSR.
const here = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : import.meta.url;
const dataDir = join(dirname(here), '..', 'data');
const read = (rel: string): unknown => JSON.parse(readFileSync(join(dataDir, rel), 'utf8'));

const people = read('people.json') as Person[];
const mappings = readdirSync(join(dataDir, 'mappings'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => read(`mappings/${f}`) as Mapping);
const mappingIndex = mappings.map(({ formKey, version, pageMatch }) => ({
  formKey,
  version,
  pageMatch,
}));

/** token -> expiry epoch ms. In-memory: restarting the mock logs everyone out. */
const tokens = new Map<string, number>();
const failing = new Set((process.env.MOCK_CRM_FAIL ?? '').split(',').filter(Boolean));

// --- helpers --------------------------------------------------------------

const etagOf = (body: string): string =>
  `"${createHash('sha1').update(body).digest('hex')}"`; // strong ETag

function send(res: ServerResponse, status: number, body?: unknown, headers: Json = {}): void {
  if (body === undefined) {
    res.writeHead(status, headers as Record<string, string>).end();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    ...(headers as Record<string, string>),
  }).end(text);
}

/** ETag-aware JSON response: `if-none-match` hit → 304 with an empty body. */
function sendCacheable(req: IncomingMessage, res: ServerResponse, body: unknown): void {
  const text = JSON.stringify(body);
  const etag = etagOf(text);
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag }).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json', etag }).end(text);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The bare token — no `Bearer` prefix — is the whole auth contract (§10.4). */
function authorized(req: IncomingMessage): boolean {
  const token = req.headers.authorization;
  if (!token) return false;
  const expiry = tokens.get(token);
  return expiry !== undefined && expiry > Date.now();
}

function toRow(p: Person): Json {
  const given = p.name.middle ? `${p.name.given} ${p.name.middle}` : p.name.given;
  return {
    id: p.personRef.id,
    // The CRM's `first_name` carries all given names; keeping the middle name
    // here is what makes displayName identical to StaticDataSource's.
    first_name: given,
    last_name: p.name.family,
    email: p.contact.email,
    status: p.currentVisa.type ?? p.citizenship.label,
  };
}

const ORDER_KEYS: Record<string, (p: Person) => string> = {
  firstName: (p) => p.name.given,
  lastName: (p) => p.name.family,
  email: (p) => p.contact.email ?? '',
};

/**
 * The audit body must carry counts only (CONTRACTS §8.1 / §10.4). Anything
 * payload-shaped is a privacy regression and must fail loudly here.
 */
function auditProblem(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return 'body is not an object';
  const entry = body as Json;
  const allowed = ['formKey', 'mappingVersion', 'personType', 'personId', 'counts', 'at'];
  const extra = Object.keys(entry).filter((k) => !allowed.includes(k));
  if (extra.length) return `unexpected keys: ${extra.join(',')}`;
  if (typeof entry.formKey !== 'string') return 'formKey';
  if (typeof entry.mappingVersion !== 'number') return 'mappingVersion';
  if (typeof entry.personType !== 'string' || !ENTITY_TYPES.has(entry.personType)) {
    return 'personType';
  }
  if (typeof entry.personId !== 'number') return 'personId';
  if (typeof entry.at !== 'string') return 'at';
  const counts = entry.counts;
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return 'counts';
  for (const [k, v] of Object.entries(counts as Json)) {
    if (!FIELD_STATUS.has(k)) return `counts.${k} is not a FieldStatus`;
    if (typeof v !== 'number' || !Number.isInteger(v)) return `counts.${k} is not a count`;
  }
  return null;
}

// --- routes ---------------------------------------------------------------

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const method = req.method ?? 'GET';

  // Test hook, deliberately unauthenticated: it exists to prove the bundled
  // fallback in §10.3 works, and never ships anywhere near staging.
  if (method === 'POST' && path.startsWith('/__fail/')) {
    const what = path.slice('/__fail/'.length);
    const on = url.searchParams.get('on');
    if (on === '0') failing.delete(what);
    else failing.add(what);
    send(res, 200, { failing: [...failing] });
    return;
  }

  if (method === 'POST' && path === '/auth/login') {
    const body = (await readBody(req)) as { email?: string; password?: string } | undefined;
    if (body?.email !== DEV_EMAIL || body?.password !== DEV_PASSWORD) {
      send(res, 401, { error: 'invalid credentials' });
      return;
    }
    const ms = Number(url.searchParams.get('expiry_ms') ?? DEFAULT_EXPIRY_MS);
    const token = `mock-${createHash('sha1').update(String(Math.random())).digest('hex')}`;
    const expiry = Date.now() + ms;
    tokens.set(token, expiry);
    send(res, 200, {
      token,
      expiry: new Date(expiry).toISOString(),
      user: { id: 7, email: DEV_EMAIL },
    });
    return;
  }

  if (!authorized(req)) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }

  if (method === 'POST' && path === '/immifill/audit') {
    const problem = auditProblem(await readBody(req));
    if (problem) {
      console.error('[mock-crm] rejected audit:', problem);
      send(res, 400, { error: `audit must carry counts only: ${problem}` });
      return;
    }
    send(res, 204);
    return;
  }

  if (method === 'GET' && path.startsWith('/immifill/payload/')) {
    const [, , , type, rawId] = path.split('/');
    const id = Number(rawId);
    const person = people.find((p) => p.personRef.type === type && p.personRef.id === id);
    if (!person) {
      send(res, 404, { error: 'not found' });
      return;
    }
    send(res, 200, person);
    return;
  }

  if (method === 'GET' && path.startsWith('/immifill/mappings')) {
    if (failing.has('mappings')) {
      send(res, 500, { error: 'mappings unavailable' });
      return;
    }
    const formKey = path.slice('/immifill/mappings'.length).replace(/^\//, '');
    if (!formKey) {
      sendCacheable(req, res, mappingIndex);
      return;
    }
    const mapping = mappings.find((m) => m.formKey === formKey);
    if (!mapping) {
      send(res, 404, { error: 'not found' });
      return;
    }
    sendCacheable(req, res, mapping);
    return;
  }

  const type = path.slice(1);
  if (method === 'GET' && ENTITY_TYPES.has(type)) {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const key = ORDER_KEYS[url.searchParams.get('order_by') ?? 'firstName'] ?? ORDER_KEYS.firstName;
    const dir = url.searchParams.get('order') === 'desc' ? -1 : 1;
    const limit = Number(url.searchParams.get('limit') ?? 25);
    const rows = people
      .filter((p) => p.personRef.type === type)
      .filter(
        (p) =>
          !q ||
          `${p.name.given} ${p.name.family} ${p.contact.email ?? ''}`.toLowerCase().includes(q),
      )
      .sort((a, b) => key(a).localeCompare(key(b)) * dir)
      .slice(0, limit)
      .map(toRow);
    send(res, 200, { rows });
    return;
  }

  send(res, 404, { error: 'no such route' });
}

export function createMockCrm(): Server {
  return createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      console.error('[mock-crm]', err);
      send(res, 500, { error: 'mock failure' });
    });
  });
}

/** Started directly (not imported by a test) → listen. */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.MOCK_CRM_PORT ?? 5176);
  createMockCrm().listen(port, () => {
    console.log(`mock-crm on http://localhost:${port} (login ${DEV_EMAIL} / ${DEV_PASSWORD})`);
  });
}
