import type { FieldStatus, FillReport as Report } from '@/lib/schema';

/* Order and wording mirror the in-page highlight classes
   (immifill-filled / -missing / -not_found / -rejected). */
const ORDER: readonly FieldStatus[] = ['filled', 'rejected', 'not_found', 'missing'];

const TITLES: Record<FieldStatus, string> = {
  filled: 'Filled',
  rejected: 'Rejected',
  not_found: 'Not found',
  missing: 'Missing',
};

type Props = { report: Report | null; busy: boolean; error: string | null };

export function FillReport({ report, busy, error }: Props) {
  return (
    <section class="card">
      <div class="card__head">
        <h2 class="section">Fill report</h2>
        {report !== null && (
          <span class="hint" style="margin:0">
            {report.results.length} field{report.results.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div data-testid="fill-report" aria-live="polite" aria-busy={busy}>
        {busy ? (
          <p class="hint">Filling the page…</p>
        ) : error !== null ? (
          <p class="error" role="alert">{error}</p>
        ) : report === null ? (
          <p class="hint">No fill yet. Values are never shown here — only field paths.</p>
        ) : (
          ORDER.map((status) => {
            const rows = report.results.filter((r) => r.status === status);
            if (rows.length === 0) return null;
            return (
              <div class={`group group--${status}`} key={status}>
                <div class="group__head" data-testid={`report-group-${status}`}>
                  <span>{TITLES[status]}</span>
                  <span class="group__count">{rows.length}</span>
                </div>
                <ul class="report__rows">
                  {rows.map((r, i) => (
                    <li class="report__row" data-testid="report-row" key={`${r.path}-${i}`}>
                      {r.path}
                      {r.detail !== undefined && (
                        <span class="report__detail">{r.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
