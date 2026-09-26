import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import peopleJson from '@/data/people.json';
import immiMapping from '@/data/mappings/immi-saved.json';
import plainMapping from '@/data/mappings/plain.json';
import postbackMapping from '@/data/mappings/postback.json';
import reactMapping from '@/data/mappings/react.json';
import repeatMapping from '@/data/mappings/repeat.json';
import trapsMapping from '@/data/mappings/traps.json';
import { fillPage } from '@/lib/fill-engine';
import { applyToken } from '@/lib/fill-engine/dom';
import { formatValue, getPath } from '@/lib/fill-engine/format';
import { ApplicantPayload, FormMapping, type FieldMapping, type FieldStatus } from '@/lib/schema';

const ROOT = resolve(__dirname, '../..');
const complete = ApplicantPayload.parse(peopleJson[0]);

/**
 * innerHTML never executes scripts, so inline ones are re-created (jsdom runs
 * those). `src` scripts are dropped: no network in unit tests.
 */
function loadFixture(file: string, runScripts = true): void {
  const html = readFileSync(resolve(ROOT, 'fixtures', file), 'utf8');
  document.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
  for (const old of Array.from(document.querySelectorAll('script'))) {
    if (!runScripts || old.getAttribute('src')) {
      old.remove();
      continue;
    }
    const fresh = document.createElement('script');
    fresh.textContent = old.textContent;
    old.replaceWith(fresh);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The value the engine would write, used to fill the '{value}' token. */
function valueFor(field: FieldMapping): string {
  if (field.repeatGroup) {
    const key = field.path.slice(field.path.indexOf('[].') + 3);
    return formatValue(getPath(complete.addressHistory[0], key), field) ?? '';
  }
  return formatValue(getPath(complete, field.path), field) ?? '';
}

const labelPresent = (text: string): boolean =>
  Array.from(document.querySelectorAll('label')).some((l) =>
    (l.textContent ?? '').trim().toLowerCase().includes(text.trim().toLowerCase()),
  );

/** CONTRACTS §9.2: the selector resolves to exactly one element, or the label does. */
function expectResolvable(field: FieldMapping, root: ParentNode = document): void {
  const matches = root.querySelectorAll(applyToken(field.selector, valueFor(field)));
  if (matches.length === 1) return;
  expect(
    field.fallbackLabel && labelPresent(field.fallbackLabel),
    `${field.path}: selector "${field.selector}" matched ${matches.length} elements and no fallbackLabel resolved`,
  ).toBe(true);
}

describe('mappings resolve against their real fixtures (CONTRACTS §9.2)', () => {
  it('plain.json → plain.html', () => {
    loadFixture('plain.html');
    for (const f of FormMapping.parse(plainMapping).fields) expectResolvable(f);
  });

  it('immi-saved.json → immi-saved/index.html', () => {
    loadFixture('immi-saved/index.html');
    for (const f of FormMapping.parse(immiMapping).fields) expectResolvable(f);
  });

  it('traps.json → traps.html (occupation passes via fallbackLabel)', () => {
    loadFixture('traps.html');
    const fields = FormMapping.parse(trapsMapping).fields;
    for (const f of fields) expectResolvable(f);

    const occupation = fields.find((f) => f.path === 'employment.occupation');
    expect(document.querySelectorAll(occupation?.selector ?? '')).toHaveLength(0);
    expect(labelPresent('Occupation')).toBe(true);
  });

  it('repeat.json → repeat.html, once a row exists', () => {
    loadFixture('repeat.html');
    document.querySelector<HTMLButtonElement>('#add-address')?.click();
    const row = document.querySelector('.address-row');
    expect(row).not.toBeNull();
    for (const f of FormMapping.parse(repeatMapping).fields) expectResolvable(f, row ?? document);
  });

  it('postback.json → postback.html, after the dependent section renders', async () => {
    loadFixture('postback.html');
    const select = document.querySelector<HTMLSelectElement>('#passportCountry');
    expect(select).not.toBeNull();
    if (select) {
      select.value = 'NPL';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await sleep(1700); // the fixture re-renders after a random 500-1500 ms
    for (const f of FormMapping.parse(postbackMapping).fields) expectResolvable(f);
  }, 10_000);

  // react.html renders its whole form from a CDN <script src>, which unit tests
  // never load, so the React-rendered subtree is empty under jsdom and its three
  // selectors are unverifiable here. Playwright covers them against a live page.
  it.skip('react.json → react.html (React-rendered subtree, covered by E2E)', () => {});

  it('react.html still exposes the mount point the mapping depends on', () => {
    loadFixture('react.html', false); // its inline script needs the CDN React that never loads
    expect(document.querySelector('#root')).not.toBeNull();
    expect(FormMapping.parse(reactMapping).fields).toHaveLength(3);
  });
});

const statuses = (results: { path: string; status: FieldStatus }[]) =>
  Object.fromEntries(results.map((r) => [r.path, r.status]));

describe('traps.html end to end (CONTRACTS §9.3)', () => {
  beforeEach(() => {
    loadFixture('traps.html');
  });

  it('produces exactly the four contracted statuses', async () => {
    const report = await fillPage(FormMapping.parse(trapsMapping), complete);

    expect(statuses(report.results)).toEqual({
      'contact.phone': 'rejected', // reformatted on blur
      'citizenship.label': 'rejected', // no matching option
      'employment.occupation': 'filled', // via fallbackLabel
      'address.residential': 'rejected', // readonly
    });

    const byPath = Object.fromEntries(report.results.map((r) => [r.path, r.detail]));
    expect(byPath['contact.phone']).toBe('value reformatted by page');
    expect(byPath['citizenship.label']).toBe('no matching option');
    expect(byPath['address.residential']).toBe('field not writable');
    for (const detail of Object.values(byPath)) {
      expect(detail ?? '').not.toContain('Nepal');
      expect(detail ?? '').not.toContain('61400000001');
    }
  });

  it('never ticks the declaration, submits, or clicks next/pay', async () => {
    const next = vi.fn();
    const pay = vi.fn();
    const submit = vi.fn();
    document.querySelector('#next')?.addEventListener('click', next);
    document.querySelector('#pay')?.addEventListener('click', pay);
    document.querySelector('#traps-form')?.addEventListener('submit', submit);

    await fillPage(FormMapping.parse(trapsMapping), complete);

    expect(document.querySelector<HTMLInputElement>('#declaration')?.checked).toBe(false);
    expect(next).not.toHaveBeenCalled();
    expect(pay).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#disabledRef')?.value).toBe('');
  });
});
