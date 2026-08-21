import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  Trash2,
  Pause,
  Play,
  Copy,
  Download,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, Button, Select, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { LogEntry } from "@/types";

export type LogLevel = "all" | "info" | "warning" | "error" | "success";

export interface SystemLogViewerProps {
  logs: LogEntry[];
  /** Whether the stream is actively receiving new logs. */
  streaming: boolean;
  onToggleStream: () => void;
  onClear: () => void;
}

const LEVEL_OPTIONS = [
  { value: "all", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
];

/**
 * Virtualized system log terminal with real-time filtering, search,

 * pause/resume, clear, copy, and JSON export. Uses TanStack Virtual
 * to handle large log streams without performance degradation.
 */
export function SystemLogViewer({
  logs,
  streaming,
  onToggleStream,
  onClear,
}: SystemLogViewerProps) {
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState<LogLevel>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return logs.filter((log) => {
      if (level !== "all" && log.level !== level) return false;
      if (q && !log.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, filter, level]);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  const handleCopyAll = async () => {
    const text = filteredLogs.map((l) => `[${l.level}] ${l.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Logs copied to clipboard");
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marina-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs exported to JSON");
  };

  return (
    <Card className="flex flex-col p-4">
      <CardHeader
        eyebrow="ACTIVITY"
        title="System Log"
        description="Real-time autonomous actions, config changes, and system events."
        actions={
          <StatusBadge
            tone={streaming ? "success" : "warning"}
            label={streaming ? "Streaming" : "Paused"}
            dot
            pulse={streaming}
          />
        }
      />

      {/* Filter bar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs…"
            className="w-full rounded-xl border border-border-muted bg-white/3 py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-primary focus:shadow-glow-primary"
            aria-label="Filter logs"
          />
        </div>
        <Select
          options={LEVEL_OPTIONS}
          value={level}
          onChange={(e) => setLevel(e.target.value as LogLevel)}
          className="sm:w-40"
          aria-label="Log level"
        />
      </div>

      {/* Log controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onToggleStream}>
          {streaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {streaming ? "Pause" : "Resume"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopyAll}>
          <Copy className="h-3.5 w-3.5" />
          Copy All
        </Button>
        <Button variant="ghost" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </Button>
        <span className="ml-auto text-xs text-text-secondary">
          {filteredLogs.length} entries
        </span>
      </div>

      {/* Virtualized log window */}
      <div
        ref={parentRef}
        className="h-72 overflow-y-auto rounded-xl border border-border-muted bg-surface-1/80"
        role="log"
        aria-live="polite"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <Terminal className="h-6 w-6" />
            <p className="text-xs">No log entries match the current filter.</p>
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const log = filteredLogs[virtualRow.index];
              return (
                <div
                  key={log.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border-muted/50 px-3 py-2"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      log.level === "error" && "bg-status-error",
                      log.level === "warning" && "bg-status-warning",
                      log.level === "success" && "bg-status-success",
                      log.level === "info" && "bg-status-info",
                    )}
                  />
                  <span className="shrink-0 text-[0.68rem] font-semibold uppercase text-text-muted">
                    {log.level}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
