import { Card, CardHeader, StatusBadge, SkeletonList } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { ModelRun } from "@/types";

export interface RunHistoryTableProps {
  runs: ModelRun[];
  loading?: boolean;
}

const statusTone: Record<ModelRun["status"], "success" | "warning" | "error" | "info"> = {
  queued: "info",
  running: "warning",
  completed: "success",
  failed: "error",
};

/** Table of recent model runs / task executions. */
export function RunHistoryTable({ runs, loading }: RunHistoryTableProps) {
  return (
    <Card className="p-4">
      <CardHeader
        eyebrow="OPERATIONS"
        title="Run History"
        description="Recent model runs and task executions."
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          No runs recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-muted text-[0.68rem] uppercase tracking-wider text-text-secondary">
                <th className="pb-2 pr-3 font-semibold">Task</th>
                <th className="pb-2 pr-3 font-semibold">Owner</th>
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 pr-3 font-semibold">Progress</th>
                <th className="pb-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-border-muted/50 transition-colors hover:bg-white/2"
                >
                  <td className="py-2.5 pr-3 font-medium text-text-primary">
                    {run.title}
                  </td>
                  <td className="py-2.5 pr-3 text-text-secondary">{run.owner}</td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge tone={statusTone[run.status]} label={run.status} dot />
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border-strong">
                        <div
                          className="h-full rounded-full bg-accent-primary transition-all"
                          style={{ width: `${run.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary">{run.progress}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-xs text-text-secondary">
                    {formatDateTime(run.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
