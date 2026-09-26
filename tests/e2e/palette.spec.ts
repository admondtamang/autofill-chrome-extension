/**
 * The value palette — CONTRACTS §11, in a real browser.
 *
 * `tests/unit/palette.test.ts` proves the shapes in jsdom (masking, the opaque
 * token, the closed shadow root). Only a real browser proves the three things
 * that actually matter in production: a drag really writes through the engine,
 * a drop onto a declaration is really refused, and undo really reverts it.
 *
 * Driving it: the palette lives in a CLOSED shadow root (§11.4), so no selector
 * can reach a row — deliberately. Real mouse input still lands on it, so rows
 * are addressed geometrically from the exported layout constants. That is also
 * a standing check that the palette renders where it claims to.
 */
import { HEAD_H, ITEM_H, PALETTE_ID } from '@/lib/palette';
import { FIXTURES, TRAPS, personOf, test, expect } from './harness';
import type { Page } from '@playwright/test';

const IMMI = FIXTURES.find((f) => f.label === 'immi-saved')!;
// Family name, not passport: `#...pnlPassportDetails` is display:none until the
// country postback fires, so the passport input is not a drop target at load.
const FAMILY = '#ctl00_ContentPlaceHolder1_txtFamilyName';
const COMPLETE = personOf(1001);

/** Row order is `flattenPayload`'s (background.ts PALETTE_FIELDS), empties dropped. */
const ROW = { given: 0, family: 2 } as const;

/**
 * Centre of row `i`, in VIEWPORT coordinates — what page.mouse expects.
 * Deliberately not `boundingBox()`: that is document-relative, and the palette
 * is position:fixed, so on a scrolled page the two differ by scrollY and the
 * drag silently grabs the wrong row.
 */
async function rowPoint(page: Page, i: number): Promise<{ x: number; y: number }> {
  const rect = await page.evaluate((id) => {
    const host = document.getElementById(id);
    if (!host) return null;
    const r = host.getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, PALETTE_ID);
  if (!rect) throw new Error('palette is not visible');
  return {
    // Left of centre: clear of the "Show" button on the right.
    x: rect.x + 70,
    y: rect.y + HEAD_H + i * ITEM_H + ITEM_H / 2,
  };
}

/** A real HTML5 drag: press on a palette row, move onto the target, release. */
async function dragRowOnto(page: Page, row: number, targetSelector: string): Promise<void> {
  const from = await rowPoint(page, row);
  const target = await page.locator(targetSelector).boundingBox();
  if (!target) throw new Error(`${targetSelector} is not visible`);
  const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Chromium needs a move to start the drag, then one over the target.
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** Opens the palette for the Complete applicant on the current page. */
async function openPalette(app: { page: Page; panel: { expectOk(m: object): Promise<unknown> } }) {
  await app.panel.expectOk({
    kind: 'PALETTE',
    on: true,
    type: COMPLETE.personRef.type,
    personId: COMPLETE.personRef.id,
  });
  await app.page.waitForSelector(`#${PALETTE_ID}`);
}

test.describe('value palette (§11)', () => {
  test('a drag onto a form field fills it through the engine', async ({ app }) => {
    await app.open(IMMI.url);
    await openPalette(app);

    await dragRowOnto(app.page, ROW.family, FAMILY);

    await expect(app.page.locator(FAMILY)).toHaveValue(COMPLETE.name.family);
    // Verified and highlighted like any other filled field — not a raw write.
    await expect(app.page.locator(FAMILY)).toHaveClass(/immifill-filled/);
  });

  test('a drop onto a declaration or Next is refused, and nothing moves', async ({ app }) => {
    await app.open(TRAPS.url);
    await openPalette(app);

    let navigations = 0;
    app.page.on('framenavigated', () => {
      navigations += 1;
    });

    for (const target of ['#declaration', '#next', '#pay']) {
      await dragRowOnto(app.page, ROW.given, target);
    }

    // The legal guarantee holds for manual placement too (§11.3).
    await expect(app.page.locator('#declaration')).not.toBeChecked();
    expect(navigations).toBe(0);
  });

  test('undo reverts a manual drop', async ({ app }) => {
    await app.open(IMMI.url);
    await app.page.fill(FAMILY, 'PRIOR-VALUE');
    await openPalette(app);

    await dragRowOnto(app.page, ROW.family, FAMILY);
    await expect(app.page.locator(FAMILY)).toHaveValue(COMPLETE.name.family);

    await app.panel.expectOk({ kind: 'UNDO' });
    await expect(app.page.locator(FAMILY)).toHaveValue('PRIOR-VALUE');
  });

  test('closing the palette removes it from the page', async ({ app }) => {
    await app.open(IMMI.url);
    await openPalette(app);

    await app.panel.expectOk({ kind: 'PALETTE', on: false });
    await expect(app.page.locator(`#${PALETTE_ID}`)).toHaveCount(0);
  });
});
