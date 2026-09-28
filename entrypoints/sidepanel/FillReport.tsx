import type { JSX } from 'preact';
import type { FieldStatus, FillReport as Report } from '@/lib/schema';
import {
  Badge,
  Card,
  CardHeader,
  CircleCheck,
  CircleSlash,
  CircleX,
  Empty,
  ErrorNote,
  Loading,
  TriangleAlert,
  Zap,
} from './ui';

/* Order and wording mirror the in-page highlight classes
   (immifill-filled / -missing / -not_found / -rejected). */
const ORDER: readonly FieldStatus[] = ['filled', 'rejected', 'not_found', 'missing'];

const TITLES: Record<FieldStatus, string> = {
  filled: 'Filled',
  rejected: 'Rejected',
  not_found: 'Not found',
  missing: 'Missing',
};

/* Every status carries an icon AND a word, so the four are told apart without
   relying on hue — the palette matches the in-page highlights, it does not
   carry the meaning on its own. */
const ICONS: Record<FieldStatus, (p: { class?: string }) => JSX.Element> = {
  filled: CircleCheck,
  rejected: CircleX,
  not_found: CircleSlash,
  missing: TriangleAlert,
};

const TONES: Record<FieldStatus, string> = {
  filled: 'text-filled bg-filled-bg',
  rejected: 'text-rejected bg-rejected-bg',
  not_found: 'text-notfound bg-notfound-bg',
  missing: 'text-missing bg-missing-bg',
};

type Props = { report: Report | null; busy: boolean; error: string | null };

/** Paths and statuses only — a value never appears here (CONTRACTS §8.3). */
export function FillReport({ report, busy, error }: Props) {
  return (
    <Card>
      <CardHeader title="Fill report">
        {report !== null && (
          <Badge variant="muted">
            {report.results.length} field{report.results.length === 1 ? '' : 's'}
          </Badge>
        )}
      </CardHeader>

      <div
        class="flex min-w-0 flex-col gap-2"
        data-testid="fill-report"
        aria-live="polite"
        aria-busy={busy}
      >
        {busy ? (
          <Loading>Filling the page…</Loading>
        ) : error !== null ? (
          <ErrorNote>{error}</ErrorNote>
        ) : report === null ? (
          <Empty icon={<Zap class="size-5" />}>
            No fill yet. Values are never shown here — only field paths.
          </Empty>
        ) : (
          ORDER.map((status) => {
            const rows = report.results.filter((r) => r.status === status);
            if (rows.length === 0) return null;
            const Icon = ICONS[status];
            return (
              <div class="min-w-0" key={status}>
                <div
                  class={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${TONES[status]}`}
                  data-testid={`report-group-${status}`}
                >
                  <Icon class="size-3.5" />
                  <span>{TITLES[status]}</span>
                  <span class="ml-auto tabular-nums">{rows.length}</span>
                </div>
                <ul class="m-0 mt-1 list-none p-0">
                  {rows.map((r, i) => (
                    <li
                      class="min-w-0 px-2 py-1 font-mono text-[11px] wrap-anywhere"
                      data-testid="report-row"
                      key={`${r.path}-${i}`}
                    >
                      {r.path}
                      {r.detail !== undefined && (
                        <span class="block font-sans text-muted-foreground">{r.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
