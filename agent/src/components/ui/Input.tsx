import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "w-full rounded-xl border border-border-muted bg-white/3 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors",
          "placeholder:text-text-muted",
          "focus:border-accent-primary focus:shadow-glow-primary",
          className,
        )}
        {...props}
      />
    </div>
  ),
);

Input.displayName = "Input";
