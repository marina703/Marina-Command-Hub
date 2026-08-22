import { useState } from "react";
import {
  LayoutDashboard,
  Bot,
  ListChecks,
  Globe,
  RefreshCw,
  Cpu,
  HeartPulse,
  Lock,
  ChevronDown,
  ShieldCheck,
  Settings2,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardState } from "@/types";

export type ViewId =
  | "dashboard"
  | "assistant"
  | "tasks"
  | "taskDetail"
  | "approvals"
  | "projects"
  | "geminiSync"
  | "models"
  | "system"
  | "security"
  | "integrations"
  | "automations";

export interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onLock: () => void;
  data: DashboardState | null;
}

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Command Hub", icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: "assistant", label: "AI Assistant", icon: <Bot className="h-4 w-4" /> },
      { id: "tasks", label: "Task Hub", icon: <ListChecks className="h-4 w-4" /> },
      { id: "approvals", label: "Approvals", icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
  {
    label: "Websites",
    items: [
      { id: "projects", label: "ignitix.online", icon: <Globe className="h-4 w-4" /> },
      { id: "projects", label: "pyroprep.academy", icon: <Globe className="h-4 w-4" /> },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "integrations", label: "Tools & Integrations", icon: <Wrench className="h-4 w-4" /> },
      { id: "geminiSync", label: "Gemini Sync", icon: <RefreshCw className="h-4 w-4" /> },
      { id: "models", label: "LLM Hub", icon: <Cpu className="h-4 w-4" /> },
      { id: "system", label: "System Health", icon: <HeartPulse className="h-4 w-4" /> },
      { id: "security", label: "Settings & Security", icon: <Settings2 className="h-4 w-4" /> },
    ],
  },
];

function QuickStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "teal" | "pink";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl border bg-white/2 p-2.5",
        accent === "teal" ? "border-accent-primary/30" : "border-accent-secondary/30",
      )}
    >
      <span className="text-lg font-extrabold text-text-primary">{value}</span>
      <span className="text-[0.62rem] uppercase tracking-wider text-text-secondary">
        {label}
      </span>
    </div>
  );
}

export function Sidebar({ activeView, onNavigate, onLock, data }: SidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Workspace: true,
    Websites: true,
    Integrations: true,
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const quickStats = data?.quickStats ?? [];

  return (
    <aside className="sticky top-3 flex h-[calc(100vh-1.5rem)] w-56 shrink-0 flex-col gap-3.5 rounded-2xl border border-border-muted bg-surface-2/95 p-3 shadow-card backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1 pt-0.5">
        <div className="grid h-8 w-8 place-items-center rounded-xl border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 font-extrabold text-accent-primary shadow-glow-primary">
          M
        </div>
        <div>
          <div className="text-[0.85rem] font-extrabold uppercase tracking-widest text-text-primary">
            Marina AI
          </div>
          <small className="text-[0.7rem] uppercase tracking-widest text-text-secondary">
            Command Hub
          </small>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2">
        {NAV_GROUPS.map((group) => (
          <div
            key={group.label}
            className="overflow-hidden rounded-xl border border-border-muted bg-white/1.5"
          >
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex w-full items-center justify-between px-2.5 py-2 text-[0.72rem] font-semibold uppercase tracking-widest text-text-secondary transition-colors hover:text-accent-primary"
              aria-expanded={openGroups[group.label]}
            >
              {group.label}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  openGroups[group.label] ? "rotate-180" : "",
                )}
              />
            </button>
            {openGroups[group.label] && (
              <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
                {group.items.map((item, idx) => {
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={`${item.label}-${idx}`}
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.78rem] transition-all duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60",
                        isActive
                          ? "border border-accent-primary/40 bg-accent-primary/5 text-text-primary shadow-glow-primary"
                          : "border border-transparent text-text-secondary hover:border-accent-primary/30 hover:text-text-primary",
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2">
        {quickStats.length > 0 ? (
          quickStats.map((stat) => (
            <QuickStat
              key={stat.label}
              label={stat.label}
              value={stat.value}
              accent={stat.accent}
            />
          ))
        ) : (
          <>
            <QuickStat label="Active Tasks" value="—" accent="teal" />
            <QuickStat label="AI Calls" value="—" accent="pink" />
            <QuickStat label="Deployments" value="—" accent="teal" />
            <QuickStat label="Alerts" value="—" accent="pink" />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center gap-2 border-t border-border-muted px-1 pt-2">
        <div className="grid h-6 w-6 place-items-center rounded-full border border-accent-secondary/45 bg-gradient-to-br from-accent-secondary/20 to-accent-primary/20 text-[0.75rem] font-bold shadow-glow-secondary">
          M
        </div>
        <div className="flex flex-col">
          <strong className="text-[0.75rem] text-text-primary">Command Hub Online</strong>
          <small className="text-[0.68rem] text-text-secondary">Zero window-switching</small>
        </div>
        <button
          onClick={onLock}
          title="Lock Hub"
          aria-label="Lock Hub"
          className="ml-auto rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
        >
          <Lock className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
