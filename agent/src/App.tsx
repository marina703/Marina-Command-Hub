import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDashboard } from "@/hooks/useDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getConfig, runAutonomousLoop, sendChat } from "@/lib/api";
import type { LLMConfig, LogEntry, PresetConfig } from "@/types";

import {
  Sidebar,
  TopNav,
  ControlPanel,
  SystemLogViewer,
  RunHistoryTable,
  CommandPalette,
  AssistantConsole,
  ModelHub,
  TaskBoard,
  IdeationHub,
  MeetingsPanel,
  SystemMetrics,
  ServicesMonitor,
  ProjectsPanel,
  CommandHubUpdates,
  CommandHubHeader,
  WorkspacePanels,
  ApprovalInbox,
  SecurityPanel,
  IntegrationsPanel,
  OperationsShelf,
} from "@/components/dashboard";
import type { ViewId } from "@/components/dashboard/Sidebar";
import type { ChatMessage } from "@/components/dashboard/AssistantConsole";
import { LoginPage } from "@/components/dashboard/LoginPage";
import { ErrorBoundary, SkeletonGrid } from "@/components/ui";

import { loadPresets, savePresets } from "@/components/dashboard/ControlPanel";
import type { ControlPanelValues } from "@/components/dashboard/ControlPanel";

const DEFAULT_CONTROL: ControlPanelValues = {
  temperature: 70,
  maxTokens: 2048,
  duration: 30,
};

/** Convert raw dashboard log strings into structured LogEntry objects. */
function toLogEntries(raw: string[]): LogEntry[] {
  return raw.map((line, i) => {
    const lower = line.toLowerCase();
    let level: LogEntry["level"] = "info";
    if (lower.includes("error") || lower.includes("fail")) level = "error";
    else if (lower.includes("warn")) level = "warning";
    else if (lower.includes("success") || lower.includes("complete")) level = "success";
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
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
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

  const handleToggleStream = useCallback(() => setStreaming((s) => !s), []);
  const handleClearLogs = useCallback(() => setLogs([]), []);

  const online = useMemo(() => data?.status === "online" || data?.status === "ok", [data]);

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
      priority: (t.priority as "Low" | "Medium" | "High" | "Critical") ?? "Medium",
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
          <h1 className="mb-1 text-lg font-bold text-text-primary">Command Hub Locked</h1>
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

  return (
    <div className="min-h-screen bg-surface-1 text-text-primary">
      <div className="mx-auto flex max-w-[1600px] gap-4 p-3 sm:p-4">
        <ErrorBoundary label="Sidebar">
          <Sidebar
            activeView={activeView}
            onNavigate={setActiveView}
            onLock={handleLock}
            onSignOut={auth.signOut}
            data={data}
            user={auth.user}
          />
        </ErrorBoundary>

        <main className="min-w-0 flex-1">
          <ErrorBoundary label="Top navigation">
            <TopNav
              theme={theme}
              onToggleTheme={toggleTheme}
              onOpenCommandPalette={() => setPaletteOpen(true)}
              onRunTasks={handleRunTasks}
              online={online}
            />
          </ErrorBoundary>

          {error && (
            <div className="mb-4 rounded-xl border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
              Failed to load dashboard: {error}
            </div>
          )}

          <div className="mb-4">
            <ErrorBoundary label="Command Hub header">
              <CommandHubHeader
                taskCount={data?.tasks?.length ?? 0}
                workspaceCount={1}
                activeWorkspaceCount={1}
                executionQueue={0}
                pendingQueue={0}
                state={data?.mode ?? "FLUID"}
                onRunWorkspace={handleRunTasks}
                onRefresh={refresh}
                onSend={handleSendPrompt}
              />
            </ErrorBoundary>
          </div>

          {activeView === "dashboard" && (
            <>
              <div id="hub-workspace-panels" className="mb-4 scroll-mt-24">
                <ErrorBoundary label="Workspace panels">
                  <WorkspacePanels onRefresh={refresh} />
                </ErrorBoundary>
              </div>

              <div className="mb-4">
                <ErrorBoundary label="Operations shelf">
                  <OperationsShelf
                    workspaceId={auth.session ? "default" : null}
                    onRefresh={refresh}
                  />
                </ErrorBoundary>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                <ErrorBoundary label="System metrics">
                  {loading ? (
                    <SkeletonGrid count={5} />
                  ) : (
                    <SystemMetrics system={data?.system ?? {}} />
                  )}
                </ErrorBoundary>

                <ErrorBoundary label="System log">
                  <SystemLogViewer
                    logs={logs}
                    streaming={streaming}
                    onToggleStream={handleToggleStream}
                    onClear={handleClearLogs}
                  />
                </ErrorBoundary>

                <div id="hub-run-history" className="contents scroll-mt-24">
                  <ErrorBoundary label="Run history">
                    <RunHistoryTable runs={runs} loading={loading} />
                  </ErrorBoundary>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <ErrorBoundary label="Control panel">
                  <ControlPanel
                    values={control}
                    onChange={setControl}
                    presets={presets}
                    onSavePreset={handleSavePreset}
                    onLoadPreset={handleLoadPreset}
                    onDeletePreset={handleDeletePreset}
                  />
                </ErrorBoundary>

                <div id="hub-services-monitor" className="contents scroll-mt-24">
                  <ErrorBoundary label="Services">
                    <ServicesMonitor services={data?.services ?? []} />
                  </ErrorBoundary>
                </div>

                <ErrorBoundary label="Command Hub updates">
                  <CommandHubUpdates updates={data?.commandHubUpdates ?? []} onRefresh={refresh} />
                </ErrorBoundary>
              </div>
            </div>
            </>
          )}

          {activeView === "assistant" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ErrorBoundary label="Assistant console">
                  <AssistantConsole onMessage={handleAddMessage} onRefresh={refresh} />
                </ErrorBoundary>
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
                <ErrorBoundary label="Ideation hub">
                  <IdeationHub ideas={data?.brainstormIdeas ?? []} onRefresh={refresh} />
                </ErrorBoundary>
                <ErrorBoundary label="Meetings">
                  <MeetingsPanel meetings={data?.meetingAgenda ?? []} onRefresh={refresh} />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {activeView === "tasks" && (
            <ErrorBoundary label="Task board">
              <TaskBoard
                tasks={data?.tasks ?? []}
                completed={data?.completedHistory ?? []}
                loading={loading}
                onRefresh={refresh}
              />
            </ErrorBoundary>
          )}

          {activeView === "projects" && (
            <ErrorBoundary label="Projects">
              <ProjectsPanel projects={data?.projects ?? []} onRefresh={refresh} />
            </ErrorBoundary>
          )}

          {activeView === "geminiSync" && (
            <div className="rounded-2xl border border-border-muted bg-surface-2 p-6 text-center shadow-card">
              <h2 className="mb-2 text-lg font-bold text-text-primary">Gemini Sync</h2>
              <p className="text-sm text-text-secondary">
                Sync your chat history and context with Gemini. This panel is ready for
                integration with the existing /api/gemini/sync endpoint.
              </p>
            </div>
          )}

          {activeView === "models" && (
            <ErrorBoundary label="Model hub">
              <ModelHub config={config} onConfigChange={setConfig} />
            </ErrorBoundary>
          )}

          {activeView === "system" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ErrorBoundary label="System metrics">
                <SystemMetrics system={data?.system ?? {}} />
              </ErrorBoundary>
              <ErrorBoundary label="Services">
                <ServicesMonitor services={data?.services ?? []} />
              </ErrorBoundary>
            </div>
          )}

          {activeView === "approvals" && (
            <ErrorBoundary label="Approval queue">
              <ApprovalInbox onRefresh={refresh} />
            </ErrorBoundary>
          )}

          {activeView === "security" && (
            <ErrorBoundary label="Settings & security">
              <SecurityPanel />
            </ErrorBoundary>
          )}

          {activeView === "integrations" && (
            <ErrorBoundary label="Integrations & tools">
              <IntegrationsPanel />
            </ErrorBoundary>
          )}

          {activeView === "automations" && (
            <div className="rounded-2xl border border-border-muted bg-surface-2 p-6 text-center shadow-card">
              <h2 className="mb-2 text-lg font-bold text-text-primary">Automations</h2>
              <p className="mb-4 text-sm text-text-secondary">
                Durable scheduled workflows require a persistent scheduler backend.
                This feature is planned for Phase E and is not yet enabled.
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/30 bg-status-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-warning">
                Not enabled
              </span>
              <p className="mt-4 text-xs text-text-muted">
                Automations will support: schedule builder, durable run history,
                pause/resume, templates, idempotency, bounded retries, dead-letter
                states, and per-workspace concurrency — backed by a durable queue,
                not a browser tab.
              </p>
            </div>
          )}
        </main>
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
