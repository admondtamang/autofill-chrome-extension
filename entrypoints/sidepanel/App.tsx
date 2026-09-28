import { useCallback, useEffect, useState } from 'preact/hooks';
import type { PanelResponses } from '@/lib/messages';
import type { FieldResult, FillReport as Report, PersonSummary } from '@/lib/schema';
import type { PaletteValue, PasteTarget } from '@/lib/messages';
import { FillReport } from './FillReport';
import { PageStatus } from './PageStatus';
import { PersonSearch } from './PersonSearch';
import { RecordMode } from './RecordMode';
import { ValueList } from './ValueList';
import { LoginForm, SessionBar } from './SignIn';
import { onDropped, onTabChanged, onTargetChanged, onUnauthorized, send } from './messaging';
import {
  Button,
  Card,
  CardHeader,
  CircleCheck,
  ErrorNote,
  Hint,
  Loading,
  Mark,
  RotateCcw,
  Spinner,
  TriangleAlert,
  Zap,
} from './ui';
import './style.css';

export function App() {
  const [person, setPerson] = useState<PersonSummary | null>(null);

  // null while the session is still being resolved. In static builds the worker
  // answers `{ signedIn: true }`, so Phase 1 never sees a login wall (§10.1).
  const [session, setSession] = useState<PanelResponses['SESSION'] | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const [detection, setDetection] = useState<PanelResponses['DETECT']>(null);
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [enabling, setEnabling] = useState(false);
  const [enableNote, setEnableNote] = useState<string | null>(null);

  const [missing, setMissing] = useState<string[] | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const [report, setReport] = useState<Report | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  const [values, setValues] = useState<PaletteValue[]>([]);
  const [target, setTarget] = useState<PasteTarget | null>(null);
  const [pasting, setPasting] = useState<string | null>(null);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  // Manual drops land in the fill report like any other field — paths only (§8.3).
  const [drops, setDrops] = useState<FieldResult[]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoNote, setUndoNote] = useState<string | null>(null);

  useEffect(() => {
    void send({ kind: 'SESSION' }).then((res) =>
      setSession(res.ok ? res.data : { signedIn: false }),
    );
    // Any route answering `unauthorized` drops us back to the login form.
    return onUnauthorized(() => {
      setSession({ signedIn: false });
      setExpired(true);
    });
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    setAuthBusy(true);
    const res = await send({ kind: 'LOGIN', email, password });
    setAuthBusy(false);
    // Runs after the onUnauthorized subscriber, so this wins: a rejected
    // credential is a failed sign-in, not an expired session.
    setExpired(false);
    if (!res.ok) {
      setAuthError(
        res.error === 'unauthorized' ? 'Email or password not recognised.' : res.error,
      );
      return;
    }
    setAuthError(null);
    setSession({ signedIn: true, user: res.data.user, expiry: res.data.expiry });
  };

  const signOut = async (): Promise<void> => {
    setAuthBusy(true);
    await send({ kind: 'LOGOUT' });
    setAuthBusy(false);
    setAuthError(null);
    setExpired(false);
    setSession({ signedIn: false });
  };

  const detect = useCallback(async (): Promise<void> => {
    setDetecting(true);
    const res = await send({ kind: 'DETECT' });
    setDetecting(false);
    if (res.ok) {
      setDetectError(null);
      setDetection(res.data);
    } else {
      setDetectError(res.error);
      setDetection(null);
    }
  }, []);

  // Detect on open, and again whenever the tab changes or navigates.
  useEffect(() => {
    void detect();
    return onTabChanged(() => {
      setReport(null);
      setDrops([]);
      setCanUndo(false);
      setTarget(null); // a new page has no selected field yet (§11.4)
      void detect();
    });
  }, [detect]);


  // Pre-flight: which required values does this person lack on this form?
  useEffect(() => {
    if (person === null || detection === null) {
      setMissing(null);
      setPreflightError(null);
      return;
    }
    let live = true;
    // Clear first: holding the previous person's verdict while this one is in
    // flight would attribute "all required values are present" to someone who
    // is actually missing them.
    setMissing(null);
    setPreflightError(null);
    void send({
      kind: 'PREFLIGHT',
      type: person.personRef.type,
      personId: person.personRef.id,
    }).then((res) => {
      if (!live) return;
      if (res.ok) {
        setPreflightError(null);
        setMissing(res.data === null ? null : res.data.missingRequired);
      } else {
        setPreflightError(res.error);
        setMissing(null);
      }
    });
    return () => {
      live = false;
    };
  }, [person, detection]);

  const enableSite = async (): Promise<void> => {
    setEnabling(true);
    const res = await send({ kind: 'ENABLE_SITE' });
    setEnabling(false);
    if (!res.ok) {
      setEnableNote(res.error);
      return;
    }
    setEnableNote(
      res.data.granted
        ? `Access granted for ${res.data.origin}.`
        : `Access declined for ${res.data.origin}.`,
    );
    if (res.data.granted) void detect();
  };

  const fill = async (): Promise<void> => {
    if (person === null) return;
    setFilling(true);
    setUndoNote(null);
    const res = await send({
      kind: 'FILL',
      type: person.personRef.type,
      personId: person.personRef.id,
    });
    setFilling(false);
    if (res.ok) {
      setFillError(null);
      setReport(res.data);
      setCanUndo(true);
    } else {
      setFillError(res.error);
      setReport(null);
    }
  };

  // The person's values, listed in the panel. Rebuilt on every person change,
  // which also resets every reveal (§11.2).
  useEffect(() => {
    if (person === null) {
      setValues([]);
      return;
    }
    let live = true;
    setPaletteError(null);
    void send({
      kind: 'VALUES',
      type: person.personRef.type,
      personId: person.personRef.id,
    }).then((res) => {
      if (!live) return;
      if (res.ok) setValues(res.data);
      else {
        setValues([]);
        setPaletteError(res.error);
      }
    });
    return () => {
      live = false;
    };
  }, [person]);

  // Which field on the page a paste would land in (§11.4).
  useEffect(() => {
    const refresh = (): void => {
      void send({ kind: 'TARGET' }).then((res) => setTarget(res.ok ? res.data : null));
    };
    refresh();
    return onTargetChanged(setTarget);
  }, [detection]);

  // A dragged value reports exactly like a clicked one (§11.3).
  useEffect(
    () =>
      onDropped((result) => {
        setDrops((prev) => [...prev, result]);
        if (result.status === 'filled') setCanUndo(true);
      }),
    [],
  );

  const paste = async (v: PaletteValue): Promise<void> => {
    if (target === null) {
      setPaletteError('Click the field on the page you want this in, then click the value.');
      return;
    }
    setPasting(v.path);
    const res = await send({ kind: 'PASTE', path: v.path });
    setPasting(null);
    if (!res.ok) {
      setPaletteError(res.error);
      return;
    }
    setPaletteError(null);
    // A paste lands in the fill report like any other field — path only (§8.3).
    setDrops((prev) => [...prev, res.data]);
    if (res.data.status === 'filled') setCanUndo(true);
  };

  const undo = async (): Promise<void> => {
    setUndoing(true);
    const res = await send({ kind: 'UNDO' });
    setUndoing(false);
    if (!res.ok) {
      setUndoNote(res.error);
      return;
    }
    setUndoNote(`Restored ${res.data.restored} field(s).`);
    setDrops([]);
    setCanUndo(false);
  };

  // Drops are appended to whatever the last fill reported, so one list shows both.
  const withDrops: Report | null =
    report === null && drops.length === 0
      ? null
      : {
          formKey: report?.formKey ?? detection?.formKey ?? '',
          mappingVersion: report?.mappingVersion ?? detection?.mappingVersion ?? 0,
          results: [...(report?.results ?? []), ...drops],
          snapshot: report?.snapshot ?? [],
        };

  const blocked =
    person === null
      ? 'Select a person first.'
      : detection === null
        ? 'Unsupported page — no mapping matches this form.'
        : null;

  if (session === null) {
    return (
      <div class="flex min-h-dvh flex-col items-center justify-center gap-3 p-5">
        <Mark class="size-10 rounded-xl" />
        <Loading>Checking your session…</Loading>
      </div>
    );
  }

  if (!session.signedIn) {
    return (
      <LoginForm
        busy={authBusy}
        error={authError}
        expired={expired}
        onSubmit={(email, password) => void signIn(email, password)}
      />
    );
  }

  return (
    <div class="flex min-h-dvh flex-col">
      {/* One compact identity bar. Everything below it is work. */}
      <header class="sticky top-0 z-20 flex min-w-0 items-center gap-2 border-b bg-background px-3 py-2">
        <Mark />
        <h1 class="m-0 text-sm font-semibold tracking-tight">ImmiFill</h1>
        {session.user !== undefined && (
          <div class="ml-auto flex min-w-0 max-w-[62%] justify-end">
            <SessionBar
              user={session.user}
              expiry={session.expiry}
              busy={authBusy}
              onSignOut={() => void signOut()}
            />
          </div>
        )}
      </header>

      {/* Primary actions, pinned to the top: filling is why the panel is open,
          so it stays reachable no matter how far the lists below scroll. */}
      <div class="sticky top-[45px] z-10 flex min-w-0 gap-2 border-b bg-background px-3 py-2">
        <Button
          class="h-9 min-w-0 flex-1 text-sm"
          data-testid="fill-button"
          disabled={blocked !== null || filling}
          aria-busy={filling}
          title={blocked ?? 'Fill this page'}
          onClick={() => void fill()}
        >
          {filling ? <Spinner /> : <Zap />}
          {filling ? 'Filling…' : 'Fill this page'}
        </Button>
        <Button
          variant="outline"
          class="h-9 shrink-0"
          data-testid="undo-button"
          disabled={!canUndo || undoing}
          aria-busy={undoing}
          title={canUndo ? 'Undo the last fill' : 'Nothing to undo yet.'}
          onClick={() => void undo()}
        >
          {undoing ? <Spinner /> : <RotateCcw />}
          Undo
        </Button>
      </div>

      {(blocked !== null || undoNote !== null) && (
        <div class="border-b bg-background px-3 pb-2">
          {blocked !== null && (
            <Hint class="m-0 text-center" data-testid="fill-blocked">
              {blocked}
            </Hint>
          )}
          {undoNote !== null && (
            <Hint class="m-0 text-center" data-testid="undo-note" aria-live="polite">
              {undoNote}
            </Hint>
          )}
        </div>
      )}

      <main class="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <PageStatus
          detection={detection}
          loading={detecting}
          error={detectError}
          enabling={enabling}
          enableNote={enableNote}
          onRedetect={() => void detect()}
          onEnableSite={() => void enableSite()}
        />

        <PersonSearch selected={person} onSelect={setPerson} />

        {missing !== null && (
          <div class="min-w-0" data-testid="preflight">
            {missing.length === 0 ? (
              <p class="m-0 flex items-center gap-2 rounded-lg bg-filled-bg px-3 py-2 text-xs font-medium text-filled">
                <CircleCheck class="size-3.5" />
                Pre-flight passed — all required values are present.
              </p>
            ) : (
              <>
                <p class="m-0 flex items-center gap-2 rounded-lg bg-missing-bg px-3 py-2 text-xs font-medium text-missing">
                  <TriangleAlert class="size-3.5" />
                  {missing.length} required value(s) missing for this person.
                </p>
                <ul class="m-0 mt-1 max-h-28 list-none overflow-x-hidden overflow-y-auto p-0">
                  {missing.map((p) => (
                    <li
                      key={p}
                      class="min-w-0 px-2 py-0.5 font-mono text-[11px] wrap-anywhere text-muted-foreground"
                      data-testid="preflight-missing"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {preflightError !== null && <ErrorNote>{preflightError}</ErrorNote>}

        <Card>
          <CardHeader title="Values" />
          <ValueList
            values={values}
            target={target}
            busy={pasting}
            onPaste={(v) => void paste(v)}
          />
          {paletteError !== null && <ErrorNote>{paletteError}</ErrorNote>}
        </Card>

        <FillReport report={withDrops} busy={filling} error={fillError} />

        {/* Record mode builds form mappings — admins only (roleId === 1). */}
        {session?.user?.roleId === 1 && <RecordMode />}
      </main>
    </div>
  );
}
