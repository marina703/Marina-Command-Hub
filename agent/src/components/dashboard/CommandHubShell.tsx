import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkle,
  Send,
  Paperclip,
  BarChart3,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  X,
  Menu,
  LogOut,
  Search,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { sendChat } from "@/lib/api";
import { VIEWS, VIEW_GROUPS, getView, type ViewId } from "./views";

/* ────────────────────────────────────────────────────────────
   Command Hub Shell — universal obsidian layout
   Left rail (grouped nav) · Center workspace · Right Command AI
   Every view renders inside this shell. No mock data.
   ──────────────────────────────────────────────────────────── */

interface ChatMsg {
  id: string;
  type: "user" | "system";
  text: string;
}

export interface CommandHubShellProps {
  /** Currently active view id. */
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onOpenCommandPalette: () => void;
  online: boolean;
  onLock: () => void;
  onSignOut?: () => void;
  /** Signed-in user email for the rail footer. */
  userEmail?: string | null;
  /** Current color theme. */
  theme: "dark" | "light";
  /** Toggle between dark and light theme. */
  onToggleTheme: () => void;
  /** View content rendered in the center workspace. */
  children: React.ReactNode;
}

export function CommandHubShell({
  activeView,
  onNavigate,
  onOpenCommandPalette,
  online,
  onLock,
  onSignOut,
  userEmail,
  theme,
  onToggleTheme,
  children,
}: CommandHubShellProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatPopout, setChatPopout] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const view = getView(activeView);

  // Close the mobile drawer whenever the view changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeView]);

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

  const renderMessages = (withScrollRef = false) => (
    <div ref={withScrollRef ? messagesRef : undefined} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 20rem)" }}>
      {messages.length === 0 && <div className="rounded-xl border border-border-muted bg-surface-3/70 p-3 text-sm text-text-primary stone-surface">Ask anything or pick a tool to get started.</div>}
      {messages.map((m) => <div key={m.id} className={`max-w-[90%] rounded-lg border px-3 py-2 text-sm ${m.type === "user" ? "ml-auto border-accent-secondary/40 bg-accent-secondary text-white" : "border-border-muted bg-surface-3/70 text-text-primary stone-surface"}`}>{m.text}</div>)}
      {sending && <div className="flex items-center gap-2 text-xs text-text-muted"><span className="h-3 w-3 animate-spin rounded-full border border-accent-primary border-t-transparent" />Command AI is thinking…</div>}
    </div>
  );

  const renderComposer = () => (
    <div className="border-t border-border-muted p-3">
      <div className="flex items-center gap-2 rounded-lg border border-accent-primary/40 bg-surface-3/80 px-3 py-2 shadow-glow-primary">
        <Sparkle className="h-4 w-4 shrink-0 text-accent-primary" />
        <input aria-label="Command AI prompt" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runChat(input); }} placeholder="Ask anything or give a command..." className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
        <button onClick={() => void runChat(input)} disabled={sending || !input.trim()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-secondary text-white shadow-glow-secondary disabled:opacity-50" title="Send command" aria-label="Send command"><Send className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-muted"><Paperclip className="h-3.5 w-3.5" /><BarChart3 className="h-3.5 w-3.5" /></div>
        <div className="flex items-center gap-1 text-[0.6rem] text-text-muted"><Lock className="h-2.5 w-2.5" />AI responses may be inaccurate. Verify important information.</div>
      </div>
    </div>
  );

  const renderNavButton = (item: (typeof VIEWS)[number], collapsed: boolean) => {
    const Icon: LucideIcon = item.icon;
    const active = activeView === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${collapsed ? "justify-center px-0" : ""} ${
          active
            ? "border border-accent-primary/40 bg-accent-primary/10 text-accent-primary shadow-glow-primary"
            : "border border-transparent text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && item.label}
      </button>
    );
  };

  const renderNavGroups = (collapsed: boolean) =>
    VIEW_GROUPS.map((group) => {
      const items = VIEWS.filter((v) => v.group === group && !v.hidden);
      if (items.length === 0) return null;
      return (
        <div key={group} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-0.5 pt-2 text-[0.62rem] font-black uppercase tracking-[0.18em] text-text-muted">
              {group}
            </p>
          )}
          {collapsed && <div className="mx-auto my-1 h-px w-8 bg-border-muted" />}
          {items.map((item) => renderNavButton(item, collapsed))}
        </div>
      );
    });

  const renderRailFooter = (collapsed: boolean) => (
    <div className={`mt-auto flex flex-col gap-2 border-t border-border-muted pt-2 ${collapsed ? "items-center px-0" : "px-1"}`}>
      <div className={`flex items-center gap-1.5 text-[0.7rem] font-semibold ${collapsed ? "" : "rounded-lg border border-border-muted bg-surface-3/70 p-2.5"}`} title="System status">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-status-success shadow-[0_0_10px_rgba(67,209,122,0.95)]" : "bg-status-error shadow-[0_0_10px_rgba(242,61,120,0.95)]"}`} />
        {!collapsed && <span className={online ? "text-status-success" : "text-status-error"}>{online ? "All systems active" : "Systems offline"}</span>}
      </div>
      {!collapsed && userEmail && (
        <p className="truncate text-[0.65rem] text-text-muted" title={userEmail}>{userEmail}</p>
      )}
      <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
        <button onClick={onToggleTheme} className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted text-text-secondary transition hover:border-accent-primary/45 hover:text-accent-primary" title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <button onClick={onLock} className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted text-text-secondary transition hover:border-accent-primary/45 hover:text-accent-primary" title="Lock Hub" aria-label="Lock Hub"><Lock className="h-4 w-4" /></button>
        {onSignOut && (
          <button onClick={onSignOut} className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted text-text-secondary transition hover:border-status-error/50 hover:text-status-error" title="Sign out" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-2rem)] gap-4">
      {/* Left navigation rail (desktop) */}
      <aside className={`hidden shrink-0 flex-col gap-1 rounded-2xl border border-border-muted bg-surface-2/70 p-3 stone-surface backdrop-blur-2xl transition-[width] duration-300 md:flex ${navCollapsed ? "w-[76px]" : "w-56"}`}>
        <div className={`mb-2 flex items-center border-b border-white/10 px-1 pb-3 pt-1 ${navCollapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 shadow-glow-primary">
              <Sparkle className="h-4 w-4 text-accent-primary" />
            </div>
            {!navCollapsed && <div className="leading-tight"><div className="font-display text-sm font-black uppercase tracking-wide text-text-primary">Command</div><div className="font-display text-sm font-black uppercase tracking-wide text-text-primary">Hub</div></div>}
          </div>
          <button onClick={() => setNavCollapsed((value) => !value)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted text-text-secondary transition hover:border-accent-primary/45 hover:text-accent-primary" title={navCollapsed ? "Expand navigation" : "Collapse navigation"} aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"}>
            {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto">
          {renderNavGroups(navCollapsed)}
        </nav>

        {renderRailFooter(navCollapsed)}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 border-b border-border-muted bg-surface-1/90 px-3 py-2 backdrop-blur-xl md:hidden">
        <button onClick={() => setMobileNavOpen(true)} className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-sm font-semibold text-text-primary" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
          <span className="font-display text-xs font-black uppercase tracking-wide">Command Hub</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onOpenCommandPalette} className="grid h-9 w-9 place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-secondary" aria-label="Open command palette" title="Search (Ctrl+K)">
            <Search className="h-4 w-4" />
          </button>
          <span className={`h-2 w-2 rounded-full ${online ? "bg-status-success" : "bg-status-error"}`} aria-label={online ? "Online" : "Offline"} />
        </div>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col gap-1 overflow-y-auto border-r border-border-muted bg-surface-2 p-3 stone-surface">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 px-1 pb-3 pt-1">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 shadow-glow-primary">
                  <Sparkle className="h-4 w-4 text-accent-primary" />
                </div>
                <div className="leading-tight"><div className="font-display text-sm font-black uppercase tracking-wide text-text-primary">Command</div><div className="font-display text-sm font-black uppercase tracking-wide text-text-primary">Hub</div></div>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted text-text-secondary" aria-label="Close navigation"><X className="h-4 w-4" /></button>
            </div>
            <nav className="flex flex-col gap-1">{renderNavGroups(false)}</nav>
            {renderRailFooter(false)}
          </aside>
        </div>
      )}

      {/* Center workspace */}
      <main className="min-w-0 flex-1 pt-12 md:pt-0">
        {activeView === "home" ? (
          children
        ) : (
          <div className="flex flex-col gap-5">
            {/* Workspace header */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background:linear-gradient(rgba(0,214,208,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,208,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-black uppercase tracking-[-0.04em] text-text-primary sm:text-4xl">
                    {view.title}
                  </h1>
                  <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    {view.description}
                  </p>
                </div>
                <button
                  onClick={onOpenCommandPalette}
                  className="hidden items-center gap-2 rounded-xl border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary sm:flex"
                  aria-label="Open command palette"
                >
                  <Search className="h-4 w-4" />
                  <span>Search…</span>
                  <kbd className="rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 text-[0.65rem] font-semibold text-text-secondary">⌘K</kbd>
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-accent-primary/40 to-transparent" />
              </div>
            </div>
            {children}
          </div>
        )}
      </main>

      {/* Right COMMAND AI panel */}
      {chatOpen ? (
        <aside className={`hidden shrink-0 flex-col rounded-2xl border border-border-muted bg-surface-2/70 shadow-card stone-surface backdrop-blur-2xl transition-[width] duration-300 lg:flex ${chatCollapsed ? "w-[76px]" : "w-[320px]"}`}>
          {chatCollapsed ? (
            <div className="flex h-full flex-col items-center gap-4 py-3">
              <button onClick={() => setChatCollapsed(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-accent-primary/40 bg-accent-primary/10 text-accent-primary shadow-glow-primary" title="Expand Command AI" aria-label="Expand Command AI"><PanelRightOpen className="h-4 w-4" /></button>
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <span className="writing-mode-vertical rounded-full border border-accent-secondary/30 bg-accent-secondary/10 px-2 py-3 text-[0.62rem] font-black uppercase tracking-[0.2em] text-accent-secondary">AI</span>
                <button onClick={() => setChatPopout((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg border border-border-muted text-text-secondary transition hover:border-accent-secondary/50 hover:text-accent-secondary" title="Open Command AI pop-out" aria-label="Open Command AI pop-out"><Maximize2 className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border-muted p-3.5">
                <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-accent-primary/35 bg-accent-primary/10 text-accent-primary"><Sparkle className="h-4 w-4" /></span><div className="leading-tight"><div className="font-display text-sm font-black uppercase tracking-wide text-accent-primary">Command AI</div><div className="text-[0.65rem] text-text-secondary">Your AI co-pilot for getting things done.</div></div></div>
                <div className="flex items-center gap-1"><button onClick={() => setChatPopout((value) => !value)} className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary transition hover:border-accent-secondary/45 hover:text-accent-secondary" title="Open pop-out window" aria-label="Open pop-out window"><Maximize2 className="h-3.5 w-3.5" /></button><button onClick={() => setChatCollapsed(true)} className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary transition hover:border-accent-primary/45 hover:text-accent-primary" title="Collapse Command AI" aria-label="Collapse Command AI"><PanelRightClose className="h-3.5 w-3.5" /></button><button onClick={() => { setChatOpen(false); setChatPopout(false); }} className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary transition hover:border-accent-secondary/45 hover:text-accent-secondary" title="Close Command AI" aria-label="Close Command AI"><X className="h-3.5 w-3.5" /></button></div>
              </div>
              {renderMessages(true)}
              {renderComposer()}
            </>
          )}
        </aside>
      ) : (
        <button onClick={() => setChatOpen(true)} className="fixed right-20 top-6 z-40 hidden h-11 w-11 place-items-center rounded-full border border-accent-primary/50 bg-[#061014]/90 text-accent-primary shadow-glow-primary backdrop-blur-xl transition hover:scale-105 hover:border-accent-secondary/60 hover:text-accent-secondary md:grid" title="Open Command AI" aria-label="Open Command AI"><Sparkle className="h-4 w-4" /></button>
      )}

      {chatPopout && <div className="fixed bottom-5 right-5 z-50 flex h-[min(560px,calc(100vh-2.5rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-accent-primary/45 bg-[#050b0e]/92 shadow-[0_24px_90px_rgba(0,0,0,0.68),0_0_36px_rgba(0,214,208,0.14)] backdrop-blur-2xl"><div className="flex items-center justify-between border-b border-border-muted p-3.5"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-accent-primary/35 bg-accent-primary/10 text-accent-primary"><Sparkle className="h-4 w-4" /></span><div className="leading-tight"><div className="font-display text-sm font-black uppercase tracking-wide text-accent-primary">Command AI</div><div className="text-[0.65rem] text-text-secondary">Pop-out command window</div></div></div><div className="flex items-center gap-1"><button onClick={() => setChatPopout(false)} className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary transition hover:border-accent-secondary/45 hover:text-accent-secondary" title="Close pop-out" aria-label="Close pop-out"><Minimize2 className="h-3.5 w-3.5" /></button><button onClick={() => { setChatOpen(false); setChatPopout(false); }} className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-secondary transition hover:border-accent-secondary/45 hover:text-accent-secondary" title="Close Command AI" aria-label="Close Command AI"><X className="h-3.5 w-3.5" /></button></div></div>{renderMessages(false)}{renderComposer()}</div>}

      {/* Mobile: floating Command AI trigger */}
      <button
        onClick={() => setChatPopout(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-accent-secondary/40 bg-surface-3 px-4 py-2 text-sm font-semibold text-accent-secondary shadow-glow-secondary lg:hidden"
      >
        <Sparkle className="h-4 w-4" />
        Command AI
      </button>
    </div>
  );
}
