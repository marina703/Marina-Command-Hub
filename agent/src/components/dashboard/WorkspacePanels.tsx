import { useCallback, useEffect, useState } from "react";
import {
  Eraser,
  FileText,
  Gauge,
  RefreshCw,
  X,
  Zap,
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui";
import {
  clearTempFiles,
  getSystemActionState,
  getSystemMetrics,
  optimizeSystem,
  restartScheduler,
  runPlaybook,
  setHighPerformance,
} from "@/lib/api";
import type { PlaybookResponse, SystemMetrics } from "@/types";
import { PlaybookBar } from "./PlaybookBar";
import { Panel, type PanelItem } from "./Panel";


/* ============================================================
   Workspace Panels
   Composes the PlaybookBar with a responsive grid of panels
   (Execution, Operations, System, Strategy) and wires up the
   local action-button state interactions. Each One-Click Tool
   runs a real backend playbook, records its result, and shows
   live telemetry alongside the generated report.
   ============================================================ */

interface WorkspacePanelsProps {
  /** Called after a playbook run completes so parent can refresh. */
  onRefresh?: () => void;
}

/** Metadata for each One-Click Tool (label + hover tooltip). */
const ONE_CLICK_TOOLS: Array<{ id: string; label: string; tooltip: string }> = [
  {
    id: "market-position",
    label: "Market Position Analyzer",
    tooltip: "Analyze the market position of the Marina AI portfolio and identify gaps vs competitors.",
  },
  {
    id: "competitor-snapshot",
    label: "Competitor Snapshot",
    tooltip: "Generate a competitor snapshot with strengths, weaknesses, and exploitable gaps.",
  },
  {
    id: "audience-persona",
    label: "Audience Persona Builder",
    tooltip: "Build detailed audience personas with demographics, goals, pain points, and hooks.",
  },
  {
    id: "trend-pulse",
    label: "Trend Pulse Scan",
    tooltip: "Scan current trends and surface opportunities with recommended actions.",
  },
  {
    id: "offer-angle",
    label: "Offer Angle Generator",
    tooltip: "Generate 5 offer angles with core promise, target segment, and hook.",
  },
  {
    id: "funnel-weakpoint",
    label: "Funnel Weak-Point Detector",
    tooltip: "Analyze the sales funnel and identify weak points at each stage with fixes.",
  },
];

export function WorkspacePanels({ onRefresh }: WorkspacePanelsProps) {
  const [selectedPlaybook, setSelectedPlaybook] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runningPlaybook, setRunningPlaybook] = useState<string | null>(null);

  // Real system-action state (loaded from /api/system/state)
  const [tempCount, setTempCount] = useState<number | null>(null);
  const [tempCleared, setTempCleared] = useState(false);
  const [servicesRestarted, setServicesRestarted] = useState(false);
  const [schedulerActive, setSchedulerActive] = useState<boolean | null>(null);
  const [optimized, setOptimized] = useState(false);
  const [optimizeSummary, setOptimizeSummary] = useState<string | null>(null);
  const [highPerf, setHighPerf] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Report pop-up state
  const [report, setReport] = useState<PlaybookResponse | null>(null);

  // Per-tool completion tracking (id -> last result)
  const [completedTools, setCompletedTools] = useState<
    Record<string, PlaybookResponse>
  >({});

  // Live telemetry snapshot shown alongside reports
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await getSystemMetrics();
      setMetrics(res.metrics);
    } catch {
      /* metrics unavailable — keep last snapshot */
    }
  }, []);

  // Load truthful system-action state (temp report count, scheduler, perf mode).
  const loadSystemState = useCallback(async () => {
    try {
      const state = await getSystemActionState();
      setTempCount(state.tempReports.count);
      setSchedulerActive(state.scheduler.timerActive);
      setHighPerf(state.performanceMode === "high");
    } catch {
      /* keep last known values; panel shows neutral status */
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    loadSystemState();
  }, [loadMetrics, loadSystemState]);

  const handleRun = useCallback(
    async (id: string, prompt?: string) => {
      setRunning(true);
      setRunningPlaybook(id);
      try {
        const res = await runPlaybook(id, prompt ?? "");
        setReport(res);
        setCompletedTools((prev) => ({ ...prev, [id]: res }));
        toast.success(res.playbook || "Playbook complete", {
          description: res.summary ?? "Workspace updated.",
        });
        loadMetrics();
        onRefresh?.();
      } catch (err) {
        toast.error("Playbook failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setRunning(false);
        setRunningPlaybook(null);
      }
    },
    [onRefresh, loadMetrics],
  );


  /** Clear generated tmp/*.md reports via the real backend. */
  const handleClearTemp = async () => {
    if (actionBusy) return;
    setActionBusy("clear-temp");
    try {
      const res = await clearTempFiles();
      setTempCleared(true);
      setTempCount(0);
      toast.success(`Cleared ${res.removed} report file(s)`, {
        description: `${(res.bytesFreed / 1024).toFixed(1)} KB freed`,
      });
      onRefresh?.();
    } catch (err) {
      toast.error("Clear failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionBusy(null);
    }
  };

  /** Restart the in-process automation loop via the real backend. */
  const handleRestartScheduler = async () => {
    if (actionBusy) return;
    setActionBusy("restart-scheduler");
    try {
      const res = await restartScheduler();
      setServicesRestarted(true);
      setSchedulerActive(res.scheduler?.timerActive ?? null);
      toast.success("Automation loop restarted", {
        description: "In-process scheduler is running again",
      });
      onRefresh?.();
    } catch (err) {
      toast.error("Restart failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionBusy(null);
    }
  };

  /** Optimize: clear reports + compact dashboard state via the real backend. */
  const handleOptimize = async () => {
    if (actionBusy) return;
    setActionBusy("optimize");
    try {
      const res = await optimizeSystem();
      setOptimized(true);
      setTempCount(0);
      setOptimizeSummary(
        `${res.reportsRemoved} report(s), ${(res.reportsBytesFreed / 1024).toFixed(1)} KB freed`,
      );
      toast.success("Workspace optimized", {
        description: `${res.reportsRemoved} report(s) removed • ${(res.reportsBytesFreed / 1024).toFixed(1)} KB + ${(res.stateBytesSaved / 1024).toFixed(1)} KB saved`,
      });
      onRefresh?.();
    } catch (err) {
      toast.error("Optimize failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionBusy(null);
    }
  };

  /** Toggle the persisted high-performance LLM tuning profile. */
  const handleToggleHighPerf = async () => {
    if (actionBusy) return;
    const next = !highPerf;
    setActionBusy("high-perf");
    try {
      const res = await setHighPerformance(next);
      setHighPerf(res.mode === "high");
      toast.info(
        res.mode === "high"
          ? `High-performance mode ON (ctx ${res.numCtx}, predict ${res.numPredict})`
          : "High-performance mode OFF (standard profile)",
      );
      onRefresh?.();
    } catch (err) {
      toast.error("Toggle failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const runningStatus = running ? "Running…" : "Ready";

  const executionItems: PanelItem[] = [
    {
      id: "exec-1",
      label: "Next Steps",
      status: runningPlaybook === "next-steps" ? "Running…" : "Ready",
      statusTone: runningPlaybook === "next-steps" ? "info" : "success",
    },
    {
      id: "exec-2",
      label: "Daily Ideas",
      status: runningPlaybook === "daily-ideas" ? "Running…" : "Ready",
      statusTone: runningPlaybook === "daily-ideas" ? "info" : "success",
    },
    {
      id: "exec-3",
      label: "Monetization Map",
      status: runningPlaybook === "monetization-map" ? "Running…" : "Ready",
      statusTone: runningPlaybook === "monetization-map" ? "info" : "success",
    },
  ];


  const operationsItems: PanelItem[] = [
    {
      id: "ops-1",
      label:
        tempCount !== null && tempCount > 0
          ? `Clear temp files (${tempCount})`
          : "Clear temp files",
      status: tempCleared ? "Cleared" : tempCount ? `${tempCount} files` : "Idle",
      statusTone: tempCleared ? "success" : "neutral",
      action: (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearTemp}
          loading={actionBusy === "clear-temp"}
          disabled={actionBusy !== null && actionBusy !== "clear-temp"}
          title="Remove generated playbook/tool reports from tmp/"
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
      ),
    },
    {
      id: "ops-2",
      label: "Restart automation loop",
      status: servicesRestarted
        ? "Restarted"
        : schedulerActive === null
          ? "Unknown"
          : schedulerActive
            ? "Running"
            : "Stopped",
      statusTone: servicesRestarted
        ? "success"
        : schedulerActive === false
          ? "warning"
          : "neutral",
      action: (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRestartScheduler}
          loading={actionBusy === "restart-scheduler"}
          disabled={actionBusy !== null && actionBusy !== "restart-scheduler"}
          title="Stop and start the in-process autonomous scheduler"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Restart
        </Button>
      ),
    },
  ];

  const systemItems: PanelItem[] = [
    {
      id: "sys-1",
      label: optimizeSummary ? `Optimized (${optimizeSummary})` : "Optimize workspace",
      status: optimized ? "Optimized" : "Idle",
      statusTone: optimized ? "success" : "neutral",
      action: (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOptimize}
          loading={actionBusy === "optimize"}
          disabled={actionBusy !== null && actionBusy !== "optimize"}
          title="Clear generated reports and compact the dashboard state file"
        >
          <Gauge className="h-3.5 w-3.5" />
          Optimize
        </Button>
      ),
    },
    {
      id: "sys-2",
      label: "High-performance mode",
      status: highPerf ? "ON" : "OFF",
      statusTone: highPerf ? "info" : "neutral",
      action: (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleHighPerf}
          loading={actionBusy === "high-perf"}
          disabled={actionBusy !== null && actionBusy !== "high-perf"}
          title="Persist a larger LLM context/predict profile for future runs"
        >
          <Zap className="h-3.5 w-3.5" />
          Toggle
        </Button>
      ),
    },
  ];

  // One-Click Tools with full READY / RUNNING / COMPLETED lifecycle,
  // hover tooltips, and a "View Report" link after completion.
  const strategyItems: PanelItem[] = ONE_CLICK_TOOLS.map((tool) => {
    const isRunning = runningPlaybook === tool.id;
    const completed = completedTools[tool.id];

    let status = "READY";
    let statusTone: PanelItem["statusTone"] = "neutral";
    if (isRunning) {
      status = "RUNNING";
      statusTone = "info";
    } else if (completed) {
      status = "COMPLETED";
      statusTone = "success";
    }

    return {
      id: tool.id,
      label: tool.label,
      status,
      statusTone,
      action: (
        <div className="flex items-center gap-1.5">
          {completed?.reportFile && (
            <a
              href={`/api/reports/${encodeURIComponent(completed.reportFile)}`}
              target="_blank"
              rel="noreferrer"
              title="Open the generated report"
            >
              <Button variant="outline" size="sm">
                <FileText className="h-3.5 w-3.5" />
                Report
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRun(tool.id)}
            loading={isRunning}
            title={tool.tooltip}
          >
            {isRunning ? "Running" : "Run"}
          </Button>
        </div>
      ),
    };
  });



  return (
    <div className="flex flex-col gap-4">
      <PlaybookBar
        welcome="Rapid Fire"

        selected={selectedPlaybook ?? undefined}
        onSelect={setSelectedPlaybook}
        onRun={handleRun}
        running={running}
      />

      {/* Responsive panel grid: multi-column on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel
          title="Execution"
          subtitle="Active playbook pipeline"
          items={executionItems}
          progress={running ? 45 : 100}
          progressLabel="Pipeline"
        />
        <Panel
          title="Operations"
          subtitle="Maintenance & service controls"
          items={operationsItems}
        />
        <Panel
          title="System"
          subtitle="Performance & optimization"
          items={systemItems}
          progress={highPerf ? 100 : 60}
          progressLabel="Performance"
        />
        <Panel
          id="hub-one-click-tools"
          title="One-Click Tools"
          subtitle="Supporting tools & quick scans"
          items={strategyItems}
          progress={running ? 45 : 0}
          progressLabel={running ? "Running…" : "Idle"}
          className="scroll-mt-24"
        />

      </div>

      {/* Status strip */}
      <div className="flex items-center justify-between rounded-2xl border border-border-muted bg-surface-2/95 px-4 py-3 shadow-card">
        <span className="text-sm text-text-secondary">
          Selected playbook:{" "}
          <span className="font-semibold text-text-primary">
            {selectedPlaybook ?? "None"}
          </span>
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            running
              ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
              : "border-status-success/30 bg-status-success/10 text-status-success"
          }`}
        >
          {runningStatus}
        </span>
      </div>

      {/* Report pop-up */}
      {report && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setReport(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface-2 p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-accent-primary" />
                <h3 className="text-base font-semibold text-text-primary">
                  {report.playbook || "Report"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReport(null)}
                className="rounded-md p-1 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
                aria-label="Close report"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-text-secondary">Status</span>
                <span className="font-medium text-status-success">
                  {report.ok ? "Completed" : "Failed"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-text-secondary">Generated</span>
                <span className="font-medium text-text-primary">
                  {new Date().toLocaleString()}
                </span>
              </div>
              {report.summary && (
                <p className="rounded-lg border border-border-muted bg-white/2 p-3 text-text-secondary">
                  {report.summary}
                </p>
              )}
              {report.tasksCreated && report.tasksCreated.length > 0 && (
                <div className="rounded-lg border border-border-muted bg-white/2 p-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-text-secondary">
                    Tasks created
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-text-primary">
                    {report.tasksCreated.map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Live telemetry snapshot */}
              {metrics && (
                <div className="rounded-lg border border-border-muted bg-white/2 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-secondary">
                    <Activity className="h-3.5 w-3.5 text-accent-primary" />
                    Live system snapshot
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-text-primary">
                      <Cpu className="h-3.5 w-3.5 text-accent-primary" />
                      CPU {Math.round(metrics.cpu.percent)}%
                    </div>
                    <div className="flex items-center gap-1.5 text-text-primary">
                      <MemoryStick className="h-3.5 w-3.5 text-accent-secondary" />
                      RAM {Math.round(metrics.memory.percent)}%
                    </div>
                    <div className="flex items-center gap-1.5 text-text-primary">
                      <HardDrive className="h-3.5 w-3.5 text-accent-primary" />
                      Disk {Math.round(metrics.disk.percent)}%
                    </div>
                    <div className="flex items-center gap-1.5 text-text-primary">
                      <Network className="h-3.5 w-3.5 text-accent-secondary" />
                      {metrics.network.downloadMbps} Mbps
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {report.reportFile && (
                <a
                  href={`/api/reports/${encodeURIComponent(report.reportFile)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="primary" size="sm">
                    <FileText className="h-3.5 w-3.5" />
                    View Report
                  </Button>
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
