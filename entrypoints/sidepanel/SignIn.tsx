import { useState } from 'preact/hooks';
import type { SessionUser } from '@/lib/messages';

type LoginProps = {
  busy: boolean;
  error: string | null;
  expired: boolean;
  onSubmit: (email: string, password: string) => void;
};

/** Sign-in wall. The password is read from the form and handed straight to the
    worker — never stored in state that outlives the submit, never echoed back. */
export function LoginForm({ busy, error, expired, onSubmit }: LoginProps) {
  const [email, setEmail] = useState('');

  return (
    <section class="card">
      <div class="card__head">
        <h2 class="section">Sign in</h2>
      </div>

      {expired && (
        <p class="hint" data-testid="session-expired">
          Your session expired — sign in to continue.
        </p>
      )}

      <form
        data-testid="login-form"
        onSubmit={(e: Event) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          const password = (form.elements.namedItem('password') as HTMLInputElement).value;
          onSubmit(email.trim(), password);
          form.reset(); // the password never lingers in the DOM or in state
        }}
      >
        <label class="field" for="login-email">
          Email
        </label>
        <input
          id="login-email"
          data-testid="login-email"
          name="email"
          type="email"
          autocomplete="username"
          required
          value={email}
          onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
        />

        <label class="field" for="login-password" style="margin-top:12px">
          Password
        </label>
        <input
          id="login-password"
          data-testid="login-password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />

        <div style="margin-top:12px">
          <button class="primary" data-testid="login-submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>

      {error !== null && (
        <p class="error" role="alert" data-testid="login-error">
          {error}
        </p>
      )}
    </section>
  );
}

type BarProps = {
  user: SessionUser;
  expiry: string | undefined;
  busy: boolean;
  onSignOut: () => void;
};

const at = (iso: string): string | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? null
    : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export function SessionBar({ user, expiry, busy, onSignOut }: BarProps) {
  const until = expiry === undefined ? null : at(expiry);
  return (
    <div class="row" data-testid="session-bar">
      <span class="grow">
        <span data-testid="session-user">{user.email}</span>
        {until !== null && (
          <span class="hint" style="margin:0;display:block" data-testid="session-expiry">
            Signs out at {until}
          </span>
        )}
      </span>
      <button class="small" data-testid="sign-out" disabled={busy} onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
