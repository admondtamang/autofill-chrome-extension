import { useCallback, useEffect, useState } from 'preact/hooks';
import type { PanelResponses } from '@/lib/messages';
import type { FillReport as Report, PersonSummary } from '@/lib/schema';
import { FillReport } from './FillReport';
import { PageStatus } from './PageStatus';
import { PersonSearch } from './PersonSearch';
import { RecordMode } from './RecordMode';
import { LoginForm, SessionBar } from './SignIn';
import { onTabChanged, onUnauthorized, send } from './messaging';
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
      setCanUndo(false);
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

  const undo = async (): Promise<void> => {
    setUndoing(true);
    const res = await send({ kind: 'UNDO' });
    setUndoing(false);
    if (!res.ok) {
      setUndoNote(res.error);
      return;
    }
    setUndoNote(`Restored ${res.data.restored} field(s).`);
    setCanUndo(false);
  };

  const blocked =
    person === null
      ? 'Select a person first.'
      : detection === null
        ? 'Unsupported page — no mapping matches this form.'
        : null;

  if (session === null) {
    return (
      <main class="app">
        <h1 class="app__title">ImmiFill</h1>
        <p class="hint">Checking your session…</p>
      </main>
    );
  }

  if (!session.signedIn) {
    return (
      <main class="app">
        <h1 class="app__title">ImmiFill</h1>
        <LoginForm
          busy={authBusy}
          error={authError}
          expired={expired}
          onSubmit={(email, password) => void signIn(email, password)}
        />
      </main>
    );
  }

  return (
    <main class="app">
      <h1 class="app__title">ImmiFill</h1>

      {session.user !== undefined && (
        <SessionBar
          user={session.user}
          expiry={session.expiry}
          busy={authBusy}
          onSignOut={() => void signOut()}
        />
      )}

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

      <section class="card">
        <div class="card__head">
          <h2 class="section">Fill</h2>
        </div>

        {missing !== null && (
          <div data-testid="preflight">
            {missing.length === 0 ? (
              <p class="hint">Pre-flight: all required values are present.</p>
            ) : (
              <>
                <p class="hint">
                  Pre-flight: {missing.length} required value(s) missing for this person.
                </p>
                <ul class="paths">
                  {missing.map((p) => (
                    <li key={p} data-testid="preflight-missing">{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {preflightError !== null && <p class="error" role="alert">{preflightError}</p>}

        <div style="margin-top:12px">
          <button
            class="primary"
            data-testid="fill-button"
            disabled={blocked !== null || filling}
            title={blocked ?? 'Fill this page'}
            onClick={() => void fill()}
          >
            {filling ? 'Filling…' : 'Fill this page'}
          </button>
        </div>
        {blocked !== null && (
          <p class="hint" data-testid="fill-blocked">{blocked}</p>
        )}

        <div class="row" style="margin-top:8px">
          <button
            class="grow"
            data-testid="undo-button"
            disabled={!canUndo || undoing}
            title={canUndo ? 'Undo the last fill' : 'Nothing to undo yet.'}
            onClick={() => void undo()}
          >
            {undoing ? 'Undoing…' : 'Undo fill'}
          </button>
        </div>
        {undoNote !== null && (
          <p class="hint" data-testid="undo-note" aria-live="polite">{undoNote}</p>
        )}
      </section>

      <FillReport report={report} busy={filling} error={fillError} />

      <RecordMode />
    </main>
  );
}
