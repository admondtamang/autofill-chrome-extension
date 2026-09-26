// Named .ts, not .tsx: vitest.config.ts only includes tests/unit/**/*.test.ts.
import { h, render } from 'preact';
import { describe, expect, it } from 'vitest';
import { FillReport } from '@/entrypoints/sidepanel/FillReport';
import type { FillReport as Report } from '@/lib/schema';

const report: Report = {
  formKey: 'plain',
  mappingVersion: 1,
  results: [
    { path: 'name.given', status: 'filled' },
    { path: 'name.family', status: 'filled' },
    { path: 'contact.phone', status: 'rejected', detail: 'page reformatted the value' },
    { path: 'passport.number', status: 'missing' },
  ],
  snapshot: [{ selector: '#given', kind: 'value', value: 'Complete' }],
};

describe('FillReport', () => {
  const host = document.createElement('div');
  render(h(FillReport, { report, busy: false, error: null }), host);

  it('groups by status with counts', () => {
    const head = (s: string) => host.querySelector(`[data-testid="report-group-${s}"]`)?.textContent;
    expect(head('filled')).toBe('Filled2');
    expect(head('rejected')).toBe('Rejected1');
    expect(head('missing')).toBe('Missing1');
    expect(head('not_found')).toBeUndefined();
    expect(host.querySelectorAll('[data-testid="report-row"]')).toHaveLength(4);
  });

  it('renders paths only — never a snapshot value (CONTRACTS §8)', () => {
    expect(host.textContent).toContain('contact.phone');
    expect(host.textContent).not.toContain('Complete');
  });
});
