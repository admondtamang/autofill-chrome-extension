import { useState } from 'preact/hooks';
import type { SessionUser } from '@/lib/messages';
import { Button, Card, ErrorNote, Input, Label, LogOut, Mark, Spinner } from './ui';

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
    <div class="flex min-h-dvh flex-col justify-center gap-5 p-5">
      <header class="flex flex-col items-center gap-2 text-center">
        <Mark class="size-10 rounded-xl" />
        <h1 class="m-0 text-lg font-semibold tracking-tight">ImmiFill</h1>
        <p class="m-0 text-xs text-muted-foreground">
          Fill ImmiAccount forms from a Success CRM record.
        </p>
      </header>

      <Card>
        {expired && (
          <p
            class="m-0 rounded-lg bg-muted px-3 py-2 text-xs text-foreground"
            data-testid="session-expired"
          >
            Your session expired — sign in to continue.
          </p>
        )}

        <form
          class="flex flex-col gap-3"
          data-testid="login-form"
          onSubmit={(e: Event) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const password = (form.elements.namedItem('password') as HTMLInputElement).value;
            onSubmit(email.trim(), password);
            form.reset(); // the password never lingers in the DOM or in state
          }}
        >
          <div>
            <Label for="login-email">Email</Label>
            <Input
              id="login-email"
              data-testid="login-email"
              name="email"
              type="email"
              autocomplete="username"
              placeholder="you@company.com"
              required
              value={email}
              onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <div>
            <Label for="login-password">Password</Label>
            <Input
              id="login-password"
              data-testid="login-password"
              name="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          <Button
            class="mt-1 w-full"
            data-testid="login-submit"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {busy && <Spinner />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {error !== null && <ErrorNote data-testid="login-error">{error}</ErrorNote>}
      </Card>
    </div>
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
    <div class="flex min-w-0 items-center gap-2" data-testid="session-bar">
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-xs font-medium" title={user.email} data-testid="session-user">
          {user.email}
        </span>
        {until !== null && (
          <span class="block text-[11px] text-muted-foreground" data-testid="session-expiry">
            Signs out at {until}
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        class="px-2"
        data-testid="sign-out"
        disabled={busy}
        title="Sign out"
        onClick={onSignOut}
      >
        <LogOut />
        <span class="sr-only">Sign out</span>
      </Button>
    </div>
  );
}
