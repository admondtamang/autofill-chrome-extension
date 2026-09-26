/**
 * The PRD's E2E matrix: 5 synthetic people × fixtures 1–5, driven through the
 * genuine side panel → service worker → content script chain.
 */
import {
  FIXTURES,
  displayName,
  expectedResults,
  assertFilledValue,
  mappings,
  people,
  personOf,
  readField,
  test,
  expect,
} from './harness';
import type { FillReport } from '@/lib/schema';

const mappingFor = (formKey: string) => {
  const m = mappings.get(formKey);
  if (!m) throw new Error(`no mapping ${formKey}`);
  return m;
};

test.describe('fill matrix — 5 people × 5 fixtures', () => {
  for (const fx of FIXTURES) {
    for (const person of people) {
      test(`${fx.label} × ${displayName(person)}`, async ({ app }) => {
        test.setTimeout(90_000);
        await app.open(fx.url);

        const detected = await app.panel.expectOk<{ formKey: string; mappingVersion: number } | null>({
          kind: 'DETECT',
        });
        expect(detected, 'page must be detected').not.toBeNull();
        expect(detected?.formKey).toBe(fx.formKey);

        const report = await app.panel.expectOk<FillReport>({
          kind: 'FILL',
          type: person.personRef.type,
          personId: person.personRef.id,
        });

        const wanted = expectedResults(mappingFor(fx.formKey), person);
        expect(report.formKey).toBe(fx.formKey);
        // Every mapped field ends as exactly one of the four statuses, in
        // mapping order, with repeat groups expanded per CONTRACTS §9.1.
        expect(report.results.map((r) => `${r.path}=${r.status}`)).toEqual(
          wanted.map((w) => `${w.path}=${w.status}`),
        );

        for (const e of wanted) {
          if (e.status !== 'filled') continue;
          const dom = await readField(app.page, e);
          assertFilledValue(e, dom);
          expect(dom.classes, `${e.path}: highlight class`).toContain('immifill-filled');
        }
      });
    }
  }
});

test.describe('fixture-specific guarantees', () => {
  test('react.html — the value reaches React state, not just the DOM', async ({ app }) => {
    const person = personOf(1004); // Zoé Núñez-श्रेष्ठ: accents + Devanagari
    await app.open(FIXTURES[2].url);
    await app.panel.expectOk<FillReport>({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });

    // The inputs are React-controlled and the tree re-renders every 300 ms, so
    // a DOM-only write is reverted. #state is the component's own state dump —
    // the only proof the write went through React's value setter.
    await app.page.waitForTimeout(700); // outlive at least two re-render ticks
    const state = JSON.parse(await app.page.locator('#state').innerText()) as Record<string, string>;
    expect(state).toEqual({
      given: person.name.given,
      family: person.name.family,
      citizenship: person.citizenship.code,
    });
  });

  test('postback.html — fields that appear only after the 500–1500 ms re-render', async ({ app }) => {
    const person = personOf(1001);
    await app.open(FIXTURES[1].url);
    const report = await app.panel.expectOk<FillReport>({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });

    // REGRESSION GUARD. waitStable() used to arm its quiet timer up front and
    // resolved at ~400 ms — before the dependent section was re-rendered — so
    // these three fields reported `not_found`. They must be `filled`, and the
    // values must be in the *recreated* nodes.
    const late = ['passport.number', 'passport.issued', 'passport.expires'];
    for (const path of late) {
      expect(report.results.find((r) => r.path === path)?.status, `${path} after postback`).toBe(
        'filled',
      );
    }
    expect(await app.page.inputValue('#passportNumber')).toBe(person.passport.number);
    expect(await app.page.inputValue('#passportIssued')).toBe('10 Jan 2022');
    expect(await app.page.inputValue('#passportExpires')).toBe('09 Jan 2032');
  });

  test('repeat.html — one row per addressHistory item, each row its own item', async ({ app }) => {
    const person = personOf(1001); // two addresses
    await app.open(FIXTURES[3].url);
    expect(await app.page.locator('.address-row').count(), 'starts with zero rows').toBe(0);

    await app.panel.expectOk<FillReport>({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });

    expect(await app.page.locator('.address-row').count()).toBe(person.addressHistory.length);
    for (const [i, item] of person.addressHistory.entries()) {
      const row = app.page.locator('.address-row').nth(i);
      expect(await row.locator('[name$=".street"]').inputValue()).toBe(item.street);
      expect(await row.locator('[name$=".city"]').inputValue()).toBe(item.city);
      expect(await row.locator('[name$=".country"]').inputValue()).toBe(item.country);
      expect(await row.locator('[name$=".from"]').inputValue()).toBe(item.from);
    }
  });

  test('repeat.html — no addresses means no rows and no add-button click', async ({ app }) => {
    const person = personOf(1002); // Sparse Applicant: addressHistory = []
    await app.open(FIXTURES[3].url);
    const report = await app.panel.expectOk<FillReport>({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });
    expect(report.results.every((r) => r.status === 'missing')).toBe(true);
    expect(await app.page.locator('.address-row').count()).toBe(0);
  });
});
