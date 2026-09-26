import { describe, expect, it } from 'vitest';
import { detectFormKey } from '@/lib/page-detect';
import type { MappingIndexEntry } from '@/lib/schema';

const entry = (
  formKey: string,
  host: string,
  urlIncludes: string,
  headingText: string,
): MappingIndexEntry => ({ formKey, version: 1, pageMatch: { host, urlIncludes, headingText } });

const HOST = 'localhost:5174';

describe('detectFormKey', () => {
  it('hard-fails on a host mismatch even when url and heading match', () => {
    const index = [entry('plain', 'example.test', '/plain.html', 'Plain Personal Details')];
    expect(
      detectFormKey(index, {
        host: HOST,
        url: 'http://localhost:5174/plain.html',
        headings: ['Plain Personal Details'],
      }),
    ).toBeNull();
  });

  it('scores url (+2) above heading (+1)', () => {
    const index = [
      entry('heading-only', HOST, '/nowhere.html', 'Plain Personal Details'),
      entry('url-only', HOST, '/plain.html', 'Nothing Like This'),
    ];
    expect(
      detectFormKey(index, {
        host: HOST,
        url: 'http://localhost:5174/plain.html',
        headings: ['Plain Personal Details'],
      }),
    ).toBe('url-only');
  });

  it('prefers the entry matching both over either alone', () => {
    const index = [
      entry('url-only', HOST, '/plain.html', 'Nothing Like This'),
      entry('both', HOST, '/plain.html', 'Plain Personal'),
    ];
    expect(
      detectFormKey(index, {
        host: HOST,
        url: 'http://localhost:5174/plain.html',
        headings: ['  PLAIN PERSONAL DETAILS  '],
      }),
    ).toBe('both');
  });

  it('breaks ties by index order', () => {
    const index = [
      entry('first', HOST, '/plain.html', 'Nope'),
      entry('second', HOST, '/plain.html', 'Also nope'),
    ];
    expect(
      detectFormKey(index, { host: HOST, url: 'http://localhost:5174/plain.html', headings: [] }),
    ).toBe('first');
  });

  it('matches on host alone only when both url and heading are empty', () => {
    const wildcard = [entry('host-only', HOST, '', '')];
    expect(detectFormKey(wildcard, { host: HOST, url: 'http://localhost:5174/x', headings: [] })).toBe(
      'host-only',
    );

    const demanding = [entry('needs-url', HOST, '/plain.html', '')];
    expect(
      detectFormKey(demanding, { host: HOST, url: 'http://localhost:5174/other.html', headings: [] }),
    ).toBeNull();
  });

  it('lets a scoring entry beat a host-only wildcard regardless of order', () => {
    const index = [entry('host-only', HOST, '', ''), entry('scored', HOST, '/plain.html', '')];
    expect(
      detectFormKey(index, { host: HOST, url: 'http://localhost:5174/plain.html', headings: [] }),
    ).toBe('scored');
  });

  it('returns null for an empty index', () => {
    expect(detectFormKey([], { host: HOST, url: 'http://localhost:5174/', headings: [] })).toBeNull();
  });
});
