import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardHeader,
  StatusBadge,
  SkeletonList,
} from "@/components/ui";
import {
  getAuditEvents,
  getConfig,
  getSystemActionState,
  type AuditEvent,
} from "@/lib/api";

/* ============================================================
   Settings & Security
   Truthful governance surface: provider configuration status,
   effective executor permissions, and the append-only audit
   trail. Every value shown comes from a real endpoint.
   ============================================================ */

interface SecuritySnapshot {
  provider: string;
  model: string;
  hasGeminiKey: boolean;
  performanceMode: string;
  schedulerTimerActive: boolean;
  effectivePermissions: Record<string, boolean>;
}

const PERMISSION_LABELS: Record<string, string> = {
  createFiles: "Create files",
  modifyFiles: "Modify files",
  runCommands: "Run shell commands",
  installDependencies: "Install dependencies",
  deploy: "Deploy",
};

const HIGH_RISK_PERMISSIONS = new Set([
  "runCommands",
  "installDependencies",
  "deploy",
]);

export function SecurityPanel() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [config, systemState, audit] = await Promise.all([
        getConfig().catch(() => null),
        getSystemActionState(),
        getAuditEvents(60),
      ]);
      setSnapshot({
        provider: config?.provider ?? "not configured",
        model: config?.model ?? "",
        hasGeminiKey: Boolean(config?.hasGeminiKey),
        performanceMode: systemState.performanceMode,
        schedulerTimerActive: systemState.scheduler.timerActive,
        effectivePermissions:
          (systemState as unknown as { effectivePermissions?: Record<string, boolean> })
            .effectivePermissions ?? {},
      });
      setEvents(audit.events);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load security status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Provider + policy status */}
      <Card className="p-4">
        <CardHeader
          eyebrow="GOVERNANCE"
          title="Provider & Policy Status"
          description="Live configuration state — nothing here is inferred or mocked."
          actions={
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />

        {loading ? (
          <SkeletonList rows={4} />
        ) : snapshot ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
              <span className="text-sm text-text-secondary">Active LLM</span>
              <StatusBadge
                tone={snapshot.provider === "not configured" ? "warning" : "info"}
                label={`${snapshot.provider}${snapshot.model ? `: ${snapshot.model}` : ""}`}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
              <span className="text-sm text-text-secondary">Gemini API key</span>
              <StatusBadge
                tone={snapshot.hasGeminiKey ? "success" : "neutral"}
                label={snapshot.hasGeminiKey ? "Configured" : "Not configured"}
                dot
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
              <span className="text-sm text-text-secondary">
                Automation loop
              </span>
              <StatusBadge
                tone={snapshot.schedulerTimerActive ? "success" : "warning"}
                label={snapshot.schedulerTimerActive ? "Running" : "Stopped"}
                dot
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-muted bg-white/2 p-2.5">
              <span className="text-sm text-text-secondary">
                Performance profile
              </span>
              <StatusBadge
                tone={snapshot.performanceMode === "high" ? "info" : "neutral"}
                label={snapshot.performanceMode}
              />
            </div>

            {/* Effective executor permissions */}
            <div className="rounded-lg border border-border-muted bg-white/2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Effective executor permissions
              </p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                  const enabled = snapshot.effectivePermissions[key] === true;
                  const highRisk = HIGH_RISK_PERMISSIONS.has(key);
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-text-primary">{label}</span>
                      <StatusBadge
                        tone={enabled ? (highRisk ? "warning" : "success") : "neutral"}
                        label={enabled ? "Allowed" : "Denied"}
                        dot
                      />
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 mb-0 flex items-start gap-1.5 text-xs leading-relaxed text-text-muted">
                {HIGH_RISK_PERMISSIONS.size > 0 && (
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" />
                )}
                High-risk capabilities require both the permissions flag and the
                MARINA_ENABLE_EXEC=1 environment opt-in. Model-requested
                high/critical actions always wait in the Approval Queue.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-status-error">
            Security status unavailable.
          </p>
        )}
      </Card>

      {/* Audit trail */}
      <Card className="p-4">
        <CardHeader
          eyebrow="AUDIT"
          title="Activity Trail"
          description="Append-only record of consequential actions with redacted metadata."
        />
        {loading ? (
          <SkeletonList rows={5} />
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
            No audit events recorded yet.
          </p>
        ) : (
          <ul className="m-0 flex max-h-[420px] list-none flex-col gap-1.5 overflow-y-auto p-0">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-border-muted bg-white/2 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-text-primary">
                    {event.action}
                  </span>
                  <span className="block truncate text-[0.68rem] text-text-muted">
                    actor: {event.actor}
                    {event.objectType ? ` • ${event.objectType}` : ""}
                  </span>
                </div>
                <span className="shrink-0 text-[0.65rem] text-text-muted">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 mb-0 flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldAlert className="h-3.5 w-3.5 text-accent-secondary" />
          Metadata is redacted before persistence; secrets never enter this
          trail.
        </p>
      </Card>
    </div>
  );
}

export default SecurityPanel;