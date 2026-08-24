import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, StatusBadge, SkeletonList } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  decideApproval,
  listApprovals,
  type ApprovalRequest,
} from "@/lib/api";

/* ============================================================
   Approval Inbox
   Centralized human-control queue. Every high/critical action
   requested by the model lands here with a redacted preview,
   risk tier, and a time-limited approve/reject decision.
   Uses the same compact card rhythm as the rest of the Hub.
   ============================================================ */

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "executed", label: "Executed" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
  { id: "all", label: "All" },
];

const RISK_TONE: Record<
  ApprovalRequest["riskTier"],
  "success" | "warning" | "error" | "info"
> = {
  low: "success",
  moderate: "info",
  high: "warning",
  critical: "error",
};

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s left`;
}

export function ApprovalInbox({ onRefresh }: { onRefresh?: () => void }) {
  const [filter, setFilter] = useState<string>("pending");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listApprovals(filter);
      setApprovals(res.approvals);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load approvals",
      );
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
    // Refresh countdowns while pending items are visible.
    const timer = window.setInterval(() => {
      if (filter === "pending") setApprovals((prev) => [...prev]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [load, filter]);

  const handleDecision = async (
    approval: ApprovalRequest,
    decision: "approve" | "reject",
  ) => {
    if (busyId) return;
    setBusyId(approval.id);
    try {
      const res = await decideApproval(approval.id, decision, note);
      toast.success(res.message || `Decision recorded: ${decision}`);
      setConfirmingId(null);
      setNote("");
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record decision",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="HUMAN CONTROL"
        title="Approval Queue"
        description="High and critical risk actions wait here for your explicit, time-limited decision."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Status filter pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
              filter === f.id
                ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary shadow-glow-primary"
                : "border-border-muted bg-surface-3 text-text-secondary hover:border-accent-primary/40 hover:text-text-primary",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : approvals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
          No {filter === "all" ? "" : `${filter} `}approval requests.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {approvals.map((approval) => {
            const isPending = approval.status === "pending";
            const isConfirming = confirmingId === approval.id;
            return (
              <li
                key={approval.id}
                className="rounded-xl border border-border-muted bg-white/2 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={RISK_TONE[approval.riskTier]}
                        label={approval.riskTier.toUpperCase()}
                        dot
                      />
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        {approval.action}
                      </span>
                    </div>
                    <p className="m-0 break-words text-sm text-text-primary">
                      {approval.description || approval.reason}
                    </p>
                    {Object.keys(approval.payloadPreview).length > 0 && (
                      <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-border-muted bg-surface-3/60 p-2 text-[0.7rem] leading-relaxed text-text-secondary">
                        {JSON.stringify(approval.payloadPreview, null, 2)}
                      </pre>
                    )}
                    <p className="mt-1.5 mb-0 text-xs text-text-muted">
                      Requested{" "}
                      {new Date(approval.requestedAt).toLocaleTimeString()}
                      {isPending && (
                        <>
                          {" • "}
                          <span className="font-semibold text-status-warning">
                            {formatCountdown(approval.expiresAt)}
                          </span>
                        </>
                      )}
                      {approval.decisionNote && (
                        <> • Note: {approval.decisionNote}</>
                      )}
                    </p>
                  </div>

                  {isPending && !isConfirming && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setConfirmingId(approval.id);
                          setNote("");
                        }}
                        disabled={busyId !== null}
                        title="Open deliberate confirmation"
                      >
                        Review
                      </Button>
                    </div>
                  )}

                  {isPending && isConfirming && (
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[220px]">
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optional decision note…"
                        aria-label={`Decision note for ${approval.action}`}
                        className="w-full rounded-lg border border-border-muted bg-surface-3 px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDecision(approval, "reject")}
                          loading={busyId === approval.id}
                          disabled={busyId !== null && busyId !== approval.id}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() =>
                            void handleDecision(approval, "approve")
                          }
                          loading={busyId === approval.id}
                          disabled={busyId !== null && busyId !== approval.id}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve once
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingId(null)}
                          aria-label="Cancel review"
                        >
                          Close
                        </Button>
                      </div>
                      <p className="m-0 text-[0.65rem] text-text-muted">
                        Single-use • expires automatically • fully audited
                      </p>
                    </div>
                  )}

                  {!isPending && (
                    <StatusBadge
                      tone={
                        approval.status === "approved" ||
                        approval.status === "executed"
                          ? "success"
                          : approval.status === "rejected"
                            ? "error"
                            : "neutral"
                      }
                      label={approval.status}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 mb-0 flex items-center gap-1.5 text-xs text-text-muted">
        <ShieldAlert className="h-3.5 w-3.5 text-accent-secondary" />
        Approvals are bound to the exact action payload, expire after 15
        minutes, execute at most once, and are written to the audit trail.
      </p>
    </Card>
  );
}

export default ApprovalInbox;