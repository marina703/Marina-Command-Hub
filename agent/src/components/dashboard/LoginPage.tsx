/* ============================================================
   MarinaAI — Login Page

   Supabase Auth sign-in/sign-up form using the existing MarinaAI
   visual system: near-black surfaces, cyan/magenta accents,
   compact typography, Card/Button components.

   Shows a "staging configuration required" state when Supabase
   env vars are missing, rather than silently failing.
   ============================================================ */

import { useState, type FormEvent } from "react";
import { LogIn, UserPlus, AlertCircle, Loader2, Shield } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { AuthState } from "@/hooks/useAuth";

interface LoginPageProps {
  auth: AuthState;
}

export function LoginPage({ auth }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signin") {
      await auth.signIn(email, password);
    } else {
      await auth.signUp(email, password);
    }
  };

  // Staging configuration required state
  if (!auth.configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-1 p-4">
        <Card className="w-full max-w-md">
          <CardHeader
            eyebrow="Configuration Required"
            title="Staging Not Configured"
            description="Supabase environment variables are missing. See STAGING_AUTH_SETUP_REQUIRED.md for setup instructions."
          />
          <CardBody>
            <div className="flex items-start gap-3 rounded-xl border border-status-warning/30 bg-status-warning/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
              <div className="text-sm text-text-secondary">
                <p className="mb-2 font-medium text-text-primary">
                  Missing environment variables
                </p>
                <p>
                  Set <code className="rounded bg-white/5 px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{" "}
                  <code className="rounded bg-white/5 px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> in{" "}
                  <code className="rounded bg-white/5 px-1 py-0.5 text-xs">.env.local</code> to enable authentication.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 p-4">
      <Card className="w-full max-w-md">
        {/* Brand header */}
        <div className="flex items-center gap-3 border-b border-border-muted px-6 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 font-extrabold text-accent-primary shadow-glow-primary">
            M
          </div>
          <div>
            <div className="text-sm font-extrabold uppercase tracking-widest text-text-primary">
              Marina AI
            </div>
            <small className="text-xs uppercase tracking-widest text-text-secondary">
              Command Hub
            </small>
          </div>
          <Shield className="ml-auto h-5 w-5 text-accent-primary/60" />
        </div>

        <CardHeader
          eyebrow="Secure Access"
          title={mode === "signin" ? "Sign In" : "Create Account"}
          description={
            mode === "signin"
              ? "Enter your credentials to access the Command Hub."
              : "Create a new account to get started."
          }
        />

        <CardBody className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-email"
                className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={cn(
                  "rounded-xl border border-border-muted bg-white/3 px-4 py-2.5 text-sm text-text-primary",
                  "placeholder:text-text-muted",
                  "focus:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/30",
                  "transition-colors",
                )}
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="login-password"
                className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                placeholder="••••••••"
                className={cn(
                  "rounded-xl border border-border-muted bg-white/3 px-4 py-2.5 text-sm text-text-primary",
                  "placeholder:text-text-muted",
                  "focus:border-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/30",
                  "transition-colors",
                )}
              />
            </div>

            {/* Error message */}
            {auth.error && (
              <div className="flex items-start gap-2 rounded-xl border border-status-error/30 bg-status-error/5 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error" />
                <p className="text-xs text-status-error">{auth.error}</p>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              variant="primary"
              loading={auth.loading}
              className="w-full"
            >
              {auth.loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "signin" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "signin" ? (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>

            {/* Toggle sign-in / sign-up */}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                auth.clearError();
              }}
              className="text-center text-xs text-text-secondary transition-colors hover:text-accent-primary"
            >
              {mode === "signin"
                ? "Don't have an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}