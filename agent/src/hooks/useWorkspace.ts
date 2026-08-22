/* ============================================================
   MarinaAI — Workspace Hook

   Manages workspace selection and membership. After auth,
   fetches the list of workspaces the current user belongs to
   and exposes the active workspace ID for API calls.

   Workspace data is fetched from the server API which verifies
   membership server-side via RLS.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface WorkspaceState {
  /** List of workspaces the authenticated user belongs to. */
  workspaces: Workspace[];
  /** Currently selected workspace. */
  activeWorkspace: Workspace | null;
  /** Loading state. */
  loading: boolean;
  /** Error message. */
  error: string | null;
  /** Select a workspace by ID. */
  selectWorkspace: (id: string) => void;
  /** Refresh workspace list from server. */
  refresh: () => Promise<void>;
}

export function useWorkspace(session: Session | null): WorkspaceState {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspaces", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setWorkspaces([]);
          setActiveWorkspace(null);
          setError("Session expired. Please sign in again.");
          return;
        }
        throw new Error(`Failed to load workspaces (${res.status})`);
      }

      const data = await res.json();
      const ws: Workspace[] = data.workspaces ?? [];
      setWorkspaces(ws);

      // Auto-select first workspace if none selected
      if (ws.length > 0 && !activeWorkspace) {
        setActiveWorkspace(ws[0]);
      }

      // Clear active if it's no longer in the list
      if (activeWorkspace && !ws.find((w) => w.id === activeWorkspace.id)) {
        setActiveWorkspace(ws[0] ?? null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load workspaces",
      );
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  // Fetch workspaces when session changes
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectWorkspace = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (ws) setActiveWorkspace(ws);
    },
    [workspaces],
  );

  return {
    workspaces,
    activeWorkspace,
    loading,
    error,
    selectWorkspace,
    refresh,
  };
}