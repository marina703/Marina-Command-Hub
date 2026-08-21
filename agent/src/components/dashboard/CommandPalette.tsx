import { useEffect, useState } from "react";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Bot,
  ListChecks,
  Globe,
  Cpu,
  HeartPulse,
  Search,
  Settings,
  FileText,
} from "lucide-react";
import type { ViewId } from "./Sidebar";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: ViewId) => void;
  onRunTasks: () => void;
  onExportLogs: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  keywords: string;
  icon: React.ReactNode;
  action: () => void;
}

/**
 * Quick-command palette (Cmd+K) for rapid navigation across
 * workspaces, logs, and settings.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onRunTasks,
  onExportLogs,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");

  // Global Cmd+K / Ctrl+K shortcut.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const items: CommandItem[] = [
    {
      id: "nav-dashboard",
      label: "Go to Command Hub",
      keywords: "dashboard home overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
      action: () => onNavigate("dashboard"),
    },
    {
      id: "nav-assistant",
      label: "Open AI Assistant",
      keywords: "chat assistant ai prompt",
      icon: <Bot className="h-4 w-4" />,
      action: () => onNavigate("assistant"),
    },
    {
      id: "nav-tasks",
      label: "Open Task Hub",
      keywords: "tasks queue work",
      icon: <ListChecks className="h-4 w-4" />,
      action: () => onNavigate("tasks"),
    },
    {
      id: "nav-projects",
      label: "View Projects",
      keywords: "projects websites sites",
      icon: <Globe className="h-4 w-4" />,
      action: () => onNavigate("projects"),
    },
    {
      id: "nav-models",
      label: "Open LLM Hub",
      keywords: "models llm ollama gemini",
      icon: <Cpu className="h-4 w-4" />,
      action: () => onNavigate("models"),
    },
    {
      id: "nav-system",
      label: "System Health",
      keywords: "system health metrics cpu",
      icon: <HeartPulse className="h-4 w-4" />,
      action: () => onNavigate("system"),
    },
    {
      id: "action-run",
      label: "Run Workspace Tasks",
      keywords: "run execute tasks autonomous",
      icon: <Settings className="h-4 w-4" />,
      action: onRunTasks,
    },
    {
      id: "action-export",
      label: "Export System Logs",
      keywords: "export logs json download",
      icon: <FileText className="h-4 w-4" />,
      action: onExportLogs,
    },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[15vh] backdrop-blur-sm"
      overlayClassName="fixed inset-0"
      contentClassName="w-full max-w-lg overflow-hidden rounded-2xl border border-border-strong bg-surface-2 shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-border-muted px-4 py-3">
        <Search className="h-4 w-4 text-text-muted" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search commands, views, settings…"
          className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <kbd className="rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 text-[0.65rem] font-semibold text-text-secondary">
          ESC
        </kbd>
      </div>

      <Command.List className="max-h-72 overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-text-muted">
          No results found.
        </Command.Empty>

        <Command.Group heading="Navigation" className="text-[0.68rem] font-semibold uppercase tracking-wider text-text-secondary">
          {items.slice(0, 6).map((item) => (
            <Command.Item
              key={item.id}
              value={item.label}
              keywords={[item.keywords]}
              onSelect={() => {
                item.action();
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary transition-colors data-[selected=true]:bg-accent-primary/10 data-[selected=true]:text-accent-primary"
            >
              {item.icon}
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions" className="text-[0.68rem] font-semibold uppercase tracking-wider text-text-secondary">
          {items.slice(6).map((item) => (
            <Command.Item
              key={item.id}
              value={item.label}
              keywords={[item.keywords]}
              onSelect={() => {
                item.action();
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-primary transition-colors data-[selected=true]:bg-accent-primary/10 data-[selected=true]:text-accent-primary"
            >
              {item.icon}
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
