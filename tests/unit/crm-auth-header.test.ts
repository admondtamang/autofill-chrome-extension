import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmApiDataSource } from '@/lib/data/crm-api';

/**
 * The bare `authorization` header is a live requirement (CONTRACTS §10.2): the
 * CRM rejects a `Bearer ` prefix. data.test.ts asserts it too, but bundles the
 * check behind a URL-shape assertion that a param change can fail first —
 * shadowing the security property. This test asserts only the header.
 */
describe('CRM auth header', () => {
  const session = {
    token: 'tok-abc123',
    expiry: new Date(Date.now() + 3_600_000).toISOString(),
    user: { id: 1, email: 'a@example.test' },
  };

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: { session: { get: async () => ({ 'immifill.session': session }), set: async () => {}, remove: async () => {} } },
      alarms: { create: () => {}, clear: async () => {}, onAlarm: { addListener: () => {} } },
    });
  });

  it('sends the token bare — never with a Bearer prefix', async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    await new CrmApiDataSource('https://crm.test').search('lead', 'ann');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.authorization).toBe('tok-abc123');
    expect(seen[0]?.authorization).not.toMatch(/^Bearer/i);
  });
});
