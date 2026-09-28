import { useEffect, useState } from 'preact/hooks';
import type { FieldMapping, FormMapping } from '@/lib/schema';
import { onFieldCaptured, send } from './messaging';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Hint,
  Radio,
  Select,
  Spinner,
  TriangleAlert,
} from './ui';

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
    <Card class="border-dashed">
      <CardHeader title="Record mode">
        <Button
          variant={on ? 'destructive' : 'outline'}
          size="sm"
          data-testid="record-toggle"
          aria-pressed={on}
          disabled={busy}
          aria-busy={busy}
          onClick={() => void toggle()}
        >
          {busy ? <Spinner /> : <Radio />}
          {busy ? 'Working…' : on ? 'Stop recording' : 'Start recording'}
        </Button>
      </CardHeader>

      {error !== null && <ErrorNote>{error}</ErrorNote>}

      <p
        class={`m-0 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-xs wrap-anywhere ${
          on ? 'bg-rejected-bg text-rejected' : 'bg-muted text-muted-foreground'
        }`}
        data-testid="record-status"
        aria-live="polite"
      >
        {on && <span aria-hidden="true" class="size-2 shrink-0 animate-pulse rounded-full bg-current" />}
        {on
          ? `Recording — click a field on the page. ${captured.length} captured.`
          : 'Off. Turn on, then click each field on the page to capture its selector.'}
      </p>

      {captured.map((f, i) => (
        <div
          class="flex min-w-0 flex-col gap-2 rounded-lg border p-2"
          data-testid="capture-row"
          key={`${f.selector}-${i}`}
        >
          <code class="block min-w-0 text-[11px] wrap-anywhere text-muted-foreground">
            {f.selector}
          </code>
          <div class="flex min-w-0 items-center gap-2">
            <Select
              class="h-8 flex-1 text-xs"
              data-testid="capture-path"
              aria-label={`Payload path for ${f.selector}`}
              value={f.path}
              onChange={(e) => setPath(i, (e.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">— pick a payload path —</option>
              {paths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Badge variant="muted">{f.type}</Badge>
          </div>
        </div>
      ))}

      {captured.length > 0 && (
        <>
          {unmapped > 0 && (
            <p class="m-0 flex items-center gap-2 text-xs text-missing">
              <TriangleAlert class="size-3.5" />
              {unmapped} captured field(s) still have no payload path.
            </p>
          )}
          <div class="flex min-w-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              data-testid="record-copy"
              onClick={() => void copy()}
            >
              Copy JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              data-testid="record-download"
              onClick={() => void download()}
            >
              Download
            </Button>
          </div>
          {note !== null && <Hint data-testid="record-note">{note}</Hint>}
        </>
      )}
    </Card>
  );
}
