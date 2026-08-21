/* ============================================================
   Marina AI Command Hub — API Client Layer
   Typed bridge to the existing REST endpoints served by
   dashboard-server.js. All endpoints are preserved as-is.
   ============================================================ */

import type {
  ApiError,
  ChatResponse,
  DashboardState,
  GeminiSyncResponse,
  HealthStatus,
  InstallCardResponse,
  LLMConfig,
  OllamaStatus,
  PlaybookResponse,
  ProjectScanResponse,
  SiteMonitorResponse,
  SystemMetrics,
  UiUpdatesResponse,
} from "@/types";


/** Throws an ApiError with a readable message on non-OK responses. */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (body.message) message = body.message;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/* ──────────────────────────────────────────────
   Dashboard & Health
   ────────────────────────────────────────────── */
export const getDashboardState = () =>
  request<DashboardState>("/api/dashboard");

export const getHealth = () => request<HealthStatus>("/api/health");

export const getOllamaStatus = async (): Promise<OllamaStatus> => {
  const data = await request<{ ok: boolean; ollama: OllamaStatus }>(
    "/api/ollama/status",
  );
  return data.ollama;
};

/* ──────────────────────────────────────────────
   Config
   ────────────────────────────────────────────── */
export const getConfig = () => request<LLMConfig>("/api/config");

export const updateConfig = (payload: Partial<LLMConfig> & { apiKey?: string }) =>
  request<{ ok: boolean; config: LLMConfig }>("/api/config", jsonBody(payload));

/* ──────────────────────────────────────────────
   Chat & Execution
   ────────────────────────────────────────────── */
export const sendChat = (message: string, autonomous = true) =>
  request<ChatResponse>("/api/chat", jsonBody({ message, autonomous }));

export const executeAgent = (task: unknown) =>
  request<{ ok: boolean; message: string; task: unknown; result: unknown }>(
    "/api/agent/execute",
    jsonBody({ task }),
  );

/* ──────────────────────────────────────────────
   Tasks
   ────────────────────────────────────────────── */
export const createTask = (payload: Record<string, unknown>) =>
  request<{ ok: boolean; task: unknown }>("/api/tasks", jsonBody(payload));

export const completeTask = (taskId: string) =>
  request<{ ok: boolean; completed: unknown }>(
    "/api/tasks/complete",
    jsonBody({ taskId }),
  );

/* ──────────────────────────────────────────────
   Ideas & Meetings
   ────────────────────────────────────────────── */
export const createIdea = (payload: Record<string, unknown>) =>
  request<{ ok: boolean; idea: unknown }>("/api/ideas", jsonBody(payload));

export const createMeeting = (payload: Record<string, unknown>) =>
  request<{ ok: boolean; meeting: unknown }>("/api/meetings", jsonBody(payload));

export const generateSummary = () =>
  request<{ ok: boolean; summary: unknown }>("/api/summary", jsonBody({}));

/* ──────────────────────────────────────────────
   Playbooks
   ────────────────────────────────────────────── */
export const runPlaybook = (playbook: string, prompt = "") =>
  request<PlaybookResponse>(
    "/api/playbooks/run",
    jsonBody({ playbook, prompt }),
  );

/* ──────────────────────────────────────────────
   System Metrics (live telemetry)
   ────────────────────────────────────────────── */
export const getSystemMetrics = () =>
  request<{ ok: boolean; metrics: SystemMetrics }>("/api/system-metrics");

/* ──────────────────────────────────────────────
   Site Monitor
   ────────────────────────────────────────────── */
export const monitorSite = (site: string) =>
  request<SiteMonitorResponse>("/api/site/monitor", jsonBody({ site }));


/* ──────────────────────────────────────────────
   Project Scan
   ────────────────────────────────────────────── */
export const scanProject = () =>
  request<ProjectScanResponse>("/api/project/scan");

/* ──────────────────────────────────────────────
   Gemini Sync
   ────────────────────────────────────────────── */
export const syncGemini = (chats: unknown[]) =>
  request<GeminiSyncResponse>("/api/gemini/sync", jsonBody({ chats }));

/* ──────────────────────────────────────────────
   Voice
   ────────────────────────────────────────────── */
export const sendVoice = (text: string) =>
  request<{ ok: boolean; message: string }>("/api/voice", jsonBody({ text }));

/* ──────────────────────────────────────────────
   Automation
   ────────────────────────────────────────────── */
export const generateStandup = () =>
  request<{ ok: boolean; brief: unknown }>("/api/automation/standup", jsonBody({}));

export const runAutonomousLoop = () =>
  request<{ ok: boolean; message: string }>("/api/automation/loop", jsonBody({}));

/* ──────────────────────────────────────────────
   Command Hub Updates
   ────────────────────────────────────────────── */
export const getUiUpdates = () =>
  request<UiUpdatesResponse>("/api/ui/updates");

export const installCard = (payload: Record<string, unknown>) =>
  request<InstallCardResponse>("/api/ui/install-card", jsonBody(payload));
