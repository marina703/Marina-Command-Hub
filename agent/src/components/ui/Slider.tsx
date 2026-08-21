import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Formatter for the displayed value (e.g. temperature → 0.72). */
  format?: (value: number) => string;
  /** Called on every input change (debounced upstream if needed). */
  onChange: (value: number) => void;
  className?: string;
}

/**
 * Custom-styled range slider with a live value tooltip and a filled
 * progress track. The `onChange` callback is invoked on every input
 * event; consumers can debounce it to avoid excessive re-renders.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  className,
}: SliderProps) {
  const [dragging, setDragging] = useState(false);

  const progress = useMemo(
    () => ((value - min) / (max - min)) * 100,
    [value, min, max],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  const displayValue = format ? format(value) : String(value);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-text-secondary">{label}</label>
        <span className="relative rounded-md border border-border-muted bg-white/3 px-2 py-0.5 text-xs font-semibold text-accent-primary">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onBlur={() => setDragging(false)}
        style={{ "--slider-progress": `${progress}%` } as React.CSSProperties}
        aria-label={label}
        aria-valuetext={displayValue}
      />
      {/* Value tooltip shown while dragging */}
      <div
        className={cn(
          "pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-surface-3 px-2 py-1 text-xs font-semibold text-text-primary shadow-card transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
        style={{
          left: `calc(${progress}% + (${8 - progress * 0.16}px))`,
          top: "100%",
          marginTop: "4px",
        }}
        aria-hidden="true"
      >
        {displayValue}
      </div>
    </div>
  );
}
