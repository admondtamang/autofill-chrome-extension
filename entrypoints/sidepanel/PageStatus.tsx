import type { PanelResponses } from '@/lib/messages';
import {
  Badge,
  Button,
  CircleCheck,
  ErrorNote,
  Globe,
  Hint,
  RefreshCw,
  Spinner,
  TriangleAlert,
} from './ui';

type Props = {
  detection: PanelResponses['DETECT'];
  loading: boolean;
  error: string | null;
  enabling: boolean;
  enableNote: string | null;
  onRedetect: () => void;
  onEnableSite: () => void;
};

/**
 * Deliberately not a Card: when a page is supported this is a one-line
 * acknowledgement, not a section competing with the primary action. It only
 * grows when something needs the agent's attention.
 */
export function PageStatus({
  detection,
  loading,
  error,
  enabling,
  enableNote,
  onRedetect,
  onEnableSite,
}: Props) {
  const tone =
    loading || error !== null
      ? 'border-border bg-muted/40'
      : detection
        ? 'border-filled/30 bg-filled-bg'
        : 'border-missing/30 bg-missing-bg';

  return (
    <div class={`flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-2.5 ${tone}`}>
      <div class="flex min-w-0 items-start gap-2" data-testid="page-status" aria-live="polite">
        <span class="mt-0.5 shrink-0">
          {loading ? (
            <Spinner class="text-muted-foreground" />
          ) : error !== null ? (
            <TriangleAlert class="text-muted-foreground" />
          ) : detection ? (
            <CircleCheck class="text-filled" />
          ) : (
            <TriangleAlert class="text-missing" />
          )}
        </span>

        <span class="min-w-0 flex-1 text-xs leading-tight wrap-anywhere">
          {loading ? (
            <span class="text-muted-foreground">Checking the active tab…</span>
          ) : error !== null ? (
            <span class="text-muted-foreground">Page status unavailable.</span>
          ) : detection ? (
            <>
              <span class="block font-medium text-filled">Form recognised</span>
              <span class="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant="outline" class="max-w-full font-mono">
                  <code class="truncate">{detection.formKey}</code>
                </Badge>
                <Badge variant="muted">v{detection.mappingVersion}</Badge>
              </span>
            </>
          ) : (
            <>
              <span class="block font-medium text-missing">Unsupported page</span>
              <span class="block text-muted-foreground">
                No mapping matches this form. Nothing will be filled here.
              </span>
            </>
          )}
        </span>

        <Button
          variant="ghost"
          size="sm"
          class="-my-1 px-2"
          data-testid="redetect"
          onClick={onRedetect}
          disabled={loading}
          aria-busy={loading}
          title="Re-check the active tab"
        >
          <RefreshCw />
          <span class="sr-only">{loading ? 'Checking…' : 'Re-check'}</span>
        </Button>
      </div>

      {error !== null && <ErrorNote>{error}</ErrorNote>}

      <Button
        variant="outline"
        size="sm"
        class="w-full"
        data-testid="enable-site"
        onClick={onEnableSite}
        disabled={enabling}
        aria-busy={enabling}
      >
        {enabling ? <Spinner /> : <Globe />}
        {enabling ? 'Requesting…' : 'Enable on this site'}
      </Button>
      {enableNote !== null && <Hint data-testid="enable-note">{enableNote}</Hint>}
    </div>
  );
}
