import { describe, it, expect, beforeEach } from 'vitest';
import { fillPage } from '@/lib/fill-engine';
import { FormMapping, ApplicantPayload } from '@/lib/schema';
import people from '@/data/people.json';

// Regression: waitStable armed its quiet timer immediately, so a postback that
// re-renders LATER than quietMs resolved before the dependent section existed
// and every field in it reported not_found. See fixtures/postback.html.
const mapping = FormMapping.parse({
  formKey: 'wait-regression',
  version: 1,
  pageMatch: { host: 'localhost:5174', urlIncludes: '', headingText: '' },
  fields: [
    { path: 'citizenship.label', selector: '#country', type: 'select', waitAfterMs: 2500 },
    { path: 'passport.number', selector: '#passportNumber', type: 'text' },
  ],
});

const person = ApplicantPayload.parse(people[0]);

/** Re-renders the dependent section RENDER_MS after the select changes. */
function buildPage(renderMs: number): void {
  document.body.innerHTML = `
    <select id="country"><option value="">--</option><option value="Nepal">Nepal</option></select>
    <div id="dependent"></div>`;
  const dependent = document.querySelector('#dependent') as HTMLDivElement;
  document.querySelector('#country')!.addEventListener('change', () => {
    setTimeout(() => {
      dependent.appendChild(document.createElement('input')).id = 'passportNumber';
    }, renderMs);
  });
}

describe('waitAfterMs waits for the postback, not just for quiet', () => {
  beforeEach(() => void (document.body.innerHTML = ''));

  it('fills a field that only exists after a 900ms re-render', async () => {
    buildPage(900); // later than the 400ms quiet window, within waitAfterMs
    const report = await fillPage(mapping, person);
    const passport = report.results.find((r) => r.path === 'passport.number');
    expect(passport?.status).toBe('filled');
  });

  it('still gives up at waitAfterMs when the postback never arrives', async () => {
    buildPage(99_000); // never, in practice
    const report = await fillPage(mapping, person);
    const passport = report.results.find((r) => r.path === 'passport.number');
    expect(passport?.status).toBe('not_found');
  });
});
