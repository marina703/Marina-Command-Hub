import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Home,
  Briefcase,
  Sparkles,
  Database,
  FileText,
  Zap,
  Puzzle,
  Settings,
  Building2,
  ChevronDown,
  Send,
  Paperclip,
  BarChart3,
  Lock,
  Minus,
  ArrowUpRight,
  Sparkle,
  Mail,
  Megaphone,
  ClipboardList,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { sendChat } from "@/lib/api";

/* ────────────────────────────────────────────────────────────
   Command Hub — Blended UI (obsidian command center)
   Left rail · Center workspace · Right "COMMAND AI" panel
   ──────────────────────────────────────────────────────────── */

const CATEGORIES = ["Retail", "Agency", "Finance", "Healthcare", "Services"];

const TOOLS = [
  {
    id: "email",
    title: "DRAFT EMAIL",
    desc: "Create professional, on-brand emails in seconds.",
    icon: Mail,
    prompt: "Draft a professional email for my business.",
  },
  {
    id: "quote",
    title: "BUILD QUOTE",
    desc: "Generate accurate, branded quotes instantly.",
    icon: FileText,
    prompt: "Build a detailed quote for a client project.",
  },
  {
    id: "campaign",
    title: "PLAN CAMPAIGN",
    desc: "Strategize and launch high-impact campaigns.",
    icon: Megaphone,
    prompt: "Plan a high-impact marketing campaign.",
  },
  {
    id: "meeting",
    title: "SUMMARIZE MEETING",
    desc: "Extract key takeaways and action items.",
    icon: ClipboardList,
    prompt: "Summarize the meeting and list key action items.",
  },
  {
    id: "leads",
    title: "TRACK LEADS",
    desc: "Monitor leads and follow-ups in real time.",
    icon: Users,
    prompt: "Track my leads and suggest follow-ups.",
  },
  {
    id: "report",
    title: "GENERATE REPORT",
    desc: "Turn data into clear, actionable reports.",
    icon: BarChart3,
    prompt: "Generate a clear, actionable business report.",
  },
];

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "tools", label: "AI Tools", icon: Sparkles },
  { id: "data", label: "Data", icon: Database },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "automations", label: "Automations", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "settings", label: "Settings", icon: Settings },
];

const SUGGESTED = [
  "Write a follow-up email",
  "Create a Q2 marketing plan",
  "Analyze lead performance",
  "Summarize this week",
];

interface ChatMsg {
  id: string;
  type: "user" | "system";
  text: string;
}

export interface CommandHubShellProps {
  onOpenFullDashboard: () => void;
  onOpenTools: () => void;
}

export function CommandHubShell({
  onOpenFullDashboard,
  onOpenTools,
}: CommandHubShellProps) {
  const [category, setCategory] = useState(CATEGORIES[0]);
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

  const handleTool = (tool: (typeof TOOLS)[number]) => {
    setChatOpen(true);
    void runChat(`${tool.prompt} (business category: ${category})`);
  };

  const renderHome = () => (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background:linear-gradient(rgba(0,214,208,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,208,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold uppercase tracking-wide text-text-primary sm:text-4xl">
              Your Business, In One Place
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">
              AI command center for growing businesses
            </p>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-3 px-3 py-2 text-sm text-text-primary transition-colors hover:border-accent-primary/40">
            <Building2 className="h-4 w-4 text-accent-primary" />
            <span>Acme Partners</span>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-muted bg-surface-3/70 p-1.5">
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`relative flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-surface-4 text-accent-primary shadow-glow-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {c}
              {active && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent-primary" />
              )}
            </button>
          );
        })}
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
                onClick={() => handleTool(tool)}
                className="group flex flex-col gap-3 rounded-xl border border-border-muted bg-surface-3 p-4 text-left transition-all hover:border-accent-primary/40 hover:shadow-glow-primary"
              >
                <div className="flex items-start justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-border-muted bg-surface-2 text-accent-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-secondary text-white opacity-90 transition-opacity group-hover:opacity-100">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold uppercase tracking-wide text-text-primary">
                    {tool.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-text-secondary">
                    {tool.desc}
                  </div>
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

  const renderPlaceholder = (label: string) => (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border-muted bg-surface-3/50 p-10 text-center">
      <Sparkles className="h-8 w-8 text-accent-primary" />
      <h2 className="text-lg font-bold uppercase tracking-wide text-text-primary">
        {label}
      </h2>
      <p className="max-w-sm text-sm text-text-secondary">
        This section is part of the Command Hub. Use the one-click tools or the
        AI assistant to get things done.
      </p>
      <button
        onClick={() => setActiveNav("home")}
        className="mt-2 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-2 text-sm font-semibold text-accent-primary hover:bg-accent-primary/20"
      >
        Back to Home
      </button>
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
                  if (item.id === "tools") onOpenTools();
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
          <div className="text-xs font-bold uppercase tracking-wider text-text-primary">
            Pro
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            All systems active
          </div>
        </div>
      </aside>

      {/* Center workspace */}
      <main className="min-w-0 flex-1">
        {activeNav === "home" ? (
          renderHome()
        ) : (
          renderPlaceholder(NAV.find((n) => n.id === activeNav)?.label ?? "")
        )}
      </main>

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
                  Your AI co-pilot for business execution.
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
                Good morning. Here's what's happening with your business today.
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
