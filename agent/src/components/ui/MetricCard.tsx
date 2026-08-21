import { cn } from "@/lib/utils";
import type { MetricStat } from "@/types";

export interface MetricCardProps {
  metric: MetricStat;
  /** Accent color for the value. */
  accent?: "primary" | "secondary";
  className?: string;
}

/** A compact stat card showing a single live metric value. */
export function MetricCard({ metric, accent = "primary", className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-border-muted bg-white/2 p-3 text-center transition-colors hover:border-border-strong",
        className,
      )}
    >
      <span
        className={cn(
          "text-lg font-bold",
          accent === "primary" ? "text-accent-primary" : "text-accent-secondary",
        )}
      >
        {metric.value}
        {metric.unit}
      </span>
      <span className="text-[0.68rem] uppercase tracking-wider text-text-secondary">
        {metric.label}
      </span>
    </div>
  );
}
