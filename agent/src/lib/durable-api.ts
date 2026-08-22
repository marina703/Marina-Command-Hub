/* ============================================================
   MarinaAI — Durable API client
   Typed wrapper around the authenticated /api/durable/* routes.

   The browser code never sees the Supabase service-role key.
   Every call is scoped to the active workspace and the bearer
   token attached automatically by the dashboard server when
   the user is signed in.
   ============================================================ */

import { getSupabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

async function authHeaders(session: Session | null) {
  if (!session?.access_token) {
    throw new Error("No active session. Please sign in.");
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

async function getSessionOrThrow() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase client not configured");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("No active session");
  return data.session;
}

async function request<T>(
  url: string,
  init: RequestInit & { session: Session | null }
): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders(init.session)),
  } as Record<string, string>;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export type TaskStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_review"
  | "queued"
  | "running"
  | "awaiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DurableTask {
  id: string;
  workspaceId: string;
  projectId: string | null;
  creatorId: string | null;
  title: string;
  desiredOutcome: string;
  instructions: string;
  status: TaskStatus;
  priority: "Low" | "Medium" | "High" | "Critical";
  activePlanVersion: number | null;
  budgetLimit: number | null;
  timeLimitSeconds: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DurablePlanStep {
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
  status: string;
  estimatedDuration: number | null;
  estimatedCost: number | null;
  retryPolicy: Record<string, unknown>;
  createdAt: string;
}

export interface DurablePlan {
  id: string;
  workspaceId: string;
  taskId: string;
  version: number;
  status: "draft" | "approved" | "superseded" | "rejected";
  author: string;
  summary: string;
  assumptions: string[];
  risks: string[];
  createdAt: string;
  approvedAt: string | null;
  steps: DurablePlanStep[];
}

export interface DurableRun {
  id: string;
  workspaceId: string;
  taskId: string;
  planId: string | null;
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
}

export interface DurableRunEvent {
  id: string;
  runId: string;
  taskId: string | null;
  sequence: number;
  event: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface DurableArtifact {
  id: string;
  workspaceId: string;
  taskId: string | null;
  runId: string | null;
  type: string;
  displayName: string;
  mediaType: string;
  storageRef: string;
  contentHash: string;
  sizeBytes: number;
  state: "draft" | "ready" | "archived" | "deleted";
  summary: string;
  provenance: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface DurableApproval {
  id: string;
  workspaceId: string;
  taskId: string | null;
  runId: string | null;
  action: string;
  actionTarget: string;
  payloadHash: string;
  payloadPreview: Record<string, unknown>;
  riskTier: "low" | "moderate" | "high" | "critical";
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled" | "executed";
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string;
  executedResult: string | null;
  createdAt: string;
}

export interface WorkflowDef {
  id: string;
  label: string;
  availability: string;
  riskTier: string;
  provider: string;
  providerLabel: string;
  description: string;
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Tasks ──

export async function listDurableTasks(
  workspaceId: string,
  session: Session | null,
  opts: { status?: TaskStatus; limit?: number } = {}
) {
  return request<{ ok: boolean; tasks: DurableTask[] }>(
    `/api/durable/tasks${qs({ workspaceId, status: opts.status, limit: opts.limit ? String(opts.limit) : undefined })}`,
    { method: "GET", session }
  );
}

export async function createDurableTask(
  input: { workspaceId: string; title: string; desiredOutcome?: string; instructions?: string; priority?: string; budgetLimit?: number; timeLimitSeconds?: number },
  session: Session | null
) {
  return request<{ ok: boolean; task: DurableTask }>("/api/durable/tasks", {
    method: "POST",
    body: JSON.stringify(input),
    session,
  });
}

export async function getDurableTask(workspaceId: string, taskId: string, session: Session | null) {
  return request<{ ok: boolean; task: DurableTask }>(
    `/api/durable/tasks/${taskId}${qs({ workspaceId })}`,
    { method: "GET", session }
  );
}

export async function cancelDurableTask(
  workspaceId: string,
  taskId: string,
  reason: string,
  session: Session | null
) {
  return request<{ ok: boolean; task: DurableTask }>("/api/durable/tasks/cancel", {
    method: "POST",
    body: JSON.stringify({ workspaceId, taskId, reason }),
    session,
  });
}

// ── Plans ──

export async function listDurablePlans(workspaceId: string, taskId: string, session: Session | null) {
  return request<{ ok: boolean; plans: DurablePlan[] }>(
    `/api/durable/plans${qs({ workspaceId, taskId })}`,
    { method: "GET", session }
  );
}

export async function getDurablePlan(workspaceId: string, planId: string, session: Session | null) {
  return request<{ ok: boolean; plan: DurablePlan }>(
    `/api/durable/plans/${planId}${qs({ workspaceId })}`,
    { method: "GET", session }
  );
}

export async function generateDurablePlan(
  workspaceId: string,
  taskId: string,
  session: Session | null
) {
  return request<{
    ok: boolean;
    plan: DurablePlan;
    planApproval: DurableApproval;
    payloadHash: string;
    planner: { id: string; label: string; availability: string };
  }>("/api/durable/plans/generate", {
    method: "POST",
    body: JSON.stringify({ workspaceId, taskId }),
    session,
  });
}

export async function decideDurablePlan(
  workspaceId: string,
  planId: string,
  decision: "approve" | "reject",
  session: Session | null,
  options: { payloadHash?: string; note?: string } = {}
) {
  return request<{ ok: boolean; plan: DurablePlan }>("/api/durable/plans/decide", {
    method: "POST",
    body: JSON.stringify({ workspaceId, planId, decision, ...options }),
    session,
  });
}

export async function reviseDurablePlan(
  workspaceId: string,
  planId: string,
  session: Session | null,
  options: { feedback?: string; overrides?: Record<string, unknown> } = {}
) {
  return request<{ ok: boolean; plan: DurablePlan; planApproval: DurableApproval; payloadHash: string; supersededPlanId: string }>(
    "/api/durable/plans/revise",
    {
      method: "POST",
      body: JSON.stringify({ workspaceId, planId, ...options }),
      session,
    }
  );
}

// ── Runs ──

export async function listDurableRuns(workspaceId: string, taskId: string, session: Session | null) {
  return request<{ ok: boolean; runs: DurableRun[] }>(
    `/api/durable/runs${qs({ workspaceId, taskId })}`,
    { method: "GET", session }
  );
}

export async function listRunEvents(runId: string, workspaceId: string, session: Session | null) {
  return request<{ ok: boolean; events: DurableRunEvent[] }>(
    `/api/durable/runs/${runId}/events${qs({ workspaceId })}`,
    { method: "GET", session }
  );
}

export async function startDurableRun(
  workspaceId: string,
  taskId: string,
  planId: string,
  session: Session | null
) {
  return request<{
    ok: boolean;
    run: DurableRun;
    artifact: DurableArtifact;
    message: string;
    correlationId: string;
  }>("/api/durable/runs/start", {
    method: "POST",
    body: JSON.stringify({ workspaceId, taskId, planId }),
    session,
  });
}

export async function cancelDurableRun(
  workspaceId: string,
  runId: string,
  session: Session | null
) {
  return request<{ ok: boolean; run: DurableRun }>("/api/durable/runs/cancel", {
    method: "POST",
    body: JSON.stringify({ workspaceId, runId }),
    session,
  });
}

export async function retryDurableRun(
  workspaceId: string,
  runId: string,
  session: Session | null
) {
  return request<{
    ok: boolean;
    run: DurableRun;
    artifact: DurableArtifact;
    parentRunId: string;
    message: string;
    correlationId: string;
  }>("/api/durable/runs/retry", {
    method: "POST",
    body: JSON.stringify({ workspaceId, runId }),
    session,
  });
}

// ── Artifacts ──

export async function listDurableArtifacts(
  workspaceId: string,
  session: Session | null,
  opts: { taskId?: string; runId?: string; state?: string } = {}
) {
  return request<{ ok: boolean; artifacts: DurableArtifact[] }>(
    `/api/durable/artifacts${qs({ workspaceId, ...opts })}`,
    { method: "GET", session }
  );
}

export async function getArtifactDownloadUrl(
  workspaceId: string,
  artifactId: string,
  session: Session | null,
  options: { filename?: string; expiresIn?: number } = {}
) {
  return request<{ ok: boolean; url: string; expiresIn: number }>(
    "/api/durable/artifacts/download-url",
    {
      method: "POST",
      body: JSON.stringify({ workspaceId, artifactId, ...options }),
      session,
    }
  );
}

// ── Audit ──

export async function listDurableAuditEvents(
  workspaceId: string,
  session: Session | null,
  limit = 100
) {
  return request<{ ok: boolean; events: Array<Record<string, unknown>> }>(
    `/api/durable/audit${qs({ workspaceId, limit: String(limit) })}`,
    { method: "GET", session }
  );
}

// ── Workflows (public metadata) ──

export async function listDurableWorkflows() {
  return request<{ ok: boolean; workflows: WorkflowDef[] }>("/api/durable/workflows", {
    method: "GET",
    session: null,
  });
}

export { getSessionOrThrow };
