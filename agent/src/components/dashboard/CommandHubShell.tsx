import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Home,
  Sparkles,
  Database,
  FileText,
  Zap,
  Puzzle,
  Settings,
  Send,
  Paperclip,
  BarChart3,
  Lock,
  Minus,
  ArrowUpRight,
  Sparkle,
  Code2,
  Network,
  ListChecks,
  ShieldCheck,
  LayoutDashboard,
  HeartPulse,
  Cpu,
} from "lucide-react";
import { sendChat } from "@/lib/api";
import type { ViewId } from "@/components/dashboard/Sidebar";

/* ────────────────────────────────────────────────────────────
   Command Hub — Blended UI (obsidian command center)
   Left rail · Center workspace · Right "COMMAND AI" panel
   All tools wired to real Command Hub views. No mock data.
   ──────────────────────────────────────────────────────────── */

const TOOLS: {
  id: string;
  title: string;
  desc: string;
  icon: typeof Code2;
  view: ViewId;
  tag: string;
}[] = [
  {
    id: "codegen",
    title: "CODE GENERATION",
    desc: "Scaffold projects and generate code from a spec.",
    icon: Code2,
    view: "codegen",
    tag: "Build",
  },
  {
    id: "docgen",
    title: "DOCUMENTS",
    desc: "Create .docx, .xlsx, .pdf and slide decks.",
    icon: FileText,
    view: "docgen",
    tag: "Create",
  },
  {
    id: "agents",
    title: "AGENT TOOLS",
    desc: "Memory, email, Slack, image-gen and agent bus.",
    icon: Network,
    view: "agents",
    tag: "Automate",
  },
  {
    id: "tasks",
    title: "TASK HUB",
    desc: "Plan, queue and track autonomous runs.",
    icon: ListChecks,
    view: "tasks",
    tag: "Plan",
  },
  {
    id: "approvals",
    title: "APPROVALS",
    desc: "Review and approve high-risk actions.",
    icon: ShieldCheck,
    view: "approvals",
    tag: "Review",
  },
  {
    id: "integrations",
    title: "INTEGRATIONS",
    desc: "Connect tools, providers and services.",
    icon: Puzzle,
    view: "integrations",
    tag: "Connect",
  },
];

const NAV: {
  id: string;
  label: string;
  icon: typeof Home;
  view?: ViewId;
}[] = [
  { id: "home", label: "Home", icon: Home, view: "home" },
  { id: "tools", label: "AI Tools", icon: Sparkles, view: "agents" },
  { id: "data", label: "Data", icon: Database, view: "dashboard" },
  { id: "reports", label: "Reports", icon: FileText, view: "docgen" },
  { id: "automations", label: "Automations", icon: Zap, view: "automations" },
  { id: "integrations", label: "Integrations", icon: Puzzle, view: "integrations" },
  { id: "models", label: "LLM Hub", icon: Cpu, view: "models" },
  { id: "system", label: "System", icon: HeartPulse, view: "system" },
  { id: "settings", label: "Settings", icon: Settings, view: "security" },
];

const SUGGESTED = [
  "Scaffold a new project",
  "Create a document",
  "Run an agent task",
  "Summarize my workspace",
];

interface ChatMsg {
  id: string;
  type: "user" | "system";
  text: string;
}

export interface CommandHubShellProps {
  onNavigate: (view: ViewId) => void;
  onOpenFullDashboard: () => void;
}

export function CommandHubShell({
  onNavigate,
  onOpenFullDashboard,
}: CommandHubShellProps) {
  const [activeNav, setActiveNav] = useState("home");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    });
  }, []);

  const runChat = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, type: "user", text: message },
      ]);
      setInput("");
      setSending(true);
      scrollToBottom();
      try {
        const res = await sendChat(message, true);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            type: "system",
            text: res.reply || "Task processed.",
          },
        ]);
        toast.success("Task processed");
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            type: "system",
            text: `Error: ${
              err instanceof Error ? err.message : "Failed to process prompt."
            }`,
          },
        ]);
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [sending, scrollToBottom],
  );

  const renderHome = () => (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background:linear-gradient(rgba(0,214,208,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,208,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
        <h1 className="text-3xl font-extrabold uppercase tracking-wide text-text-primary sm:text-4xl">
          Your Command Hub, In One Place
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">
          AI command center for your workflows
        </p>
      </div>

      {/* One-click tools */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-accent-primary">
            One-click tools
          </h2>
          <span className="h-px flex-1 bg-gradient-to-r from-accent-primary/40 to-transparent" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.view)}
                className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-muted bg-surface-3 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-primary/40 hover:shadow-glow-primary"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-accent-primary/25 bg-surface-2 text-accent-primary shadow-glow-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="rounded-md border border-border-muted bg-surface-2 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent-secondary">
                      {tool.tag}
                    </span>
                  </div>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-secondary text-white opacity-90 transition-all group-hover:scale-110 group-hover:opacity-100">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-1">
                  <div className="text-sm font-bold uppercase tracking-wide text-text-primary">
                    {tool.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-text-secondary">
                    {tool.desc}
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-accent-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open tool
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Command composer */}
      <section className="relative overflow-hidden rounded-2xl border border-accent-primary/40 bg-surface-3/80 p-5 shadow-glow-primary">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent-primary/50 bg-surface-2">
            <Sparkle className="h-5 w-5 text-accent-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-text-primary">
              What would you like to get done?
            </h3>
            <p className="mt-0.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-accent-secondary">
              Ask Command Hub anything
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => runChat(s)}
                  className="rounded-full border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => runChat(input || SUGGESTED[0])}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-secondary text-white shadow-glow-secondary transition-transform hover:scale-105"
          >
            <ArrowUpRight className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-[0.65rem] text-text-muted">
          <Lock className="h-3 w-3" />
          AI responses may be inaccurate. Verify important information.
        </div>
      </section>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-2rem)] gap-4">
      {/* Left navigation rail */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 rounded-2xl border border-border-muted bg-surface-2/80 p-3 md:flex">
        <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20">
            <Sparkle className="h-4 w-4 text-accent-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold uppercase tracking-wide text-text-primary">
              Command
            </div>
            <div className="text-sm font-extrabold uppercase tracking-wide text-text-primary">
              Hub
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveNav(item.id);
                  if (item.view && item.view !== "home") onNavigate(item.view);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border border-accent-primary/40 bg-surface-4 text-accent-primary shadow-glow-primary"
                    : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-border-muted bg-surface-3 p-3">
          <div className="flex items-center gap-1.5 text-[0.7rem] text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            All systems active
          </div>
        </div>
      </aside>

      {/* Center workspace */}
      <main className="min-w-0 flex-1">{renderHome()}</main>

      {/* Right COMMAND AI panel */}
      {chatOpen && (
        <aside className="flex w-[320px] shrink-0 flex-col rounded-2xl border border-border-muted bg-surface-2/90 shadow-card">
          <div className="flex items-center justify-between border-b border-border-muted p-4">
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-accent-primary" />
              <div className="leading-tight">
                <div className="text-sm font-bold uppercase tracking-wide text-accent-primary">
                  Command AI
                </div>
                <div className="text-[0.65rem] text-text-secondary">
                  Your AI co-pilot for getting things done.
                </div>
              </div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary hover:text-text-primary"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={messagesRef}
            className="flex-1 space-y-3 overflow-y-auto p-4"
            style={{ maxHeight: "calc(100vh - 20rem)" }}
          >
            {messages.length === 0 && (
              <div className="rounded-xl border border-border-muted bg-surface-3 p-3 text-sm text-text-secondary">
                Ask anything or pick a tool to get started.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${
                  m.type === "user"
                    ? "ml-auto border-accent-secondary/40 bg-accent-secondary text-white"
                    : "border-border-muted bg-surface-3 text-text-primary"
                }`}
              >
                {m.text}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="h-3 w-3 animate-spin rounded-full border border-accent-primary border-t-transparent" />
                Command AI is thinking…
              </div>
            )}
          </div>

          <div className="border-t border-border-muted p-3">
            <div className="flex items-center gap-2 rounded-lg border border-accent-primary/40 bg-surface-3 px-3 py-2 shadow-glow-primary">
              <Sparkle className="h-4 w-4 shrink-0 text-accent-primary" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runChat(input);
                }}
                placeholder="Ask anything or give a command..."
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              <button
                onClick={() => runChat(input)}
                disabled={sending}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-secondary text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-muted">
                <Paperclip className="h-3.5 w-3.5" />
                <BarChart3 className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1 text-[0.6rem] text-text-muted">
                <Lock className="h-2.5 w-2.5" />
                AI responses may be inaccurate. Verify important information.
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Mobile fallback: open full dashboard */}
      <button
        onClick={onOpenFullDashboard}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-accent-primary/40 bg-surface-3 px-4 py-2 text-sm font-semibold text-accent-primary shadow-glow-primary md:hidden"
      >
        <LayoutDashboard className="h-4 w-4" />
        Full Dashboard
      </button>
    </div>
  );
}
