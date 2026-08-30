import {
  Home,
  LayoutDashboard,
  Bot,
  ListChecks,
  ShieldCheck,
  Code2,
  FileText,
  Network,
  Globe,
  RefreshCw,
  Cpu,
  HeartPulse,
  Settings2,
  Puzzle,
  Zap,
  type LucideIcon,
} from "lucide-react";

/* ============================================================
   View registry
   Single source of truth for every navigable view: id, label,
   icon, nav group and the header copy used by the shell.
   ============================================================ */

export type ViewId =
  | "home"
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
  | "automations"
  | "codegen"
  | "docgen"
  | "agents";

export type ViewGroup = "Workspace" | "Create" | "Intelligence" | "System";

export interface ViewDef {
  id: ViewId;
  /** Short label shown in the nav rail. */
  label: string;
  icon: LucideIcon;
  group: ViewGroup;
  /** Display title rendered in the workspace header. */
  title: string;
  /** Subtitle rendered under the header title. */
  description: string;
  /** Hidden views are reachable by navigation but not listed in the rail. */
  hidden?: boolean;
}

export const VIEWS: ViewDef[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    group: "Workspace",
    title: "Your Command Hub, In One Place",
    description: "AI command center for your workflows",
  },
  {
    id: "dashboard",
    label: "Command Hub",
    icon: LayoutDashboard,
    group: "Workspace",
    title: "Command Hub",
    description: "Workspace overview, playbooks and live telemetry",
  },
  {
    id: "assistant",
    label: "AI Assistant",
    icon: Bot,
    group: "Workspace",
    title: "AI Assistant",
    description: "Chat with your AI team",
  },
  {
    id: "tasks",
    label: "Task Hub",
    icon: ListChecks,
    group: "Workspace",
    title: "Task Hub",
    description: "Plan, queue and track autonomous runs",
  },
  {
    id: "taskDetail",
    label: "Task Detail",
    icon: ListChecks,
    group: "Workspace",
    title: "Task Detail",
    description: "Full breakdown of the selected task",
    hidden: true,
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: ShieldCheck,
    group: "Workspace",
    title: "Approvals",
    description: "Review and approve high-risk actions",
  },
  {
    id: "codegen",
    label: "Code Generation",
    icon: Code2,
    group: "Create",
    title: "Code Generation",
    description: "Scaffold projects and generate code from a spec",
  },
  {
    id: "docgen",
    label: "Documents",
    icon: FileText,
    group: "Create",
    title: "Documents",
    description: "Create .docx, .xlsx, .pdf and slide decks",
  },
  {
    id: "agents",
    label: "Agent Tools",
    icon: Network,
    group: "Create",
    title: "Agent Tools",
    description: "Memory, email, Slack, image-gen and agent bus",
  },
  {
    id: "projects",
    label: "Projects",
    icon: Globe,
    group: "Intelligence",
    title: "Projects",
    description: "Websites and deployed properties",
  },
  {
    id: "geminiSync",
    label: "Gemini Sync",
    icon: RefreshCw,
    group: "Intelligence",
    title: "Gemini Sync",
    description: "Push chat history into Gemini context",
  },
  {
    id: "models",
    label: "LLM Hub",
    icon: Cpu,
    group: "Intelligence",
    title: "LLM Hub",
    description: "Configure providers and models",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Puzzle,
    group: "System",
    title: "Integrations",
    description: "Connect tools, providers and services",
  },
  {
    id: "automations",
    label: "Automations",
    icon: Zap,
    group: "System",
    title: "Automations",
    description: "Scheduled durable workflows",
  },
  {
    id: "system",
    label: "System Health",
    icon: HeartPulse,
    group: "System",
    title: "System Health",
    description: "Live metrics and service status",
  },
  {
    id: "security",
    label: "Settings",
    icon: Settings2,
    group: "System",
    title: "Settings & Security",
    description: "Keys, audit log and access control",
  },
];

export const VIEW_GROUPS: ViewGroup[] = [
  "Workspace",
  "Create",
  "Intelligence",
  "System",
];

/** Look up a view definition by id (falls back to home). */
export function getView(id: ViewId): ViewDef {
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}
