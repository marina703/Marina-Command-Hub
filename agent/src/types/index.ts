/* ============================================================
   Marina AI Command Hub — Type Models
   Explicit interfaces for all data structures flowing between
   the REST API and the React frontend.
   ============================================================ */

/** A single entry in the system activity log. */
export interface LogEntry {
  id: string | number;
  /** Log level used for filtering and status coloring. */
  level: "info" | "warning" | "error" | "success";
  message: string;
  /** ISO timestamp of when the log was created. */
  createdAt: string;
  /** Optional structured payload attached to the log. */
  payload?: Record<string, unknown>;
}

/** A completed model run / task execution record. */
export interface ModelRun {
  id: string;
  title: string;
  owner: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  priority: "Low" | "Medium" | "High" | "Critical";
  updatedAt: string;
  completedAt?: string;
  result?: string;
}

/** A saved configuration preset for the control panel sliders. */
export interface PresetConfig {
  id: string;
  name: string;
  temperature: number;
  maxTokens: number;
  duration: number;
  createdAt: string;
}

/** A single live system metric (CPU, RAM, NPU, etc.). */
export interface MetricStat {
  key: string;
  value: number;
  unit: string;
  label: string;
}

/** Health status of an external service. */
export interface ServiceStatus {
  name: string;
  status: "healthy" | "online" | "degraded" | "offline" | "unreachable";
  details: string;
}

/** An autonomous business module. */
export interface ModuleItem {
  name: string;
  type: string;
  status: "ready" | "running" | "stopped" | "error";
}

/** A tracked project / website. */
export interface ProjectItem {
  name: string;
  branch: string;
  status: string;
  action: string;
}

/** A task in the active queue. */
export interface TaskItem {
  id: string;
  title: string;
  owner: string;
  priority: string;
  progress: number;
  status: string;
  updatedAt: string;
}

/** A completed task in history. */
export interface CompletedTask {
  id: string;
  title: string;
  owner: string;
  completedAt: string;
  result: string;
}

/** A brainstorm / ideation stream card. */
export interface IdeaItem {
  id: string;
  title: string;
  category: string;
  owner: string;
  description: string;
}

/** An upcoming AI team meeting agenda. */
export interface MeetingItem {
  id: string;
  title: string;
  owner: string;
  time: string;
  agenda: string[];
}

/** An AI-generated summary / brief. */
export interface AiSummary {
  id: string;
  title: string;
  summary: string;
  owner: string;
  generatedAt: string;
}

/** A quick stat shown in the sidebar. */
export interface QuickStat {
  label: string;
  value: string;
  accent: "teal" | "pink";
}

/** An auto-installed Command Hub update card. */
export interface CommandHubUpdate {
  id: string;
  type: "tool" | "card" | "widget" | "info" | "success" | "warning";
  title: string;
  description: string;
  installed: boolean;
  createdAt: string;
}

/** A system control action available in the Control Actions panel. */
export type SystemControl = string;

/** The full dashboard state returned by GET /api/dashboard. */
export interface DashboardState {
  status: string;
  mode: string;
  lastSync: string;
  system: Record<string, number>;
  quickStats: QuickStat[];
  modules: ModuleItem[];
  services: ServiceStatus[];
  projects: ProjectItem[];
  projectMilestones: unknown[];
  systemControls: SystemControl[];
  logs: string[];
  tasks: TaskItem[];
  completedHistory: CompletedTask[];
  brainstormIdeas: IdeaItem[];
  meetingAgenda: MeetingItem[];
  aiSummaries: AiSummary[];
  meetingNotes: unknown[];
  commandHubUpdates: CommandHubUpdate[];
}

/** LLM configuration returned by GET /api/config. */
export interface LLMConfig {
  provider: string;
  model: string;
  geminiModel?: string;
  baseUrl?: string;
  ollamaBaseUrl?: string;
  hasGeminiKey: boolean;
}

/** Ollama runtime status from /api/ollama/status. */
export interface OllamaStatus {
  ok: boolean;
  version: string;
  model: string;
  activeModel: {
    name: string;
    processor: string;
    context: number | null;
  } | null;
  models: Array<{
    name: string;
    sizeGB: number | null;
    processor: string;
    context: number | null;
  }>;
  gpu: boolean;
  error?: string;
}

/** Health payload from /api/health. */
export interface HealthStatus {
  status: string;
  mode: string;
  service: string;
  timestamp: string;
  system: Record<string, number>;
  llm: {
    provider: string;
    model: string;
    ollama: OllamaStatus;
  };
}

/** Response from POST /api/chat. */
export interface ChatResponse {
  ok: boolean;
  message: string;
  instructions: Array<{ action: string; payload: Record<string, unknown> }>;
  executed: Array<{
    instruction: { action: string; payload: Record<string, unknown> };
    result: unknown;
  }>;
  reply: string;
}

/** Response from POST /api/playbooks/run. */
export interface PlaybookResponse {
  ok: boolean;
  playbook: string;
  summary?: string;
  roadmapFile?: string;
  reportFile?: string;
  auditFile?: string;
  sopFile?: string;
  tasksCreated?: string[];
  message?: string;
  /** The One-Click Tool id (e.g. "market-position") when run via a One-Click Tool. */
  tool?: string;
}

/** Live system telemetry returned by GET /api/system-metrics. */
export interface SystemMetrics {
  timestamp: string;
  hostname: string;
  platform: string;
  cpu: {
    percent: number;
    cores: number;
    model: string;
    loadAvg: number[];
  };
  memory: {
    percent: number;
    usedBytes: number;
    totalBytes: number;
    freeBytes: number;
  };
  disk: {
    percent: number;
    usedBytes: number;
    totalBytes: number;
    freeBytes: number;
  };
  network: {
    activeInterfaces: number;
    uploadMbps: number;
    downloadMbps: number;
  };
  processes: {
    count: number;
  };
  uptime: {
    seconds: number;
    human: string;
  };
  temperature: { celsius: number } | null;
}


/** Response from POST /api/site/monitor. */
export interface SiteMonitorResponse {
  ok: boolean;
  site: string;
  status: string;
  latencyMs: number;
  checkedAt: string;
}

/** Response from POST /api/project/scan. */
export interface ProjectScanResponse {
  ok: boolean;
  context: string;
  count: number;
}

/** Response from POST /api/gemini/sync. */
export interface GeminiSyncResponse {
  ok: boolean;
  count: number;
  message?: string;
}

/** Response from GET /api/ui/updates. */
export interface UiUpdatesResponse {
  ok: boolean;
  installed: CommandHubUpdate[];
}

/** Response from POST /api/ui/install-card. */
export interface InstallCardResponse {
  ok: boolean;
  update: CommandHubUpdate;
}

/** Generic API error shape. */
export interface ApiError {
  ok: false;
  message: string;
}
