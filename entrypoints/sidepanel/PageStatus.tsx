import type { PanelResponses } from '@/lib/messages';

type Props = {
  detection: PanelResponses['DETECT'];
  loading: boolean;
  error: string | null;
  enabling: boolean;
  enableNote: string | null;
  onRedetect: () => void;
  onEnableSite: () => void;
};

export function PageStatus({
  detection,
  loading,
  error,
  enabling,
  enableNote,
  onRedetect,
  onEnableSite,
}: Props) {
  return (
    <section class="card">
      <div class="card__head">
        <h2 class="section">This page</h2>
        <button class="small" data-testid="redetect" onClick={onRedetect} disabled={loading}>
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <div class="status" data-testid="page-status" aria-live="polite">
        <span
          class={`dot${loading || error !== null ? '' : detection ? ' ok' : ' bad'}`}
          aria-hidden="true"
        />
        <span class="status__text">
          {loading ? (
            'Checking the active tab…'
          ) : error !== null ? (
            <span class="muted">Page status unavailable.</span>
          ) : detection ? (
            <>
              Detected: <code>{detection.formKey}</code> v{detection.mappingVersion}
            </>
          ) : (
            <strong>Unsupported page</strong>
          )}
        </span>
      </div>

      {error !== null && <p class="error" role="alert">{error}</p>}

      {!loading && error === null && detection === null && (
        <p class="hint">
          No mapping matches this form. Nothing will be filled here.
        </p>
      )}

      <div class="row" style="margin-top:12px">
        <button data-testid="enable-site" class="grow" onClick={onEnableSite} disabled={enabling}>
          {enabling ? 'Requesting…' : 'Enable on this site'}
        </button>
      </div>
      {enableNote !== null && <p class="hint" data-testid="enable-note">{enableNote}</p>}
    </section>
  );
}
