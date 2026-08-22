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

/* ──────────────────────────────────────────────
   Real System Actions (Operations / System panels)
   ────────────────────────────────────────────── */
export interface SystemActionState {
  ok: boolean;
  tempReports: { count: number; bytes: number };
  scheduler: { timerActive: boolean; cycleInProgress: boolean };
  performanceMode: "standard" | "high";
}

export interface ClearTempResult {
  ok: boolean;
  removed: number;
  bytesFreed: number;
}

export interface OptimizeResult {
  ok: boolean;
  reportsRemoved: number;
  reportsBytesFreed: number;
  stateBytesBefore: number;
  stateBytesAfter: number;
  stateBytesSaved: number;
}

export interface HighPerfResult {
  ok: boolean;
  mode: "standard" | "high";
  numCtx: number;
  numPredict: number;
}

export const getSystemActionState = () =>
  request<SystemActionState>("/api/system/state");

export const clearTempFiles = () =>
  request<ClearTempResult>("/api/system/clear-temp", jsonBody({}));

export const restartScheduler = () =>
  request<{ ok: boolean; restarted: boolean; scheduler: SystemActionState["scheduler"] }>(
    "/api/system/restart-scheduler",
    jsonBody({}),
  );

export const optimizeSystem = () =>
  request<OptimizeResult>("/api/system/optimize", jsonBody({}));

export const setHighPerformance = (enabled: boolean) =>
  request<HighPerfResult>("/api/system/high-perf", jsonBody({ enabled }));

/* ──────────────────────────────────────────────
   Approvals & Audit (human-control layer)
   ────────────────────────────────────────────── */
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed";

export interface ApprovalRequest {
  id: string;
  action: string;
  riskTier: "low" | "moderate" | "high" | "critical";
  description: string;
  payloadHash: string;
  payloadPreview: Record<string, unknown>;
  reason: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decisionNote: string;
  executedResult: string | null;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  objectType: string;
  objectId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const listApprovals = (status: string = "all") =>
  request<{ ok: boolean; approvals: ApprovalRequest[] }>(
    `/api/approvals?status=${encodeURIComponent(status)}`,
  );

export const decideApproval = (
  id: string,
  decision: "approve" | "reject" | "cancel",
  note = "",
) =>
  request<{ ok: boolean; approval?: ApprovalRequest; message?: string }>(
    "/api/approvals/decision",
    jsonBody({ id, decision, note }),
  );

export const getAuditEvents = (limit = 100) =>
  request<{ ok: boolean; events: AuditEvent[] }>(
    `/api/audit?limit=${limit}`,
  );

/* ──────────────────────────────────────────────
   Tool Registry
   ────────────────────────────────────────────── */
export interface ToolDefinition {
  name: string;
  version: string;
  purpose: string;
  riskTier: "low" | "moderate" | "high" | "critical";
  approvalPolicy: "plan_approval" | "just_in_time";
  available: boolean;
  availabilityState: string;
  featureFlag: string | null;
}

export const listTools = () =>
  request<{ ok: boolean; tools: ToolDefinition[] }>("/api/tools");

/* ──────────────────────────────────────────────
   Plans (versioned task plans)
   ────────────────────────────────────────────── */
export interface PlanStep {
  id: string;
  planId: string;
  taskId: string;
  position: number;
  title: string;
  purpose: string;
  dependencies: string[];
  toolClass: string;
  inputSummary: string;
  expectedOutput: string;
  riskTier: "low" | "moderate" | "high" | "critical";
  requiresApproval: boolean;
  status: "pending" | "running" | "awaiting_approval" | "completed" | "failed" | "skipped" | "cancelled";
  estimatedDuration: number | null;
  estimatedCost: number | null;
}

export interface Plan {
  id: string;
  taskId: string;
  version: number;
  status: "draft" | "approved" | "superseded" | "rejected";
  author: string;
  summary: string;
  assumptions: string[];
  risks: string[];
  createdAt: string;
  approvedAt: string | null;
  steps: PlanStep[];
}

export const createPlan = (payload: {
  taskId: string;
  summary?: string;
  assumptions?: string[];
  risks?: string[];
  steps?: Array<Partial<PlanStep>>;
}) =>
  request<{ ok: boolean; plan: Plan }>("/api/plans", jsonBody(payload));

export const getPlans = (taskId: string) =>
  request<{ ok: boolean; plans: Plan[] }>(
    `/api/plans?taskId=${encodeURIComponent(taskId)}`,
  );

export const getPlan = (planId: string) =>
  request<{ ok: boolean; plan: Plan }>(`/api/plans/${encodeURIComponent(planId)}`);

export const decidePlan = (planId: string, decision: "approve" | "reject" | "revise") =>
  request<{ ok: boolean; plan?: Plan; message?: string }>(
    "/api/plans/decision",
    jsonBody({ planId, decision }),
  );

/* ──────────────────────────────────────────────
   Runs (execution attempts)
   ────────────────────────────────────────────── */
export interface RunEvent {
  id: string;
  runId: string;
  taskId: string;
  sequence: number;
  event: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface Run {
  id: string;
  taskId: string;
  planId: string;
  status: "queued" | "active" | "succeeded" | "failed" | "cancelled" | "timed_out";
  attemptCount: number;
  parentRunId: string | null;
  provider: string;
  toolSummary: string;
  startedAt: string | null;
  endedAt: string | null;
  failureClassification: string | null;
  budgetUsed: number;
  timeUsedMs: number;
  createdAt: string;
  events?: RunEvent[];
}

export const createRun = (payload: {
  taskId: string;
  planId?: string;
  provider?: string;
  toolSummary?: string;
}) =>
  request<{ ok: boolean; run: Run }>("/api/runs", jsonBody(payload));

export const getRun = (runId: string) =>
  request<{ ok: boolean; run: Run }>(`/api/runs/${encodeURIComponent(runId)}`);

export const getRunEvents = (runId: string) =>
  request<{ ok: boolean; events: RunEvent[] }>(
    `/api/runs/${encodeURIComponent(runId)}/events`,
  );

export const cancelRun = (runId: string) =>
  request<{ ok: boolean; run?: Run; message?: string }>(
    "/api/runs/cancel",
    jsonBody({ runId }),
  );

export const retryRun = (runId: string) =>
  request<{ ok: boolean; run?: Run; message?: string }>(
    "/api/runs/retry",
    jsonBody({ runId }),
  );

/* ──────────────────────────────────────────────
   Artifacts
   ────────────────────────────────────────────── */
export interface Artifact {
  id: string;
  taskId: string;
  runId: string;
  type: string;
  displayName: string;
  mediaType: string;
  storageRef: string;
  contentHash: string;
  sizeBytes: number;
  state: "draft" | "ready" | "archived" | "deleted";
  summary: string;
  provenance: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export const getArtifacts = (filter: {
  taskId?: string;
  runId?: string;
  type?: string;
  state?: string;
} = {}) => {
  const params = new URLSearchParams();
  if (filter.taskId) params.set("taskId", filter.taskId);
  if (filter.runId) params.set("runId", filter.runId);
  if (filter.type) params.set("type", filter.type);
  if (filter.state) params.set("state", filter.state);
  const qs = params.toString();
  return request<{ ok: boolean; artifacts: Artifact[] }>(
    `/api/artifacts${qs ? `?${qs}` : ""}`,
  );
};
