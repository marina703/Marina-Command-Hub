import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wrench, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardHeader,
  StatusBadge,
  SkeletonList,
} from "@/components/ui";
import { listTools, type ToolDefinition } from "@/lib/api";

/* ============================================================
   Integrations Panel
   Truthful tool registry surface: shows every registered tool,
   its risk tier, approval policy, and real availability state.
   Tools gated behind feature flags show "Not configured" —
   never a fake "available" state.
   ============================================================ */

const RISK_TONE: Record<string, "success" | "warning" | "error" | "info"> = {
  low: "success",
  moderate: "info",
  high: "warning",
  critical: "error",
};

export function IntegrationsPanel() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTools();
      setTools(res.tools || []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load tool registry",
      );
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="TOOL REGISTRY"
        title="Integrations & Tools"
        description="Allowlisted tools with schema validation, risk tiers, and approval policies. Only tools shown here can be dispatched."
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
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tools.map((tool) => (
            <li
              key={tool.name}
              className="rounded-lg border border-border-muted bg-white/2 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-accent-primary" />
                    <span className="text-sm font-semibold text-text-primary">
                      {tool.name}
                    </span>
                    <span className="text-[0.65rem] text-text-muted">v{tool.version}</span>
                  </div>
                  <p className="m-0 text-xs text-text-secondary">{tool.purpose}</p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge
                    tone={RISK_TONE[tool.riskTier] || "neutral"}
                    label={tool.riskTier}
                    dot
                  />
                  {tool.available ? (
                    <StatusBadge tone="success" label="Available" dot />
                  ) : (
                    <StatusBadge tone="warning" label="Not configured" dot />
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.68rem] text-text-muted">
                <span className="flex items-center gap-1">
                  {tool.approvalPolicy === "just_in_time" ? (
                    <>
                      <ShieldAlert className="h-3 w-3 text-status-warning" />
                      Requires just-in-time approval
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3 w-3 text-status-success" />
                      Plan approval sufficient
                    </>
                  )}
                </span>
                {tool.featureFlag && (
                  <span className="text-status-warning">
                    Gated: {tool.featureFlag}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 mb-0 flex items-center gap-1.5 text-xs text-text-muted">
        <ShieldAlert className="h-3.5 w-3.5 text-accent-secondary" />
        All tool inputs are schema-validated, redacted, and audited. Unknown
        actions are rejected as critical (fail-closed).
      </p>
    </Card>
  );
}

export default IntegrationsPanel;