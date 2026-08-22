/* ============================================================
   MarinaAI — Authentication Hook

   Manages Supabase Auth state: session restore, sign-in,
   sign-out, and loading/error states. Exposes the authenticated
   user and session token for API calls.

   When Supabase is not configured, returns a truthful
   "not configured" state so the UI can show a setup prompt.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { getSupabase, isConfigured } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  /** Whether Supabase Auth is configured with valid env vars. */
  configured: boolean;
  /** True while checking/refreshing the session. */
  loading: boolean;
  /** The authenticated user, or null if signed out. */
  user: User | null;
  /** The current session (contains the access token). */
  session: Session | null;
  /** Error message from the last auth operation. */
  error: string | null;
  /** Sign in with email/password. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign up with email/password. */
  signUp: (email: string, password: string) => Promise<void>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
  /** Clear the current error. */
  clearError: () => void;
}

export function useAuth(): AuthState {
  const configured = isConfigured();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [configured]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!configured) {
        setError("Supabase Auth is not configured");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) return;

      setLoading(true);
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      }
      setLoading(false);
    },
    [configured],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!configured) {
        setError("Supabase Auth is not configured");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) return;

      setLoading(true);
      setError(null);
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
      }
      setLoading(false);
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    if (!supabase) return;

    setLoading(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
    setLoading(false);
  }, [configured]);

  const clearError = useCallback(() => setError(null), []);

  return {
    configured,
    loading,
    user,
    session,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
  };
}