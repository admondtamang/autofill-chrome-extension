/** Side-panel behaviour: pre-flight, undo, unsupported pages, and a UI-driven fill. */
import { BASE_URL, FIXTURES, personOf, test, expect } from './harness';
import type { FillReport } from '@/lib/schema';

const PLAIN = FIXTURES[0].url;

test('pre-flight lists the required values Sparse Applicant lacks', async ({ app }) => {
  const person = personOf(1002);
  await app.open(PLAIN);

  const pre = await app.panel.expectOk<{ formKey: string; missingRequired: string[] } | null>({
    kind: 'PREFLIGHT',
    type: person.personRef.type,
    personId: person.personRef.id,
  });
  expect(pre).not.toBeNull();
  expect(pre?.formKey).toBe('fixture-plain');
  // plain.json marks name.given, name.family, dob and citizenship.label required.
  expect(pre?.missingRequired).toEqual(['dob', 'citizenship.label']);

  // And the same list, rendered by the panel itself.
  await app.panel.selectPerson('lead', 'Sparse', 'Sparse Applicant');
  await app.panel.waitFor(`document.querySelectorAll('[data-testid="preflight-missing"]').length > 0`);
  expect(await app.panel.texts('preflight-missing')).toEqual(['dob', 'citizenship.label']);
});

test('a complete applicant has nothing missing in pre-flight', async ({ app }) => {
  const person = personOf(1001);
  await app.open(PLAIN);
  const pre = await app.panel.expectOk<{ missingRequired: string[] } | null>({
    kind: 'PREFLIGHT',
    type: person.personRef.type,
    personId: person.personRef.id,
  });
  expect(pre?.missingRequired).toEqual([]);
});

test('undo restores the values that were on the page before the fill', async ({ app }) => {
  const person = personOf(1001);
  await app.open(PLAIN);

  // Pre-existing content, so "restored" means restored — not merely cleared.
  await app.page.fill('#given', 'PRE-EXISTING');
  await app.page.fill('#residential', 'PRE-EXISTING ADDRESS');
  await app.page.selectOption('#country', { label: 'Australia' });

  await app.panel.expectOk<FillReport>({
    kind: 'FILL',
    type: person.personRef.type,
    personId: person.personRef.id,
  });
  expect(await app.page.inputValue('#given')).toBe(person.name.given);

  const undone = await app.panel.expectOk<{ restored: number }>({ kind: 'UNDO' });
  expect(undone.restored).toBeGreaterThan(0);
  expect(await app.page.inputValue('#given')).toBe('PRE-EXISTING');
  expect(await app.page.inputValue('#residential')).toBe('PRE-EXISTING ADDRESS');
  expect(await app.page.inputValue('#country')).toBe('c-0041'); // Australia, as before
  expect(await app.page.isChecked('#usingAgent')).toBe(false);
});

test('an unmapped page detects as null and the panel blocks Fill', async ({ app }) => {
  await app.open(`${BASE_URL}/index.html`); // served, in-scope host, but no mapping matches
  const detected = await app.panel.expectOk<unknown>({ kind: 'DETECT' });
  expect(detected).toBeNull();

  await app.panel.waitFor(`document.querySelector('[data-testid="fill-blocked"]')`);
  expect((await app.panel.texts('fill-blocked'))[0]).toContain('Unsupported page');
  expect(await app.panel.eval<boolean>(`document.querySelector('[data-testid="fill-button"]').disabled`)).toBe(true);

  const fill = await app.panel.msg({ kind: 'FILL', type: 'lead', personId: 1001 });
  expect(fill.ok).toBe(false);
});

test('a fill driven entirely from the panel UI reports grouped statuses', async ({ app }) => {
  test.setTimeout(60_000);
  await app.open(PLAIN);
  await app.panel.selectPerson('lead', 'Complete', 'Complete Test Applicant');
  await app.panel.waitFor(`!document.querySelector('[data-testid="fill-button"]').disabled`);
  await app.panel.click('fill-button');
  await app.panel.waitFor(`document.querySelector('[data-testid="report-group-filled"]')`);

  expect(await app.panel.count('report-row')).toBe(10);
  expect((await app.panel.texts('report-group-filled'))[0]).toContain('10');
  // CONTRACTS §8.3: paths and counts only — never applicant values.
  const reportText = await app.panel.eval<string>(
    `document.querySelector('[data-testid="fill-report"]').innerText`,
  );
  expect(reportText).not.toContain('Complete');
  expect(reportText).not.toContain('complete.applicant@example.test');

  await app.panel.click('undo-button');
  await app.panel.waitFor(`document.querySelector('[data-testid="undo-note"]')`);
  expect((await app.panel.texts('undo-note'))[0]).toContain('Restored');
  expect(await app.page.inputValue('#given')).toBe('');
});
