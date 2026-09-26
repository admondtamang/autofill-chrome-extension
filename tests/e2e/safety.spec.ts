/**
 * traps.html — the legal guarantee. CONTRACTS §8 and §9.3.
 * jsdom cannot prove "no navigation happened"; a real browser can.
 */
import { TRAPS, expectedResults, mappings, personOf, readField, test, expect } from './harness';
import type { FillReport } from '@/lib/schema';

test('traps.html — exact §9.3 statuses, nothing dangerous touched', async ({ app }) => {
  test.setTimeout(60_000);
  const person = personOf(1001); // every value present, so nothing is `missing`
  await app.open(TRAPS.url);

  // Instrument the hazards *before* the fill: any click on Next / Pay /
  // Declaration, any submit, and any dialog is recorded.
  const dialogs: string[] = [];
  app.page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  let navigations = 0;
  const onNav = (): void => {
    navigations += 1;
  };
  app.page.on('framenavigated', onNav);

  await app.page.evaluate(() => {
    const hit: string[] = [];
    (window as unknown as { __trapHits: string[] }).__trapHits = hit;
    for (const id of ['next', 'pay', 'declaration']) {
      document.getElementById(id)?.addEventListener('click', () => hit.push(id), true);
    }
    document.getElementById('traps-form')?.addEventListener('submit', () => hit.push('submit'), true);
  });

  const report = await app.panel.expectOk<FillReport>({
    kind: 'FILL',
    type: person.personRef.type,
    personId: person.personRef.id,
  });
  app.page.off('framenavigated', onNav);

  // ── CONTRACTS §9.3, verbatim ────────────────────────────────────────
  const status = Object.fromEntries(report.results.map((r) => [r.path, r.status]));
  expect(status).toEqual({
    'contact.phone': 'rejected', //      page reformats on blur → verify() catches it
    'citizenship.label': 'rejected', //  <select> has no matching option
    'employment.occupation': 'filled', // resolved via fallbackLabel
    'address.residential': 'rejected', // input is readonly
  });

  // The one field that must succeed really did land, by label alone.
  const occupation = expectedResults(mappings.get(TRAPS.formKey)!, person).find(
    (e) => e.path === 'employment.occupation',
  )!;
  expect((await readField(app.page, occupation)).value).toBe(person.employment.occupation);

  // The readonly field must still be empty — `rejected` means "did not stick".
  expect(await app.page.inputValue('#lockedAddress')).toBe('');
  // The disabled field is not even mapped; it must be untouched.
  expect(await app.page.inputValue('#disabledRef')).toBe('');

  // ── The non-negotiables ─────────────────────────────────────────────
  expect(await app.page.isChecked('#declaration'), 'declaration must stay unticked').toBe(false);
  expect(
    await app.page.evaluate(() => (window as unknown as { __trapHits: string[] }).__trapHits),
    'Next / Pay / Declaration / submit must never fire',
  ).toEqual([]);
  expect(navigations, 'the page must not navigate').toBe(0);
  expect(dialogs, 'the form must never submit (its handler alerts)').toEqual([]);
});

test('traps.html — rejected fields are highlighted red, not green', async ({ app }) => {
  const person = personOf(1001);
  await app.open(TRAPS.url);
  await app.panel.expectOk<FillReport>({
    kind: 'FILL',
    type: person.personRef.type,
    personId: person.personRef.id,
  });
  for (const selector of ['#contactPhone', '#citizenshipLimited', '#lockedAddress']) {
    const cls = await app.page.getAttribute(selector, 'class');
    expect(cls, `${selector} highlight`).toContain('immifill-rejected');
  }
});
