/* ============================================================
   MarinaAI — Durable Repository Implementations
   Server-only, service-role-backed Supabase data access for
   the authenticated core workflow.

   All functions return { ok, ...data, message? } so the
   dashboard server can make uniform routing decisions. The
   functions are pure CRUD wrappers with workspace_id scoping
   in the query itself; RLS still enforces final authorization
   via private.has_workspace_role(...).
   ============================================================ */

function mapTask(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    creatorId: r.creator_id,
    title: r.title,
    desiredOutcome: r.desired_outcome,
    instructions: r.instructions,
    status: r.status,
    priority: r.priority,
    activePlanVersion: r.active_plan_version,
    budgetLimit: r.budget_limit != null ? Number(r.budget_limit) : null,
    timeLimitSeconds: r.time_limit_seconds,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapPlan(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    taskId: r.task_id,
    version: r.version,
    status: r.status,
    author: r.author,
    summary: r.summary,
    assumptions: r.assumptions || [],
    risks: r.risks || [],
    createdAt: r.created_at,
    approvedAt: r.approved_at,
  };
}
function mapPlanStep(r) {
  if (!r) return null;
  return {
    id: r.id,
    planId: r.plan_id,
    taskId: r.task_id,
    workspaceId: r.workspace_id,
    position: r.position,
    title: r.title,
    purpose: r.purpose,
    dependencies: r.dependencies || [],
    toolClass: r.tool_class,
    inputSummary: r.input_summary,
    expectedOutput: r.expected_output,
    riskTier: r.risk_tier,
    requiresApproval: r.requires_approval,
    status: r.status,
    estimatedDuration: r.estimated_duration,
    estimatedCost: r.estimated_cost != null ? Number(r.estimated_cost) : null,
    retryPolicy: r.retry_policy || { maxRetries: 0 },
    createdAt: r.created_at,
  };
}
function mapRun(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    taskId: r.task_id,
    planId: r.plan_id,
    status: r.status,
    attemptCount: r.attempt_count,
    parentRunId: r.parent_run_id,
    provider: r.provider,
    toolSummary: r.tool_summary,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    failureClassification: r.failure_classification,
    budgetUsed: r.budget_used != null ? Number(r.budget_used) : 0,
    timeUsedMs: r.time_used_ms != null ? Number(r.time_used_ms) : 0,
    createdAt: r.created_at,
  };
}
function mapRunEvent(r) {
  if (!r) return null;
  return {
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    workspaceId: r.workspace_id,
    sequence: r.sequence,
    event: r.event,
    summary: r.summary,
    metadata: r.metadata || {},
    actor: r.actor,
    createdAt: r.created_at,
  };
}
function mapApproval(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    taskId: r.task_id,
    runId: r.run_id,
    planStepId: r.plan_step_id,
    actionType: r.action_type,
    actionTarget: r.action_target,
    payloadHash: r.payload_hash,
    payloadPreview: r.payload_preview || {},
    riskTier: r.risk_tier,
    reason: r.reason,
    requestedBy: r.requested_by,
    status: r.status,
    expiresAt: r.expires_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
    decisionNote: r.decision_note,
    executedResult: r.executed_result,
    createdAt: r.created_at,
  };
}
function mapArtifact(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    taskId: r.task_id,
    runId: r.run_id,
    type: r.type,
    displayName: r.display_name,
    mediaType: r.media_type,
    storageRef: r.storage_ref,
    contentHash: r.content_hash,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : 0,
    state: r.state,
    summary: r.summary,
    provenance: r.provenance || {},
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}
function mapAuditEvent(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    actorId: r.actor_id,
    actorType: r.actor_type,
    action: r.action,
    objectType: r.object_type,
    objectId: r.object_id,
    metadata: r.metadata || {},
    correlationId: r.correlation_id,
    createdAt: r.created_at,
  };
}

const NOT_CONFIGURED = { ok: false, message: "Supabase not configured" };

// Tasks
async function createTask(client, t) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("tasks")
    .insert({
      workspace_id: t.workspaceId,
      project_id: t.projectId || null,
      creator_id: t.creatorId || null,
      title: t.title,
      desired_outcome: t.desiredOutcome || "",
      instructions: t.instructions || "",
      status: t.status || "draft",
      priority: t.priority || "Medium",
      budget_limit: t.budgetLimit ?? null,
      time_limit_seconds: t.timeLimitSeconds ?? null,
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, task: mapTask(data) };
}

async function getTask(client, workspaceId, taskId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Task not found" };
  return { ok: true, task: mapTask(data) };
}

async function listTasks(client, workspaceId, filters = {}) {
  if (!client) return NOT_CONFIGURED;
  let q = client
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.limit) q = q.limit(filters.limit);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, tasks: (data || []).map(mapTask) };
}

async function updateTask(client, workspaceId, taskId, updates) {
  if (!client) return NOT_CONFIGURED;
  const WHITELIST = {
    title: "title",
    desired_outcome: "desiredOutcome",
    instructions: "instructions",
    status: "status",
    priority: "priority",
    active_plan_version: "activePlanVersion",
    budget_limit: "budgetLimit",
    time_limit_seconds: "timeLimitSeconds",
    cancelled_at: "cancelledAt",
    cancellation_reason: "cancellationReason",
  };
  const filtered = {};
  for (const col of Object.keys(WHITELIST)) {
    const camel = WHITELIST[col];
    if (updates && Object.prototype.hasOwnProperty.call(updates, camel)) {
      filtered[col] = updates[camel];
    }
  }
  const { data, error } = await client
    .from("tasks")
    .update(filtered)
    .eq("workspace_id", workspaceId)
    .eq("id", taskId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, task: mapTask(data) };
}

// Plans
async function nextPlanVersion(client, workspaceId, taskId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("plans")
    .select("version")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) return { ok: false, message: error.message };
  const top = (data && data[0] && data[0].version) || 0;
  return { ok: true, version: top + 1 };
}

async function createPlan(client, p) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("plans")
    .insert({
      workspace_id: p.workspaceId,
      task_id: p.taskId,
      version: p.version || 1,
      status: "draft",
      author: p.author || "system",
      summary: p.summary || "",
      assumptions: p.assumptions || [],
      risks: p.risks || [],
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, plan: mapPlan(data) };
}

async function createPlanSteps(client, steps) {
  if (!client) return NOT_CONFIGURED;
  if (!Array.isArray(steps) || steps.length === 0)
    return { ok: true, steps: [] };
  const rows = steps.map((s) => ({
    workspace_id: s.workspaceId,
    plan_id: s.planId,
    task_id: s.taskId,
    position: Number(s.position) || 0,
    title: String(s.title || "Step").slice(0, 200),
    purpose: String(s.purpose || "").slice(0, 500),
    dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
    tool_class: String(s.toolClass || "").slice(0, 100),
    input_summary: String(s.inputSummary || "").slice(0, 500),
    expected_output: String(s.expectedOutput || "").slice(0, 500),
    risk_tier: ["low", "moderate", "high", "critical"].includes(s.riskTier)
      ? s.riskTier
      : "low",
    requires_approval: Boolean(s.requiresApproval),
    estimated_duration: s.estimatedDuration ?? null,
    estimated_cost: s.estimatedCost ?? null,
    retry_policy: s.retryPolicy || { maxRetries: 0 },
  }));
  const { data, error } = await client.from("plan_steps").insert(rows).select();
  if (error) return { ok: false, message: error.message };
  return { ok: true, steps: (data || []).map(mapPlanStep) };
}

async function listPlansForTask(client, workspaceId, taskId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("plans")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .order("version", { ascending: true });
  if (error) return { ok: false, message: error.message };
  const planIds = (data || []).map((p) => p.id);
  let steps = [];
  if (planIds.length > 0) {
    const { data: stepData, error: stepErr } = await client
      .from("plan_steps")
      .select("*")
      .in("plan_id", planIds)
      .order("position", { ascending: true });
    if (stepErr) return { ok: false, message: stepErr.message };
    steps = (stepData || []).map(mapPlanStep);
  }
  return {
    ok: true,
    plans: (data || []).map((p) => ({
      ...mapPlan(p),
      steps: steps.filter((s) => s.planId === p.id),
    })),
  };
}

async function getPlan(client, workspaceId, planId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("plans")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", planId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Plan not found" };
  const { data: stepData, error: stepErr } = await client
    .from("plan_steps")
    .select("*")
    .eq("plan_id", planId)
    .order("position", { ascending: true });
  if (stepErr) return { ok: false, message: stepErr.message };
  return {
    ok: true,
    plan: { ...mapPlan(data), steps: (stepData || []).map(mapPlanStep) },
  };
}

async function updatePlanStatus(client, workspaceId, planId, newStatus) {
  if (!client) return NOT_CONFIGURED;
  const updates = { status: newStatus };
  if (newStatus === "approved") updates.approved_at = new Date().toISOString();
  const { data, error } = await client
    .from("plans")
    .update(updates)
    .eq("workspace_id", workspaceId)
    .eq("id", planId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  if (newStatus === "approved") {
    await client
      .from("plans")
      .update({ status: "superseded" })
      .eq("workspace_id", workspaceId)
      .eq("task_id", data.task_id)
      .eq("status", "approved")
      .neq("id", planId);
  }
  return { ok: true, plan: mapPlan(data) };
}

// Runs
async function createRun(client, r) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("runs")
    .insert({
      workspace_id: r.workspaceId,
      task_id: r.taskId,
      plan_id: r.planId || null,
      status: "queued",
      attempt_count: r.attemptCount || 1,
      parent_run_id: r.parentRunId || null,
      provider: r.provider || "deterministic-local-planner",
      tool_summary: r.toolSummary || "safe-internal",
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, run: mapRun(data) };
}

async function updateRunStatus(client, runId, status, details = {}) {
  if (!client) return NOT_CONFIGURED;
  const updates = { status };
  if (status === "active" && !details.skipStartedAt) {
    updates.started_at = new Date().toISOString();
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(status)) {
    updates.ended_at = new Date().toISOString();
    if (details.failureClassification)
      updates.failure_classification = details.failureClassification;
    if (details.timeUsedMs != null) updates.time_used_ms = details.timeUsedMs;
    if (details.budgetUsed != null) updates.budget_used = details.budgetUsed;
  }
  const { data, error } = await client
    .from("runs")
    .update(updates)
    .eq("id", runId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, run: mapRun(data) };
}

async function getRun(client, runId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Run not found" };
  return { ok: true, run: mapRun(data) };
}

async function listRunsForTask(client, workspaceId, taskId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: error.message };
  return { ok: true, runs: (data || []).map(mapRun) };
}

async function nextRunEventSequence(client, runId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("run_events")
    .select("sequence")
    .eq("run_id", runId)
    .order("sequence", { ascending: false })
    .limit(1);
  if (error) return { ok: false, message: error.message };
  const top = (data && data[0] && data[0].sequence) || 0;
  return { ok: true, sequence: top + 1 };
}

async function createRunEvent(client, e) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("run_events")
    .insert({
      workspace_id: e.workspaceId,
      run_id: e.runId,
      task_id: e.taskId || null,
      sequence: Number(e.sequence) || 0,
      event: e.event,
      summary: String(e.summary || "").slice(0, 500),
      metadata: e.metadata || {},
      actor: e.actor || "system",
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, event: mapRunEvent(data) };
}

async function listRunEvents(client, runId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("run_events")
    .select("*")
    .eq("run_id", runId)
    .order("sequence", { ascending: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true, events: (data || []).map(mapRunEvent) };
}

async function findActiveRun(client, workspaceId, taskId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("runs")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .in("status", ["queued", "active"])
    .limit(1);
  if (error) return { ok: false, message: error.message };
  return { ok: true, run: (data && data[0]) || null };
}

async function createApproval(client, a) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("approval_requests")
    .insert({
      workspace_id: a.workspaceId,
      project_id: a.projectId || null,
      task_id: a.taskId || null,
      run_id: a.runId || null,
      plan_step_id: a.planStepId || null,
      action_type: a.actionType || a.action,
      action_target: a.actionTarget || "",
      payload_hash: a.payloadHash,
      payload_preview: a.payloadPreview || {},
      risk_tier: a.riskTier || "high",
      reason: a.reason || "",
      requested_by: a.requestedBy || null,
      status: "pending",
      expires_at:
        a.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, approval: mapApproval(data) };
}

async function getApproval(client, workspaceId, approvalId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("approval_requests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Approval not found" };
  return { ok: true, approval: mapApproval(data) };
}

async function listApprovals(client, workspaceId, status) {
  if (!client) return NOT_CONFIGURED;
  let q = client
    .from("approval_requests")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, approvals: (data || []).map(mapApproval) };
}

async function updateApprovalStatus(client, workspaceId, approvalId, fields) {
  if (!client) return NOT_CONFIGURED;
  const WL = {
    status: "status",
    decided_at: "decidedAt",
    decided_by: "decidedBy",
    decision_note: "decisionNote",
    executed_result: "executedResult",
  };
  const filtered = {};
  for (const col of Object.keys(WL)) {
    const camel = WL[col];
    if (fields && Object.prototype.hasOwnProperty.call(fields, camel)) {
      filtered[col] = fields[camel];
    }
  }
  const { data, error } = await client
    .from("approval_requests")
    .update(filtered)
    .eq("workspace_id", workspaceId)
    .eq("id", approvalId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, approval: mapApproval(data) };
}

async function createArtifact(client, a) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("artifacts")
    .insert({
      workspace_id: a.workspaceId,
      task_id: a.taskId || null,
      run_id: a.runId || null,
      type: a.type || "document",
      display_name: a.displayName,
      media_type: a.mediaType || "text/markdown",
      storage_ref: a.storageRef || "",
      content_hash: a.contentHash || "",
      size_bytes: a.sizeBytes || 0,
      state: a.state || "draft",
      summary: a.summary || "",
      provenance: a.provenance || {},
      created_by: a.createdBy || null,
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, artifact: mapArtifact(data) };
}

async function updateArtifactState(client, workspaceId, artifactId, state) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("artifacts")
    .update({ state })
    .eq("workspace_id", workspaceId)
    .eq("id", artifactId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, artifact: mapArtifact(data) };
}

async function getArtifact(client, workspaceId, artifactId) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("artifacts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", artifactId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Artifact not found" };
  return { ok: true, artifact: mapArtifact(data) };
}

async function listArtifacts(client, workspaceId, filters) {
  filters = filters || {};
  if (!client) return NOT_CONFIGURED;
  let q = client
    .from("artifacts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (filters.taskId) q = q.eq("task_id", filters.taskId);
  if (filters.runId) q = q.eq("run_id", filters.runId);
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.state) q = q.eq("state", filters.state);
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  return { ok: true, artifacts: (data || []).map(mapArtifact) };
}

async function createAuditEvent(client, e) {
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("audit_events")
    .insert({
      workspace_id: e.workspaceId,
      actor_id: e.actorId || null,
      actor_type: e.actorType || "system",
      action: e.action,
      object_type: e.objectType || "",
      object_id: e.objectId || "",
      metadata: e.metadata || {},
      correlation_id: e.correlationId || null,
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, event: mapAuditEvent(data) };
}

async function listAuditEvents(client, workspaceId, limit) {
  limit = limit || 100;
  if (!client) return NOT_CONFIGURED;
  const { data, error } = await client
    .from("audit_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));
  if (error) return { ok: false, message: error.message };
  return { ok: true, events: (data || []).map(mapAuditEvent) };
}

module.exports = {
  mapTask,
  mapPlan,
  mapPlanStep,
  mapRun,
  mapRunEvent,
  mapApproval,
  mapArtifact,
  mapAuditEvent,
  createTask,
  getTask,
  listTasks,
  updateTask,
  nextPlanVersion,
  createPlan,
  createPlanSteps,
  listPlansForTask,
  getPlan,
  updatePlanStatus,
  createRun,
  updateRunStatus,
  getRun,
  listRunsForTask,
  nextRunEventSequence,
  createRunEvent,
  listRunEvents,
  findActiveRun,
  createApproval,
  getApproval,
  listApprovals,
  updateApprovalStatus,
  createArtifact,
  updateArtifactState,
  getArtifact,
  listArtifacts,
  createAuditEvent,
  listAuditEvents,
};
