import * as React from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UseSessionReturn } from "../hooks/useSession";

type LoginScreenProps = {
  login: UseSessionReturn["login"];
  onSuccess: () => void;
};

// Dev credentials — remove before production
const DEV_EMAIL = "ukiras@gmail.com";
const DEV_PASSWORD = "111111";

export function LoginScreen({ login, onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState(DEV_EMAIL);
  const [password, setPassword] = useState(DEV_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-login with dev credentials on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await login(DEV_EMAIL, DEV_PASSWORD);
        onSuccess();
      } catch {
        // If auto-login fails, let the user try manually
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Sign in to ImmiFill</h1>
          <p className="text-sm text-muted-foreground">
            Enter your CRM credentials
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="you@successedu.com.au"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || email.length === 0 || password.length === 0}
            aria-busy={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
