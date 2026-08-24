import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ============================================================
   Generic Panel
   Reusable surface with a title, optional subtitle, a list of
   items (label + status + optional action buttons), and an
   optional progress bar / metric display.
   ============================================================ */

export type PanelStatusTone =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

const STATUS_TONE: Record<PanelStatusTone, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/30",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30",
  error: "bg-status-error/10 text-status-error border-status-error/30",
  info: "bg-accent-primary/10 text-accent-primary border-accent-primary/30",
  neutral: "bg-surface-3 text-text-secondary border-border-muted",
};

/** A single row inside a panel: label, optional status tag, optional action. */
export interface PanelItem {
  id: string;
  label: string;
  /** Optional small line under the label, e.g. a step-flow indicator while running. */
  subLabel?: ReactNode;
  status?: string;
  statusTone?: PanelStatusTone;
  action?: ReactNode;
}

interface PanelProps {
  title: string;
  subtitle?: string;
  items: PanelItem[];
  /** Optional progress value 0–100 rendered as a bar. */
  progress?: number;
  /** Optional metric label shown next to the progress bar. */
  progressLabel?: string;
  className?: string;
  /** Optional DOM id used as an in-page anchor target. */
  id?: string;
}

export function Panel({
  title,
  subtitle,
  items,
  progress,
  progressLabel,
  className,
  id,
}: PanelProps) {
  return (
    <div
      id={id}
      className={cn(
        "flex flex-col rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card",
        className,
      )}
    >
      {/* Header */}
      <div className="mb-3">
        <h3 className="m-0 text-[0.95rem] font-bold text-text-primary">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>

      {/* Optional progress bar */}
      {typeof progress === "number" && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-text-secondary">
              {progressLabel ?? "Progress"}
            </span>
            <span className="font-semibold text-accent-primary">
              {progress}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {/* Item list */}
      <ul className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border-muted p-3 text-center text-xs text-text-muted">
            No items.
          </li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-3/60 p-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-primary">
                  {item.label}
                </span>
                {item.subLabel && (
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-accent-primary/80">
                    {item.subLabel}
                  </span>
                )}
              </span>
              {item.status && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    STATUS_TONE[item.statusTone ?? "neutral"],
                  )}
                >
                  {item.status}
                </span>
              )}
              {item.action && <span className="shrink-0">{item.action}</span>}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
