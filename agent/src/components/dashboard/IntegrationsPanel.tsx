import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, ShieldAlert, Wrench, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, StatusBadge, SkeletonList } from "@/components/ui";
import { listTools, type ToolDefinition } from "@/lib/api";

/* ============================================================
   Integrations Panel
   Truthful tool registry surface. Tools are grouped into three
   compact original sections — Ready, Needs configuration, and
   Planned — plus a Blocked footer for intentionally disabled
   categories. The grouping is computed from the truthful
   availability fields returned by /api/tools. No fake
   "connected" states; no third-party product labels.
   ============================================================ */

const RISK_TONE: Record<string, "success" | "warning" | "error" | "info"> = {
  low: "success",
  moderate: "info",
  high: "warning",
  critical: "error",
};

const SECTION_ORDER: Array<{ key: string; label: string; description: string }> = [
  { key: "ready", label: "Ready", description: "Dispatchable tools with a current approval path." },
  { key: "needs", label: "Needs configuration", description: "Honest not_configured descriptors — no provider wired." },
  { key: "planned", label: "Planned", description: "Roadmap items; never return a side effect today." },
  { key: "blocked", label: "Blocked", description: "Intentionally disabled categories. No execution is possible." },
];

function classifySection(tool: ToolDefinition): string {
  if (tool.available) return "ready";
  const state = String(tool.availabilityState || "").toLowerCase();
  if (state === "not_configured") return "needs";
  if (state === "blocked" || state === "disabled") return "blocked";
  return "planned";
}

function ToolRow({ tool }: { tool: ToolDefinition }) {
  return (
    <li className="rounded-lg border border-border-muted bg-white/2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-accent-primary" />
            <span className="text-sm font-semibold text-text-primary">{tool.name}</span>
            <span className="text-[0.65rem] text-text-muted">v{tool.version}</span>
          </div>
          <p className="m-0 text-xs text-text-secondary">{tool.purpose}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge tone={RISK_TONE[tool.riskTier] || "neutral"} label={tool.riskTier} dot />
          {tool.available ? (
            <StatusBadge tone="success" label="Available" dot />
          ) : (
            <StatusBadge
              tone={String(tool.availabilityState).toLowerCase() === "blocked" ? "error" : "warning"}
              label={String(tool.availabilityState || "not_configured").replace("_", " ")}
              dot
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.68rem] text-text-muted">
        <span className="flex items-center gap-1">
          {tool.approvalPolicy === "just_in_time" ? (
            <>
              <ShieldAlert className="h-3 w-3 text-status-warning" />
              Just-in-time approval required
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3 text-status-success" />
              Plan approval sufficient
            </>
          )}
        </span>
        {tool.featureFlag && (
          <span className="text-status-warning">Gated: {tool.featureFlag}</span>
        )}
      </div>
    </li>
  );
}

export function IntegrationsPanel() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTools();
      setTools(res.tools || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tool registry");
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const out: Record<string, ToolDefinition[]> = { ready: [], needs: [], planned: [], blocked: [] };
    for (const t of tools) {
      const key = classifySection(t);
      if (out[key]) out[key].push(t);
    }
    return out;
  }, [tools]);

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="TOOL REGISTRY"
        title="Integrations & Tools"
        description="Allowlisted tools grouped by truthful availability. Only the Ready section may execute."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={5} />
      ) : tools.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted p-4 text-center text-sm text-text-muted">
          No tools registered.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {SECTION_ORDER.map((section) => {
            const list = grouped[section.key] || [];
            if (list.length === 0) return null;
            return (
              <div key={section.key}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
                    {section.label}
                  </span>
                  <span className="text-[0.65rem] text-text-muted">· {list.length}</span>
                </div>
                <p className="m-0 mb-2 text-xs text-text-muted">{section.description}</p>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {list.map((t) => (
                    <ToolRow key={t.name} tool={t} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 mb-0 flex items-center gap-1.5 text-xs text-text-muted">
        <Lock className="h-3.5 w-3.5 text-accent-secondary" />
        All tool inputs are schema-validated, redacted, and audited. Unknown
        actions are rejected as policy_blocked (fail-closed). External sends,
        payments, deployments, shell, and browser automation are intentionally
        blocked and have no registered handler.
      </p>
    </Card>
  );
}

export default IntegrationsPanel;
