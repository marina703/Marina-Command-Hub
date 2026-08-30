import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkle,
  Lock,
  ArrowUpRight,
  Code2,
  FileText,
  Network,
  ListChecks,
  ShieldCheck,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getConfig, runAutonomousLoop, runPlaybook, sendChat } from "@/lib/api";
import type { LLMConfig, LogEntry, PresetConfig } from "@/types";

import {
  ModelHub,
  TaskBoard,
  IdeationHub,
  MeetingsPanel,
  SystemMetrics,
  ServicesMonitor,
  ProjectsPanel,
  CommandHubUpdates,
  WorkspacePanels,
  ApprovalInbox,
  SecurityPanel,
  IntegrationsPanel,
  OperationsShelf,
  TaskDetail,
  CodeGenPanel,
  DocumentGenPanel,
  AgentToolsPanel,
  CommandHubShell,
  GeminiSyncPanel,
  PlaybookBar,
  AssistantConsole,
  ControlPanel,
  SystemLogViewer,
  RunHistoryTable,
  CommandPalette,
} from "@/components/dashboard";
import type { ViewId } from "@/components/dashboard/views";
import type { ChatMessage } from "@/components/dashboard/AssistantConsole";
import type { TaskItem } from "@/types";
import { LoginPage } from "@/components/dashboard/LoginPage";
import { ErrorBoundary, SkeletonGrid } from "@/components/ui";

import { loadPresets, savePresets } from "@/components/dashboard/ControlPanel";
import type { ControlPanelValues } from "@/components/dashboard/ControlPanel";

const DEFAULT_CONTROL: ControlPanelValues = {
  temperature: 70,
  maxTokens: 2048,
  duration: 30,
};

/** One-click tool cards shown on the home view. */
const TOOLS: {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
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

/** Suggested prompts shown in the home command composer. */
const SUGGESTED = [
  "Scaffold a new project",
  "Create a document",
  "Run an agent task",
  "Summarize my workspace",
];

/** Convert raw dashboard log strings into structured LogEntry objects. */
function toLogEntries(raw: string[]): LogEntry[] {
  return raw.map((line, i) => {
    const lower = line.toLowerCase();
    let level: LogEntry["level"] = "info";
    if (lower.includes("error") || lower.includes("fail")) level = "error";
    else if (lower.includes("warn")) level = "warning";
    else if (lower.includes("success") || lower.includes("complete"))
      level = "success";
    return {
      id: `log-${i}-${Date.now()}`,
      level,
      message: line,
      createdAt: new Date().toISOString(),
    };
  });
}

export default function App() {
  // Auth state — gates the entire Command Hub
  const auth = useAuth();
  // Workspace state — available for future workspace selector UI
  const _workspace = useWorkspace(auth.session);
  void _workspace; // Used by workspace hook for session-based fetching

  const { data, loading, error, refresh } = useDashboard();
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  // Control panel state
  const [control, setControl] = useState<ControlPanelValues>(DEFAULT_CONTROL);
  const [presets, setPresets] = useState<PresetConfig[]>(() => loadPresets());

  // Log streaming state
  const [streaming, setStreaming] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Config state
  const [config, setConfig] = useState<LLMConfig | null>(null);

  // Assistant chat history
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Sync logs from dashboard data when streaming.
  useEffect(() => {
    if (!data) return;
    const entries = toLogEntries(data.logs ?? []);
    setLogs((prev) => {
      if (prev.length === 0) return entries;
      return prev;
    });
  }, [data]);

  // Load config on mount.
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  // Theme init + persistence.
  useEffect(() => {
    const saved = localStorage.getItem("marina_theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("marina_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  const handleLock = useCallback(() => {
    setLocked(true);
    toast.info("Command Hub locked");
  }, []);

  const handleRunTasks = useCallback(async () => {
    try {
      const res = await runAutonomousLoop();
      toast.success(res.message || "Workspace tasks running");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run tasks");
    }
  }, [refresh]);

  const handleExportLogs = useCallback(() => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marina-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs exported to JSON");
  }, [logs]);

  const handleSavePreset = useCallback((preset: PresetConfig) => {
    setPresets((prev) => {
      const next = [...prev, preset];
      savePresets(next);
      return next;
    });
  }, []);

  const handleLoadPreset = useCallback((preset: PresetConfig) => {
    setControl({
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      duration: preset.duration,
    });
  }, []);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePresets(next);
      return next;
    });
  }, []);

  const handleAddMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /** Real quick-prompt handler: sends to /api/chat, records history, returns reply. */
  const handleSendPrompt = useCallback(
    async (prompt: string): Promise<string> => {
      handleAddMessage({
        id: `msg-${Date.now()}`,
        type: "user",
        text: prompt,
      });
      try {
        const res = await sendChat(prompt, true);
        const reply = res.reply || "Task processed.";
        handleAddMessage({
          id: `sys-${Date.now()}`,
          type: "system",
          text: reply,
        });
        void refresh();
        return reply;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to process prompt.";
        handleAddMessage({
          id: `err-${Date.now()}`,
          type: "system",
          text: `Error: ${message}`,
        });
        throw err;
      }
    },
    [handleAddMessage, refresh],
  );

  /** Runs a playbook via /api/playbooks/run and toasts the result. */
  const handleRunPlaybook = useCallback(
    async (id: string, prompt?: string) => {
      try {
        const res = await runPlaybook(id, prompt);
        if (res.ok) {
          toast.success(res.message || `Playbook ${id} completed`);
          void refresh();
        } else {
          toast.error(res.message || `Playbook ${id} failed`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Playbook failed");
      }
    },
    [refresh],
  );

  const handleToggleStream = useCallback(() => setStreaming((s) => !s), []);
  const handleClearLogs = useCallback(() => setLogs([]), []);

  const online = useMemo(
    () => data?.status === "online" || data?.status === "ok",
    [data],
  );

  // Build model runs from tasks for the run history table.
  const runs = useMemo(() => {
    return (data?.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      owner: t.owner,
      status: (t.status === "completed"
        ? "completed"
        : t.status === "running"
          ? "running"
          : t.status === "failed"
            ? "failed"
            : "queued") as "queued" | "running" | "completed" | "failed",
      progress: t.progress,
      priority:
        (t.priority as "Low" | "Medium" | "High" | "Critical") ?? "Medium",
      updatedAt: t.updatedAt,
    }));
  }, [data]);

  // Auth gate: show login page when not authenticated.
  // When Supabase is not configured, LoginPage shows a "configuration required" state.
  if (!auth.loading && !auth.user) {
    return <LoginPage auth={auth} />;
  }

  // Loading state while checking session
  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-1 p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 font-extrabold text-accent-primary shadow-glow-primary">
            M
          </div>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Restoring session…</p>
        </div>
      </div>
    );
  }

  // Lock screen gate.
  if (locked) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-1 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border-muted bg-surface-2 p-8 text-center shadow-card">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-accent-primary/50 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 font-extrabold text-accent-primary shadow-glow-primary">
            M
          </div>
          <h1 className="mb-1 text-lg font-bold text-text-primary">
            Command Hub Locked
          </h1>
          <p className="mb-5 text-sm text-text-secondary">
            The workspace is paused. Unlock to resume autonomous operations.
          </p>
          <button
            onClick={() => setLocked(false)}
            className="w-full rounded-xl bg-gradient-to-br from-accent-primary-soft to-accent-secondary-soft border border-accent-primary/40 px-4 py-2.5 text-sm font-semibold text-text-primary shadow-glow-primary transition-all hover:-translate-y-px"
          >
            Unlock Hub
          </button>
        </div>
      </div>
    );
  }

  /** Content rendered inside the shell for the active view. */
  const renderView = () => {
    switch (activeView) {
      case "home":
        return (
          <div className="flex flex-col gap-6">
            {/* Heading */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background:linear-gradient(rgba(0,214,208,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,208,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
              <h1 className="font-display text-3xl font-black uppercase tracking-[-0.04em] text-text-primary sm:text-5xl">
                Your Command Hub, In One Place
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                AI command center for your workflows
              </p>
            </div>

            {/* Quick stats strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(data?.quickStats ?? []).slice(0, 4).map((stat) => (
                <div
                  key={stat.label}
                  className={`stone-surface rounded-xl border p-4 ${
                    stat.accent === "pink"
                      ? "border-accent-secondary/30"
                      : "border-accent-primary/30"
                  }`}
                >
                  <p
                    className={`font-display text-2xl font-black ${
                      stat.accent === "pink"
                        ? "text-accent-secondary"
                        : "text-accent-primary"
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-text-secondary">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* One-click tools */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-display text-sm font-black uppercase tracking-wide text-accent-primary">
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
                      onClick={() => setActiveView(tool.view)}
                      className="group stone-surface relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-muted bg-surface-3/65 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-primary/40 hover:shadow-glow-primary"
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
                        <div className="font-display text-sm font-black uppercase tracking-wide text-text-primary">
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
            <section className="stone-surface relative overflow-hidden rounded-2xl border border-accent-primary/40 bg-surface-3/65 p-5 shadow-glow-primary backdrop-blur-2xl">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-accent-primary/50 bg-surface-2">
                  <Sparkle className="h-5 w-5 text-accent-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-black text-text-primary">
                    What would you like to get done?
                  </h3>
                  <p className="mt-0.5 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-accent-secondary">
                    Ask Command Hub anything
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SUGGESTED.map((s) => (
                      <button
                        key={s}
                        onClick={() => void handleSendPrompt(s)}
                        className="rounded-full border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[0.65rem] text-text-muted">
                <Lock className="h-3 w-3" />
                AI responses may be inaccurate. Verify important information.
              </div>
            </section>
          </div>
        );

      case "dashboard":
        return (
          <div className="flex flex-col gap-4">
            <div className="mb-1">
              <PlaybookBar onRun={handleRunPlaybook} />
            </div>

            <div id="hub-workspace-panels" className="scroll-mt-24">
              <WorkspacePanels onRefresh={refresh} />
            </div>

            <OperationsShelf
              workspaceId={auth.session ? "default" : null}
              onRefresh={refresh}
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                {loading ? (
                  <SkeletonGrid count={5} />
                ) : (
                  <SystemMetrics system={data?.system ?? {}} />
                )}

                <SystemLogViewer
                  logs={logs}
                  streaming={streaming}
                  onToggleStream={handleToggleStream}
                  onClear={handleClearLogs}
                />

                <div id="hub-run-history" className="contents scroll-mt-24">
                  <RunHistoryTable runs={runs} loading={loading} />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <ControlPanel
                  values={control}
                  onChange={setControl}
                  presets={presets}
                  onSavePreset={handleSavePreset}
                  onLoadPreset={handleLoadPreset}
                  onDeletePreset={handleDeletePreset}
                />

                <div id="hub-services-monitor" className="contents scroll-mt-24">
                  <ServicesMonitor services={data?.services ?? []} />
                </div>

                <CommandHubUpdates
                  updates={data?.commandHubUpdates ?? []}
                  onRefresh={refresh}
                />
              </div>
            </div>
          </div>
        );

      case "assistant":
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AssistantConsole
                onMessage={handleAddMessage}
                onRefresh={refresh}
              />
              <div className="mt-4 flex flex-col gap-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3 text-sm ${
                      m.type === "user"
                        ? "border-accent-primary/40 bg-accent-primary/5 text-text-primary"
                        : "border-border-muted bg-surface-2 text-text-secondary"
                    }`}
                  >
                    <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-text-muted">
                      {m.type === "user" ? "You" : "AI Team"}
                    </span>
                    {m.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <IdeationHub ideas={data?.brainstormIdeas ?? []} onRefresh={refresh} />
              <MeetingsPanel meetings={data?.meetingAgenda ?? []} onRefresh={refresh} />
            </div>
          </div>
        );

      case "tasks":
        return selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onBack={() => setSelectedTask(null)}
            onRefresh={refresh}
          />
        ) : (
          <TaskBoard
            tasks={data?.tasks ?? []}
            completed={data?.completedHistory ?? []}
            loading={loading}
            onRefresh={refresh}
            onSelectTask={setSelectedTask}
          />
        );

      case "taskDetail":
        return selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onBack={() => setSelectedTask(null)}
            onRefresh={refresh}
          />
        ) : (
          <TaskBoard
            tasks={data?.tasks ?? []}
            completed={data?.completedHistory ?? []}
            loading={loading}
            onRefresh={refresh}
            onSelectTask={setSelectedTask}
          />
        );

      case "projects":
        return (
          <ProjectsPanel projects={data?.projects ?? []} onRefresh={refresh} />
        );

      case "geminiSync":
        return <GeminiSyncPanel chats={messages} />;

      case "models":
        return <ModelHub config={config} onConfigChange={setConfig} />;

      case "system":
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <SystemMetrics system={data?.system ?? {}} />
            <ServicesMonitor services={data?.services ?? []} />
          </div>
        );

      case "approvals":
        return <ApprovalInbox onRefresh={refresh} />;

      case "security":
        return <SecurityPanel />;

      case "integrations":
        return <IntegrationsPanel />;

      case "codegen":
        return (
          <CodeGenPanel
            workspaceId={auth.session ? "default" : null}
            session={auth.session}
          />
        );

      case "docgen":
        return (
          <DocumentGenPanel
            workspaceId={auth.session ? "default" : null}
            session={auth.session}
          />
        );

      case "agents":
        return (
          <AgentToolsPanel
            workspaceId={auth.session ? "default" : null}
            session={auth.session}
          />
        );

      case "automations":
        return (
          <div className="rounded-2xl border border-border-muted bg-surface-2 p-6 text-center shadow-card">
            <h2 className="mb-2 text-lg font-bold text-text-primary">
              Automations
            </h2>
            <p className="mb-4 text-sm text-text-secondary">
              Durable scheduled workflows require a persistent scheduler
              backend. This feature is planned for Phase E and is not yet
              enabled.
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/30 bg-status-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-warning">
              Not enabled
            </span>
            <p className="mt-4 text-xs text-text-muted">
              Automations will support: schedule builder, durable run history,
              pause/resume, templates, idempotency, bounded retries,
              dead-letter states, and per-workspace concurrency — backed by a
              durable queue, not a browser tab.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-surface-1 text-text-primary">
      <div className="mx-auto max-w-[1600px] p-3 sm:p-4">
        {error && (
          <div className="mb-4 rounded-xl border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
            Failed to load dashboard: {error}
          </div>
        )}

        <CommandHubShell
          activeView={activeView}
          onNavigate={setActiveView}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          online={online}
          onLock={handleLock}
          onSignOut={auth.signOut}
          userEmail={auth.user?.email ?? null}
          theme={theme}
          onToggleTheme={toggleTheme}
        >
          {renderView()}
        </CommandHubShell>
      </div>

      <ErrorBoundary label="Command palette">
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onNavigate={setActiveView}
          onRunTasks={handleRunTasks}
          onExportLogs={handleExportLogs}
        />
      </ErrorBoundary>
    </div>
  );
}
