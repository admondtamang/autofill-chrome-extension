/**
 * `pnpm demo` — the watchable run. Headed, paced, and narrated.
 *
 * It produces `demo-artifacts/`: numbered before/after screenshots of every
 * fixture with the immifill-* highlights visible, side-panel screenshots, a
 * video of the fixture tab, and a summary table on stdout.
 *
 * Only in this file do assertions take a back seat to legibility — the pass /
 * fail verdict it prints is the same one `pnpm e2e` proves in detail.
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, launchApp, FIXTURES, TRAPS, ROOT, mappings, people, personOf, displayName, expectedResults, countBy } from './harness';
import type { App } from './harness';
import type { FieldStatus, FillReport } from '@/lib/schema';

const OUT = join(ROOT, 'demo-artifacts');
const VIDEO = join(OUT, 'video');
const STATUSES: readonly FieldStatus[] = ['filled', 'missing', 'not_found', 'rejected'];

let step = 0;
const shot = async (app: App, name: string): Promise<void> => {
  step += 1;
  const n = String(step).padStart(2, '0');
  await app.page.screenshot({ path: join(OUT, `${n}-${name}.png`), fullPage: true });
};
const panelShot = async (app: App, name: string): Promise<void> => {
  step += 1;
  await app.panel.screenshot(join(OUT, `${String(step).padStart(2, '0')}-${name}.png`));
};

type Row = { fixture: string; person: string; counts: Record<FieldStatus, number>; ok: boolean };

test('ImmiFill Phase 1 — watchable demo', async () => {
  test.setTimeout(20 * 60_000);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(VIDEO, { recursive: true });

  // Paced so a human can follow along; the video records the fixture tab.
  const app = await launchApp({ slowMo: 120, videoDir: VIDEO });
  const rows: Row[] = [];
  const complete = personOf(1001);
  const sparse = personOf(1002);

  try {
    /* ── 1. The panel, with a person chosen ─────────────────────────── */
    await app.open(FIXTURES[0].url);
    await app.panel.selectPerson('lead', '', displayName(complete));
    await panelShot(app, 'panel-person-search');

    /* ── 2. Pre-flight on the person who is missing required values ─── */
    await app.panel.selectPerson('lead', 'Sparse', displayName(sparse));
    await app.panel.waitFor(`document.querySelector('[data-testid="preflight"]')`);
    await panelShot(app, 'panel-preflight-missing');

    /* ── 3. Every fixture: before, fill, after ──────────────────────── */
    for (const fx of [...FIXTURES, TRAPS]) {
      await app.open(fx.url);
      await shot(app, `${fx.label}-before`);
      await app.panel.selectPerson(
        complete.personRef.type,
        'Complete',
        displayName(complete),
      );
      await app.panel.waitFor(`!document.querySelector('[data-testid="fill-button"]').disabled`);
      await app.panel.click('fill-button');
      await app.panel.waitFor(`document.querySelector('[data-testid="report-row"]')`);
      await app.page.waitForTimeout(400);
      await shot(app, `${fx.label}-after-fill`);
      if (fx.label === 'plain') await panelShot(app, 'panel-fill-report');
      if (fx.label === 'traps') {
        await panelShot(app, 'panel-traps-report');
        expect(await app.page.isChecked('#declaration')).toBe(false);
      }
    }

    /* ── 4. Record mode ─────────────────────────────────────────────── */
    await app.open(FIXTURES[0].url);
    await app.panel.click('record-toggle');
    await app.panel.waitFor(`document.querySelector('[data-testid="record-status"]').innerText.includes('Recording')`);
    await app.page.click('#given');
    await app.page.click('#email');
    await app.panel.waitFor(`document.querySelectorAll('[data-testid="capture-row"]').length === 2`);
    await app.panel.eval(`(() => {
      const sels = document.querySelectorAll('[data-testid="capture-path"]');
      const set = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(sels[0], 'name.given');
      set(sels[1], 'contact.email');
    })()`);
    await panelShot(app, 'panel-record-mode');
    await app.panel.click('record-toggle');

    /* ── 5. The full matrix, quietly, for the summary table ─────────── */
    for (const fx of [...FIXTURES, TRAPS]) {
      const mapping = mappings.get(fx.formKey);
      if (!mapping) throw new Error(`no mapping ${fx.formKey}`);
      for (const person of people) {
        await app.open(fx.url);
        const report = await app.panel.expectOk<FillReport>({
          kind: 'FILL',
          type: person.personRef.type,
          personId: person.personRef.id,
        });
        const want = expectedResults(mapping, person);
        const ok =
          report.results.length === want.length &&
          report.results.every((r, i) => r.path === want[i]?.path && r.status === want[i]?.status);
        rows.push({
          fixture: fx.label,
          person: `${person.name.given} ${person.name.family}`.slice(0, 26),
          counts: countBy(report),
          ok,
        });
      }
    }
  } finally {
    await app.close();
  }

  /* ── Move the video next to the screenshots ───────────────────────── */
  const clip = readdirSync(VIDEO).find((f) => f.endsWith('.webm'));
  if (clip) renameSync(join(VIDEO, clip), join(OUT, '00-run.webm'));
  rmSync(VIDEO, { recursive: true, force: true });

  /* ── Summary ──────────────────────────────────────────────────────── */
  const pad = (s: string, n: number) => s.padEnd(n);
  const head = `${pad('fixture', 12)}${pad('person', 28)}${STATUSES.map((s) => s.padStart(10)).join('')}${'  result'}`;
  const lines = [
    '',
    'ImmiFill Phase 1 — fill matrix (5 synthetic people × 6 fixtures)',
    head,
    '-'.repeat(head.length),
    ...rows.map(
      (r) =>
        `${pad(r.fixture, 12)}${pad(r.person, 28)}` +
        STATUSES.map((s) => String(r.counts[s]).padStart(10)).join('') +
        (r.ok ? '      ok' : '    FAIL'),
    ),
    '-'.repeat(head.length),
  ];
  const failed = rows.filter((r) => !r.ok);
  lines.push(
    `${rows.length} fills, ${rows.length - failed.length} matched the expected statuses exactly.`,
    failed.length === 0
      ? 'RESULT: PASS — every mapped field ended filled / missing / not_found / rejected as expected.'
      : `RESULT: FAIL — ${failed.length} fill(s) diverged: ${failed.map((f) => `${f.fixture}×${f.person}`).join(', ')}`,
    `Artifacts: ${OUT}`,
    '',
  );
  console.log(lines.join('\n'));
  expect(failed, 'fills that diverged from the expected statuses').toEqual([]);
});
