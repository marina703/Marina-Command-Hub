import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ============================================================
   Command Hub Header
   Restored verbatim from the original design: hero section,
   workspace bar, filter pills, 4-card summary grid, and the
   quick prompt row.
   ============================================================ */

/** Marina "M" logo mark used in the hero icon container. */
function MLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2.5 3 6.5v11l9 4 9-4v-11l-9-4zm0 2.2 6.5 2.9v8.8L12 19.3 5.5 16.4V7.6L12 4.7z" />
    </svg>
  );
}


interface SummaryStat {
  label: string;
  value: string;
}

interface SummaryCard {
  title: string;
  left: SummaryStat;
  right: SummaryStat;
}

interface CommandHubHeaderProps {
  /** Total number of active tasks (drives "Immediate Focus" and "To-Do Action Items"). */
  taskCount?: number;
  /** Total number of workspaces. */
  workspaceCount?: number;
  /** Number of active workspaces. */
  activeWorkspaceCount?: number;
  /** Number of items in the execution queue. */
  executionQueue?: number;
  /** Number of items in the pending queue. */
  pendingQueue?: number;
  /** Current workspace state label. */
  state?: string;
  /** Called when the user clicks "Run Workspace". */
  onRunWorkspace?: () => void;
  /** Called when the user clicks "Refresh". */
  onRefresh?: () => void;
  /** Called when the user submits a quick prompt via "Send". */
  onSend?: (prompt: string) => void;
}

const PILLS = [
  "1 Immediate Focus",
  "2 Workspace Progress Map",
  "3 Strategy Hub",
  "4 Execution Readiness Plan",
  "5 Availability & SLA Standards",
];

export function CommandHubHeader({
  taskCount = 0,
  workspaceCount = 1,
  activeWorkspaceCount = 1,
  executionQueue = 0,
  pendingQueue = 0,
  state = "FLUID",
  onRunWorkspace,
  onRefresh,
  onSend,
}: CommandHubHeaderProps) {
  const [prompt, setPrompt] = useState("");
  const [activePill, setActivePill] = useState(0);

  const activePct =
    workspaceCount > 0
      ? Math.round((activeWorkspaceCount / workspaceCount) * 100)
      : 0;

  const cards: SummaryCard[] = [
    {
      title: "EXECUTION",
      left: { label: "Immediate Focus", value: String(taskCount) },
      right: { label: "To-Do Action Items", value: String(taskCount) },
    },
    {
      title: "WORKSPACES",
      left: { label: "Total Workspaces", value: String(workspaceCount) },
      right: {
        label: "Active",
        value: `${activeWorkspaceCount} (${activePct}%)`,
      },
    },
    {
      title: "QUEUE",
      left: { label: "Execution Queue", value: String(executionQueue) },
      right: { label: "Pending Queue", value: String(pendingQueue) },
    },
    {
      title: "SUMMARY",
      left: { label: "Priority Ratio", value: String(taskCount) },
      right: { label: "State", value: state },
    },
  ];

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.info("Enter a prompt first");
      return;
    }
    onSend?.(trimmed);
    setPrompt("");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hero section */}
      <div className="flex items-center gap-4 rounded-2xl border border-border-muted bg-surface-2/95 p-5 shadow-card">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-900/80 text-teal-100 shadow-glow-primary">
          <MLogo className="h-7 w-7" />

        </div>
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl">
            Welcome to the Command Hub
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Your AI team is standing by to assist with strategy, execution,
            operations, and real-time task management.
          </p>
        </div>
      </div>

      {/* Workspace bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-text-primary">
          <span className="shrink-0 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-accent-primary">
            Workspace:
          </span>
          <select
            value="default"
            onChange={() => {}}
            className="min-w-0 flex-1 cursor-pointer rounded-xl border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-primary focus:shadow-glow-primary"
          >
            <option value="default">
              Workspace - Marina AI Command Hub (Default: Default)
            </option>
          </select>
        </label>
        <Button variant="primary" onClick={onRunWorkspace}>
          Run Workspace
        </Button>
      </div>

      {/* Filter pills row */}
      <div className="flex flex-wrap gap-2">
        {PILLS.map((pill, i) => (
          <button
            key={pill}
            type="button"
            onClick={() => setActivePill(i)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
              activePill === i
                ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary shadow-glow-primary"
                : "border-border-muted bg-surface-2 text-text-secondary hover:border-accent-primary/40 hover:text-text-primary",
            )}
          >
            {pill}
          </button>
        ))}
      </div>

      {/* 4-card summary grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card"
          >
            <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-accent-primary">
              {card.title}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-text-secondary">
                  {card.left.label}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold text-text-primary">
                  {card.left.value}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs text-text-secondary">
                  {card.right.label}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold text-text-primary">
                  {card.right.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick prompt row */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card sm:flex-row sm:items-center">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Type a quick prompt or command for your workspace team..."
          className="min-w-0 flex-1 rounded-xl border border-border-muted bg-white/3 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-primary focus:shadow-glow-primary"
        />
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="primary"
            className="bg-gradient-to-br from-fuchsia-600 to-pink-600 border-fuchsia-500/50"
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
