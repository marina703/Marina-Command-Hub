import { Moon, Sun, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui";

export interface TopNavProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onRunTasks: () => void;
  online: boolean;
}

export function TopNav({
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onRunTasks,
  online,
}: TopNavProps) {
  return (
    <header className="sticky top-3 z-20 mb-4 flex items-center justify-between gap-4 rounded-2xl border border-border-strong/40 bg-surface-2/75 px-4 py-3 shadow-card backdrop-blur-xl">
      <div className="min-w-0">
        <p className="mb-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-accent-primary">
          Marina AI Command Hub
        </p>
        <h1 className="m-0 text-lg font-bold text-text-primary sm:text-xl">
          Centralized Workspace
        </h1>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Command palette trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden items-center gap-2 rounded-xl border border-border-muted bg-white/3 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 sm:flex"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span>Search…</span>
          <kbd className="rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 text-[0.65rem] font-semibold text-text-secondary">
            ⌘K
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <StatusBadge
          tone={online ? "success" : "error"}
          label={online ? "Online" : "Offline"}
          dot
          pulse={online}
        />

        <Button variant="primary" onClick={onRunTasks}>
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">Run Workspace Tasks</span>
          <span className="sm:hidden">Run</span>
        </Button>
      </div>
    </header>
  );
}
