import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  FileText,
  GitBranch,
  Play,
  RotateCcw,
  Square,
  X,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, StatusBadge, SkeletonList } from "@/components/ui";
import {
  getPlans,
  decidePlan,
  createRun,
  getRunEvents,
  cancelRun,
  retryRun,
  getArtifacts,
  type Plan,
  type Run,
  type RunEvent,
  type Artifact,
} from "@/lib/api";
import type { TaskItem } from "@/types";

/* ============================================================
   Task Detail
   Three-region workspace: plan review, run timeline, artifacts.
   Collapses to single-column on smaller screens.
   Preserves the compact card rhythm and dark surface aesthetic.
   ============================================================ */

interface TaskDetailProps {
  task: TaskItem;
  onBack: () => void;
  onRefresh?: () => void;
}

const RISK_TONE: Record<string, "success" | "warning" | "error" | "info"> = {
  low: "success",
  moderate: "info",
  high: "warning",
  critical: "error",
};

const RUN_STATUS_TONE: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  queued: "info",
  active: "info",
  succeeded: "success",
  failed: "error",
  cancelled: "neutral",
  timed_out: "warning",
};

export function TaskDetail({ task, onBack, onRefresh }: TaskDetailProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [runs] = useState<Run[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedRunEvents, setSelectedRunEvents] = useState<RunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, artifactsRes] = await Promise.all([
        getPlans(task.id).catch(() => ({ ok: false, plans: [] as Plan[] })),
        getArtifacts({ taskId: task.id }).catch(() => ({ ok: false, artifacts: [] as Artifact[] })),
      ]);
      setPlans(plansRes.plans || []);
      setArtifacts(artifactsRes.artifacts || []);
    } catch {
      /* keep last known */
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activePlan = plans.find((p) => p.status === "approved") || plans[0];

  const handlePlanDecision = async (planId: string, decision: "approve" | "reject" | "revise") => {
    if (busy) return;
    setBusy(true);
    try {
      await decidePlan(planId, decision);
      toast.success(`Plan ${decision}d`);
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${decision} plan`);
    } finally {
      setBusy(false);
    }
  };

  const handleStartRun = async () => {
    if (busy || !activePlan) return;
    setBusy(true);
    try {
      await createRun({ taskId: task.id, planId: activePlan.id });
      toast.success("Run queued");
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRun = async (runId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await cancelRun(runId);
      toast.success("Run cancelled");
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setBusy(false);
    }
  };

  const handleRetryRun = async (runId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await retryRun(runId);
      toast.success("Run retried — new attempt queued");
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to retry run");
    } finally {
      setBusy(false);
    }
  };

  const handleViewRunEvents = async (runId: string) => {
    try {
      const res = await getRunEvents(runId);
      setSelectedRunEvents(res.events || []);
    } catch {
      setSelectedRunEvents([]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Back + task header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-text-primary">{task.title}</h2>
          <p className="text-xs text-text-secondary">
            {task.owner} • {task.priority} • Updated {new Date(task.updatedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge
          tone={task.status === "completed" ? "success" : task.status === "failed" ? "error" : "info"}
          label={task.status}
          dot
        />
      </div>

      {/* Three-region grid: collapses to single column on mobile */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Primary work pane: plan + execution controls ── */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="p-4">
            <CardHeader
              eyebrow="PLAN"
              title="Plan Review"
              description="Review, edit, approve, or reject the generated plan. Prior versions are preserved."
              actions={
                activePlan && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">v{activePlan.version}</span>
                    <StatusBadge
                      tone={
                        activePlan.status === "approved"
                          ? "success"
                          : activePlan.status === "rejected"
                            ? "error"
                            : activePlan.status === "superseded"
                              ? "neutral"
                              : "info"
                      }
                      label={activePlan.status}
                      dot
                    />
                  </div>
                )
              }
            />

            {loading ? (
              <SkeletonList rows={4} />
            ) : !activePlan ? (
              <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
                No plan generated yet. Use the AI Assistant to generate a plan for this task.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {activePlan.summary && (
                  <p className="rounded-lg border border-border-muted bg-white/2 p-3 text-sm text-text-secondary">
                    {activePlan.summary}
                  </p>
                )}

                {activePlan.assumptions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Assumptions
                    </p>
                    <ul className="m-0 list-inside list-disc space-y-0.5 text-sm text-text-primary">
                      {activePlan.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activePlan.risks.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Risks
                    </p>
                    <ul className="m-0 list-inside list-disc space-y-0.5 text-sm text-text-primary">
                      {activePlan.risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Plan steps */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Steps ({activePlan.steps.length})
                  </p>
                  <ol className="m-0 flex list-none flex-col gap-2 p-0">
                    {activePlan.steps.map((step, i) => (
                      <li
                        key={step.id}
                        className="rounded-lg border border-border-muted bg-surface-3/60 p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-muted bg-surface-2 text-[0.65rem] font-bold text-text-secondary">
                              {i + 1}
                            </span>
                            {step.title}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {step.requiresApproval && (
                              <ShieldCheck className="h-3.5 w-3.5 text-status-warning" />
                            )}
                            <StatusBadge
                              tone={RISK_TONE[step.riskTier] || "neutral"}
                              label={step.riskTier}
                            />
                          </div>
                        </div>
                        {step.purpose && (
                          <p className="mt-1 pl-7 text-xs text-text-secondary">{step.purpose}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Plan decision controls */}
                {activePlan.status === "draft" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handlePlanDecision(activePlan.id, "approve")}
                      loading={busy}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve Plan
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handlePlanDecision(activePlan.id, "reject")}
                      loading={busy}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePlanDecision(activePlan.id, "revise")}
                      loading={busy}
                    >
                      Request Revision
                    </Button>
                  </div>
                )}

                {activePlan.status === "approved" && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleStartRun}
                      loading={busy}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start Run
                    </Button>
                    <p className="text-xs text-text-muted">
                      High/critical steps still require just-in-time approval at execution time.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Run timeline */}
          <Card className="p-4">
            <CardHeader
              eyebrow="TIMELINE"
              title="Run History"
              description="Execution attempts with ordered activity events."
            />
            {loading ? (
              <SkeletonList rows={3} />
            ) : runs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
                No runs yet. Approve the plan and start a run.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="rounded-lg border border-border-muted bg-white/2 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          tone={RUN_STATUS_TONE[run.status] || "neutral"}
                          label={run.status}
                          dot
                        />
                        <span className="text-xs text-text-muted">
                          Attempt {run.attemptCount}
                        </span>
                        {run.startedAt && (
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <Clock className="h-3 w-3" />
                            {new Date(run.startedAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewRunEvents(run.id)}
                        >
                          Events
                        </Button>
                        {["queued", "active"].includes(run.status) && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelRun(run.id)}
                            loading={busy}
                          >
                            <Square className="h-3 w-3" />
                            Cancel
                          </Button>
                        )}
                        {["failed", "timed_out"].includes(run.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetryRun(run.id)}
                            loading={busy}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                    {run.failureClassification && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-status-error">
                        <AlertTriangle className="h-3 w-3" />
                        {run.failureClassification}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Run events detail */}
            {selectedRunEvents.length > 0 && (
              <div className="mt-3 rounded-lg border border-border-muted bg-surface-3/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Activity Events
                </p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {selectedRunEvents.map((evt) => (
                    <li
                      key={evt.id}
                      className="flex items-start justify-between gap-2 border-b border-border-muted/50 py-1 last:border-0"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-text-primary">
                          {evt.event}
                        </span>
                        <span className="block truncate text-[0.68rem] text-text-muted">
                          {evt.summary}
                        </span>
                      </div>
                      <span className="shrink-0 text-[0.65rem] text-text-muted">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* ── Context + Output pane ── */}
        <div className="flex flex-col gap-4">
          {/* Context */}
          <Card className="p-4">
            <CardHeader
              eyebrow="CONTEXT"
              title="Task Context"
              description="Project, priority, and execution metadata."
            />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
                <span className="text-sm text-text-secondary">Priority</span>
                <StatusBadge
                  tone={
                    task.priority === "Critical" || task.priority === "High"
                      ? "warning"
                      : "neutral"
                  }
                  label={task.priority}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
                <span className="text-sm text-text-secondary">Owner</span>
                <span className="text-sm font-medium text-text-primary">{task.owner}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
                <span className="text-sm text-text-secondary">Progress</span>
                <span className="text-sm font-semibold text-accent-primary">{task.progress}%</span>
              </div>
              {plans.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
                  <span className="text-sm text-text-secondary">Plan versions</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
                    <GitBranch className="h-3.5 w-3.5 text-accent-secondary" />
                    {plans.length}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Artifacts */}
          <Card className="p-4">
            <CardHeader
              eyebrow="OUTPUT"
              title="Artifacts"
              description="Generated outputs with provenance."
            />
            {loading ? (
              <SkeletonList rows={2} />
            ) : artifacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
                No artifacts yet. Artifacts appear after a successful run.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {artifacts.map((artifact) => (
                  <li
                    key={artifact.id}
                    className="rounded-lg border border-border-muted bg-white/2 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-accent-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {artifact.displayName}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {artifact.type} • {new Date(artifact.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <StatusBadge
                        tone={
                          artifact.state === "ready"
                            ? "success"
                            : artifact.state === "archived"
                              ? "neutral"
                              : "info"
                        }
                        label={artifact.state}
                      />
                    </div>
                    {artifact.summary && (
                      <p className="mt-1 text-xs text-text-secondary">{artifact.summary}</p>
                    )}
                    {artifact.storageRef && artifact.state === "ready" && (
                      <a
                        href={`/api/reports/${encodeURIComponent(artifact.storageRef.split("/").pop() || "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        View artifact
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default TaskDetail;