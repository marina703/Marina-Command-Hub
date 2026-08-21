import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface ErrorBoundaryProps {
  /** Human-readable name of the section being guarded. */
  label: string;
  children: ReactNode;
  /** Optional custom fallback UI. */
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * React Error Boundary with a graceful fallback card. Wraps key
 * components (Log Terminal, Metric Charts, etc.) so a runtime error
 * in one section never crashes the whole dashboard.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || "Something went wrong." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-status-error/40 bg-status-error/5 p-8 text-center"
        >
          <AlertTriangle className="h-8 w-8 text-status-error" aria-hidden="true" />
          <div>
            <p className="m-0 text-sm font-semibold text-text-primary">
              {this.props.label} encountered an error
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {this.state.message}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-accent-primary/50 hover:text-accent-primary"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
