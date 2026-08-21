import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-accent-primary-soft to-accent-secondary-soft border border-accent-primary/40 text-text-primary shadow-glow-primary hover:-translate-y-px hover:shadow-glow-primary/80",
  ghost:
    "bg-white/2 border border-border-muted text-text-primary hover:-translate-y-px hover:bg-white/5",
  outline:
    "bg-transparent border border-border-strong text-text-primary hover:border-accent-primary/50 hover:text-accent-primary",
  danger:
    "bg-status-error/10 border border-status-error/40 text-status-error hover:bg-status-error/20",
  success:
    "bg-status-success/10 border border-status-success/40 text-status-success hover:bg-status-success/20",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-5 py-2.5 text-sm rounded-xl",
  icon: "p-2 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "ghost", size = "md", loading, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
