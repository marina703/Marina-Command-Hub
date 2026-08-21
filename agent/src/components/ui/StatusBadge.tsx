import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusBadgeProps {
  tone?: StatusTone;
  label: string;
  /** Show a small colored dot before the label. */
  dot?: boolean;
  /** Pulsing animation for live/streaming states. */
  pulse?: boolean;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/40",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/40",
  error: "bg-status-error/10 text-status-error border-status-error/40",
  info: "bg-status-info/10 text-status-info border-status-info/40",
  neutral: "bg-white/3 text-text-secondary border-border-muted",
};

const dotClasses: Record<StatusTone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  info: "bg-status-info",
  neutral: "bg-text-muted",
};

/** A pill-shaped status indicator with optional dot and pulse. */
export function StatusBadge({
  tone = "neutral",
  label,
  dot = false,
  pulse = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            dotClasses[tone],
            pulse && "animate-pulse",
          )}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}
