import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ListChecks, Pause, RefreshCw, XCircle, Layers } from "lucide-react";
import { Button, Card, CardHeader, SkeletonList, StatusBadge } from "@/components/ui";
import { getOperationsShelf, type OperationsShelfState } from "@/lib/api";

/* ============================================================
   Operations Shelf
   A compact, truthful Operations card grid that lives inside
   the existing card rhythm. It reports ONLY what the durable
   queue knows: persisted run counts, the local-worker guard
   state, and the recent ordered activity. It never lies about
   a worker it does not have, never calls a background action
   by itself, and never spawns side effects on page refresh.

   Card data is one original MarinaAI label, one short value,
   one safe action per card. No stop-server, no auto-run, no
   chat-style redesign.
   ============================================================ */

interface OperationsShelfProps {
  workspaceId: string | null;
  onRefresh?: () => void;
}

const TONE: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  queued: "info",
  active: "info",
  succeeded: "success",
  failed: "error",
  cancelled: "neutral",
  timed_out: "warning",
};

function plural(n: number, single: string, many: string) {
  return n === 1 ? single : many;
}

export function OperationsShelf({ workspaceId, onRefresh }: OperationsShelfProps) {
  const [state, setState] = useState<OperationsShelfState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOperationsShelf(workspaceId);
      setState(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load operations";
      setError(message);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const headline = useMemo(() => {
    if (!state) return "No worker configured";
    if (state.counts.active > 0) return "Worker lease active";
    if (state.counts.queued > 0) {
      return state.counts.queued + " " + plural(state.counts.queued, "run", "runs") + " queued";
    }
    if (state.counts.failed > 0) return "Retry scheduled";
    if (state.counts.timed_out > 0) return "Worker lease expired — review";
    if (state.counts.succeeded > 0) return "Safe workflow ready";
    return "Awaiting plan approval";
  }, [state]);

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="OPERATIONS"
        title="Operations Shelf"
        description="Persisted durable queue state. Refreshes on demand; never starts a worker automatically."
        actions={
          <Button variant="ghost" size="sm" onClick={() => { void load(); onRefresh?.(); }} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {error && (
        <p className="mb-3 rounded-lg border border-dashed border-border-muted p-3 text-xs text-status-error">
          {error}
        </p>
      )}

      {loading && !state ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-border-muted bg-white/2 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
              <Activity className="h-3 w-3" />
              Queue state
            </div>
            <p className="text-sm font-semibold text-text-primary">{headline}</p>
            <p className="mt-0.5 text-[0.68rem] text-text-muted">
              {state ? (state.totalRuns + " " + plural(state.totalRuns, "run", "runs") + " on file") : "—"}
            </p>
          </div>

          <div className="rounded-lg border border-border-muted bg-white/2 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
              <ListChecks className="h-3 w-3" />
              Run counts
            </div>
            {state ? (
              <div className="flex flex-wrap gap-1.5">
                {(["queued", "active", "succeeded", "failed", "timed_out", "cancelled"] as const).map((k) => (
                  <StatusBadge
                    key={k}
                    tone={TONE[k] || "neutral"}
                    label={k.replace("_", " ") + " " + (state.counts[k] || 0)}
                    dot
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No data</p>
            )}
          </div>

          <div className="rounded-lg border border-border-muted bg-white/2 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
              <Pause className="h-3 w-3" />
              Worker runtime
            </div>
            <p className="text-sm font-semibold text-text-primary">
              {state?.localWorkerEnabled ? "Local harness (development)" : "No worker configured"}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-text-muted">
              Persistent runtime: {state?.persistentWorkerEnabled ? "on" : "not enabled"}
            </p>
          </div>

          {state && state.recent.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="mb-1 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
                <Layers className="h-3 w-3" />
                Recent activity
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {state.recent.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-muted bg-surface-3/40 px-2 py-1.5 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusBadge tone={TONE[r.status] || "neutral"} label={r.status} dot />
                      <span className="truncate font-mono text-text-muted">{String(r.id).slice(0, 8)}</span>
                      {r.tool && <span className="truncate text-text-secondary">{r.tool}</span>}
                    </span>
                    <span className="flex items-center gap-2 text-[0.65rem] text-text-muted">
                      attempt {r.attempt}/{r.maxAttempts}
                      {r.leaseExpired && (
                        <XCircle className="h-3 w-3 text-status-warning" aria-label="lease expired" />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state && state.truthStatement && (
            <p className="sm:col-span-2 lg:col-span-3 text-[0.65rem] text-text-muted">
              {state.truthStatement}
            </p>
          )}
        </div>
      )}

      {/* Safe action: refresh only. Cancellation is exposed through
          the existing /api/durable/runs/cancel route; we do not
          add a "stop server" or "auto-run" action here. */}
    </Card>
  );
}

export default OperationsShelf;
