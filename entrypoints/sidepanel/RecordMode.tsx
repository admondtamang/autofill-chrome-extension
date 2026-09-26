import { useEffect, useState } from 'preact/hooks';
import type { FieldMapping, FormMapping } from '@/lib/schema';
import { onFieldCaptured, send } from './messaging';

export function RecordMode() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [captured, setCaptured] = useState<FieldMapping[]>([]);

  useEffect(() => {
    void send({ kind: 'PAYLOAD_PATHS' }).then((res) => {
      if (res.ok) setPaths(res.data);
    });
  }, []);

  useEffect(() => {
    if (!on) return;
    return onFieldCaptured((field) => setCaptured((prev) => [...prev, field]));
  }, [on]);

  const toggle = async (): Promise<void> => {
    const next = !on;
    setBusy(true);
    setNote(null);
    const res = await send({ kind: 'RECORD_MODE', on: next });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setOn(res.data.on);
    if (res.data.on) setCaptured([]);
  };

  const setPath = (i: number, path: string): void =>
    setCaptured((prev) => prev.map((f, j) => (j === i ? { ...f, path } : f)));

  /** RECORD_GET supplies formKey/pageMatch; the paths chosen here win. */
  const buildMapping = async (): Promise<FormMapping | null> => {
    const res = await send({ kind: 'RECORD_GET' });
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError(null);
    return { ...res.data, fields: captured };
  };

  const copy = async (): Promise<void> => {
    const m = await buildMapping();
    if (!m) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(m, null, 2));
      setNote('Mapping JSON copied to the clipboard.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const download = async (): Promise<void> => {
    const m = await buildMapping();
    if (!m) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.formKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote(`Saved ${m.formKey}.json — move it to data/mappings/ and rebuild.`);
  };

  const unmapped = captured.filter((f) => f.path === '').length;

  return (
    <section class="card">
      <div class="card__head">
        <h2 class="section">Record mode</h2>
        <button
          class="small"
          data-testid="record-toggle"
          aria-pressed={on}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy ? 'Working…' : on ? 'Stop recording' : 'Start recording'}
        </button>
      </div>

      {error !== null && <p class="error" role="alert">{error}</p>}

      <p class="hint" data-testid="record-status" aria-live="polite">
        {on
          ? `Recording — click a field on the page. ${captured.length} captured.`
          : 'Off. Turn on, then click each field on the page to capture its selector.'}
      </p>

      {captured.map((f, i) => (
        <div class="capture" data-testid="capture-row" key={`${f.selector}-${i}`}>
          <code class="capture__selector">{f.selector}</code>
          <div class="row">
            <select
              class="grow"
              data-testid="capture-path"
              aria-label={`Payload path for ${f.selector}`}
              value={f.path}
              onChange={(e) => setPath(i, (e.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">— pick a payload path —</option>
              {paths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <span class="capture__type">{f.type}</span>
          </div>
        </div>
      ))}

      {captured.length > 0 && (
        <>
          {unmapped > 0 && (
            <p class="hint">{unmapped} captured field(s) still have no payload path.</p>
          )}
          <div class="row" style="margin-top:12px">
            <button class="grow" data-testid="record-copy" onClick={() => void copy()}>
              Copy JSON
            </button>
            <button class="grow" data-testid="record-download" onClick={() => void download()}>
              Download
            </button>
          </div>
          {note !== null && <p class="hint" data-testid="record-note">{note}</p>}
        </>
      )}
    </section>
  );
}
