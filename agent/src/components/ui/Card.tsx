import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Base surface card with consistent border, radius, and shadow. */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-strong/30 bg-surface-2/75 backdrop-blur-md shadow-card transition-all duration-200 hover:border-accent-primary/40",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Standardized panel header with eyebrow, title, description, and actions. */
export function CardHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "mb-3 flex items-start justify-between gap-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-accent-primary">
            {eyebrow}
          </p>
        )}
        <h3 className="m-0 text-[0.95rem] font-bold text-text-primary">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardBody({ className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
}
