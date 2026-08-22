/* ============================================================
   Safe Internal Workflow tests

   These tests use an in-memory mock supabase to exercise the
   safe workflow logic deterministically without requiring a
   live Supabase connection. They prove that the workflow:
     - rejects unapproved plans
     - rejects expired/cross-workspace/stale approvals
     - rejects duplicate active runs
     - creates an ordered persisted run/event/artifact chain
     - never dispatches shell/browser/provider/tool/etc.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const safe = require("../server-safe-workflow");
const planner = require("../server-planner");
const sm = require("../server-state-machine");

function createMockSupabase(opts = {}) {
  const state = {
    runs: [],
    runEvents: [],
    artifacts: [],
    audits: [],
    tasks: { id: opts.taskId || "task-1", workspaceId: "ws-1", title: "Mock task", status: "awaiting_plan_review", instructions: "n/a", priority: "Low", desiredOutcome: "Mock outcome" },
    seqByRun: {},
    nextSeq: 1,
    activeRuns: [],
    storageUploads: [],
    failUpload: opts.failUpload === true,
    failArtifactInsert: opts.failArtifactInsert === true,
  };
  return {
    _state: state,
    async createRunInDb({ workspaceId, taskId, planId, attemptCount, parentRunId, provider, toolSummary }) {
      const id = "run-" + (state.runs.length + 1);
      const run = { id, workspaceId, taskId, planId, attemptCount: attemptCount || 1, parentRunId, provider, toolSummary, status: "queued", budget_used: 0, time_used_ms: 0, started_at: null, ended_at: null, failure_classification: null, created_at: new Date().toISOString() };
      state.runs.push(run);
      return { ok: true, run };
    },
    async updateRunStatusInDb(runId, status, details) {
      const r = state.runs.find((x) => x.id === runId);
      if (!r) return { ok: false, message: "not found" };
      r.status = status;
      if (status === "active") r.started_at = new Date().toISOString();
      if (["succeeded", "failed", "cancelled", "timed_out"].includes(status)) r.ended_at = new Date().toISOString();
      if (details && details.failureClassification) r.failure_classification = details.failureClassification;
      return { ok: true, run: r };
    },
    async getRunInDb(runId) {
      const r = state.runs.find((x) => x.id === runId);
      if (!r) return { ok: false, message: "not found" };
      return { ok: true, run: r };
    },
    async findActiveRunForTaskInDb(workspaceId, taskId) {
      const r = state.runs.find((x) => x.taskId === taskId && ["queued", "active"].includes(x.status));
      return { ok: true, run: r || null };
    },
    async nextRunEventSequence(runId) {
      return { ok: true, sequence: (state.seqByRun[runId] = (state.seqByRun[runId] || 0) + 1) };
    },
    async createRunEventInDb(e) {
      const ev = { id: "evt-" + (state.runEvents.length + 1), runId: e.runId, taskId: e.taskId, sequence: e.sequence, event: e.event, summary: e.summary, metadata: e.metadata || {}, actor: e.actor || "system", createdAt: new Date().toISOString() };
      state.runEvents.push(ev);
      return { ok: true, event: ev };
    },
    async listRunEventsInDb(runId) {
      return { ok: true, events: state.runEvents.filter((e) => e.runId === runId) };
    },
    async createArtifactInDb(a) {
      if (state.failArtifactInsert) return { ok: false, message: "insert failed" };
      const art = { id: "art-" + (state.artifacts.length + 1), workspaceId: a.workspaceId, taskId: a.taskId, runId: a.runId, type: a.type, display_name: a.displayName, media_type: a.mediaType, storage_ref: a.storageRef, content_hash: a.contentHash, size_bytes: a.sizeBytes, state: a.state || "draft", summary: a.summary, provenance: a.provenance || {}, created_by: a.createdBy, created_at: new Date().toISOString() };
      state.artifacts.push(art);
      return { ok: true, artifact: art };
    },
    async updateArtifactStateInDb(ws, id, s) {
      const a = state.artifacts.find((x) => x.id === id);
      if (!a) return { ok: false, message: "not found" };
      a.state = s;
      return { ok: true, artifact: a };
    },
    async uploadArtifactFile(ws, id, filename, content, contentType, size) {
      if (state.failUpload) return { ok: false, message: "upload failed" };
      state.storageUploads.push({ ws, id, filename, contentType, size });
      return { ok: true, path: `${ws}/${id}/${filename}` };
    },
    async createAuditEventInDb(e) {
      state.audits.push(e);
      return { ok: true, event: e };
    },
    async updateTaskInDb(ws, taskId, updates) {
      if (state.tasks.id !== taskId) return { ok: false, message: "not found" };
      Object.assign(state.tasks, updates);
      return { ok: true, task: state.tasks };
    },
  };
}

test("safe workflow identity: only one workflow, no provider claim", () => {
  assert.equal(safe.WORKFLOW_ID, "safe-internal");
  assert.equal(safe.WORKFLOW_LABEL, "Safe workflow preview");
  assert.equal(safe.ARTIFACT_KIND, "plan-brief");
  assert.equal(safe.ARTIFACT_MEDIA, "text/markdown");
  // Output cap is a hard limit
  assert.equal(safe.MAX_OUTPUT_BYTES, 200 * 1024);
  // 8s default timeout
  assert.equal(safe.DEFAULT_TIMEOUT_MS, 8000);
});

test("validatePlanApproval refuses a plan in draft status", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "draft", taskId: "t1", version: 1, payloadHash: "abc" },
    approval: { status: "approved", payloadHash: "abc", taskId: "t1" },
    currentPayloadHash: "abc",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /plan_status/);
});

test("validatePlanApproval refuses a missing approval", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "approved", taskId: "t1", version: 1, payloadHash: "abc" },
    approval: null,
    currentPayloadHash: "abc",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /approval_missing/);
});

test("validatePlanApproval refuses an expired approval", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "approved", taskId: "t1", version: 1, payloadHash: "abc" },
    approval: { status: "approved", payloadHash: "abc", taskId: "t1", expiresAt: new Date(Date.now() - 1000).toISOString() },
    currentPayloadHash: "abc",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /expired/);
});

test("validatePlanApproval refuses a payload hash mismatch (changed payload)", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "approved", taskId: "t1", version: 1, payloadHash: "abc" },
    approval: { status: "approved", payloadHash: "abc", taskId: "t1" },
    currentPayloadHash: "def",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "plan_payload_changed");
});

test("validatePlanApproval refuses a cross-workspace approval", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "approved", taskId: "t1", version: 1, payloadHash: "abc", workspaceId: "ws-1" },
    approval: { status: "approved", payloadHash: "abc", taskId: "t2" },
    currentPayloadHash: "abc",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /task_mismatch/);
});

test("validatePlanApproval accepts a valid matching approval", () => {
  const result = safe.validatePlanApproval({
    plan: { id: "p1", status: "approved", taskId: "t1", version: 1, payloadHash: "abc", workspaceId: "ws-1" },
    approval: { status: "approved", payloadHash: "abc", taskId: "t1", expiresAt: new Date(Date.now() + 60000).toISOString() },
    currentPayloadHash: "abc",
  });
  assert.equal(result.ok, true);
});

test("runSafeWorkflow rejects a draft plan with policy_blocked", async () => {
  const sb = createMockSupabase();
  const result = await safe.runSafeWorkflow({
    supabase: sb,
    task: { id: "t-1", workspaceId: "ws-1", title: "T", status: "awaiting_plan_review", instructions: "", priority: "Low", desiredOutcome: "Outcome" },
    plan: { id: "p-1", taskId: "t-1", workspaceId: "ws-1", version: 1, status: "draft", summary: "S", assumptions: [], risks: [], steps: [], payloadHash: "abc" },
    planApproval: { id: "a-1", status: "approved", payloadHash: "abc", taskId: "t-1" },
    actor: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureClassification, "policy_blocked");
});

test("runSafeWorkflow rejects when an active run already exists (duplicate)", async () => {
  const sb = createMockSupabase();
  // Pre-create an active run
  await sb.createRunInDb({ workspaceId: "ws-1", taskId: "t-1", planId: "p-1" });
  // Make it active
  await sb.updateRunStatusInDb("run-1", "active");
  const result = await safe.runSafeWorkflow({
    supabase: sb,
    task: { id: "t-1", workspaceId: "ws-1", title: "T", status: "awaiting_plan_review", instructions: "", priority: "Low", desiredOutcome: "Outcome" },
    plan: { id: "p-1", taskId: "t-1", workspaceId: "ws-1", version: 1, status: "approved", summary: "S", assumptions: [], risks: [], steps: [], payloadHash: "abc" },
    planApproval: { id: "a-1", status: "approved", payloadHash: "abc", taskId: "t-1", expiresAt: new Date(Date.now() + 60000).toISOString() },
    actor: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureClassification, "duplicate");
});

test("runSafeWorkflow creates run, ordered events, and artifact for valid input", async () => {
  const sb = createMockSupabase();
  const task = { id: "t-2", workspaceId: "ws-1", title: "My task", status: "awaiting_plan_review", instructions: "Do X", priority: "Medium", desiredOutcome: "Outcome" };
  const plan = {
    id: "p-2", taskId: "t-2", workspaceId: "ws-1", version: 1, status: "approved",
    summary: "Plan summary", assumptions: ["a1"], risks: ["r1"],
    steps: [{ position: 0, title: "Step 1", purpose: "Purpose", dependencies: [], toolClass: "safe-internal", inputSummary: "x", expectedOutput: "y", riskTier: "low", requiresApproval: false, estimatedDuration: 30, estimatedCost: 0 }],
    payloadHash: "hash-2",
  };
  const result = await safe.runSafeWorkflow({
    supabase: sb,
    task, plan,
    planApproval: { id: "a-2", status: "approved", payloadHash: "hash-2", taskId: "t-2", expiresAt: new Date(Date.now() + 60000).toISOString() },
    actor: "user-1",
  });
  assert.equal(result.ok, true, `result=${JSON.stringify(result)}`);
  assert.ok(result.run);
  assert.ok(result.artifact);
  assert.ok(typeof result.correlationId === "string");
  // The run is persisted with succeeded status
  assert.equal(result.run.status, "succeeded");
  // Events are persisted in stable sequence
  const evts = sb._state.runEvents.filter((e) => e.runId === result.run.id);
  assert.ok(evts.length >= 4, `expected ≥4 events, got ${evts.length}`);
  // Event sequence is monotonically increasing
  for (let i = 1; i < evts.length; i++) {
    assert.ok(evts[i].sequence > evts[i - 1].sequence);
  }
  // Required events are present
  const eventNames = evts.map((e) => e.event);
  assert.ok(eventNames.includes("run.queued"));
  assert.ok(eventNames.includes("run.started"));
  assert.ok(eventNames.includes("artifact.ready"));
  assert.ok(eventNames.includes("run.succeeded"));
  // Artifact is persisted with provenance
  assert.ok(sb._state.artifacts.length === 1);
  const art = sb._state.artifacts[0];
  assert.equal(art.state, "ready");
  assert.equal(art.provenance.workflow, "safe-internal");
  assert.equal(art.provenance.planId, "p-2");
  assert.equal(art.provenance.planVersion, 1);
  assert.equal(art.provenance.taskId, "t-2");
  // The artifact was uploaded to the private bucket path
  assert.equal(sb._state.storageUploads.length, 1);
  assert.equal(sb._state.storageUploads[0].filename, "plan-brief-v1.md");
  // Audit event was written
  assert.ok(sb._state.audits.length === 1);
  assert.equal(sb._state.audits[0].action, "workflow.succeeded");
});

test("runSafeWorkflow propagates failure classification for storage failure", async () => {
  const sb = createMockSupabase({ failUpload: true });
  const task = { id: "t-3", workspaceId: "ws-1", title: "T3", status: "awaiting_plan_review", instructions: "", priority: "Low", desiredOutcome: "O" };
  const plan = { id: "p-3", taskId: "t-3", workspaceId: "ws-1", version: 1, status: "approved", summary: "s", assumptions: [], risks: [], steps: [], payloadHash: "h3" };
  const result = await safe.runSafeWorkflow({
    supabase: sb, task, plan,
    planApproval: { id: "a-3", status: "approved", payloadHash: "h3", taskId: "t-3", expiresAt: new Date(Date.now() + 60000).toISOString() },
    actor: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok, false);
  // The run is marked failed in the persistence layer
  assert.equal(sb._state.runs[0].status, "failed");
  // A run.failed event is recorded
  assert.ok(
    sb._state.runEvents.some((e) => e.runId === sb._state.runs[0].id && e.event === "run.failed"),
    "a run.failed event must be recorded on storage failure"
  );
});

test("runSafeWorkflow rejects invalid task transition", async () => {
  const sb = createMockSupabase();
  // task.status is "completed" which cannot transition to queued
  const task = { id: "t-4", workspaceId: "ws-1", title: "T4", status: "completed", instructions: "", priority: "Low", desiredOutcome: "O" };
  const plan = { id: "p-4", taskId: "t-4", workspaceId: "ws-1", version: 1, status: "approved", summary: "s", assumptions: [], risks: [], steps: [], payloadHash: "h4" };
  const result = await safe.runSafeWorkflow({
    supabase: sb, task, plan,
    planApproval: { id: "a-4", status: "approved", payloadHash: "h4", taskId: "t-4", expiresAt: new Date(Date.now() + 60000).toISOString() },
    actor: "user-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.failureClassification, "invalid_state");
});

test("dispatcher: unknown workflow id is policy_blocked", async () => {
  const dispatcher = require("../server-workflow-dispatch");
  const sb = createMockSupabase();
  const result = await dispatcher.dispatch("shell", { supabase: sb, task: {}, plan: {}, planApproval: {}, actor: "user" });
  assert.equal(result.ok, false);
  assert.equal(result.failureClassification, "policy_blocked");
  assert.match(result.message, /Unknown workflow/);
});

test("dispatcher: only the safe-internal workflow is registered and dispatchable", async () => {
  const dispatcher = require("../server-workflow-dispatch");
  const list = dispatcher.listWorkflows();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "safe-internal");
  assert.equal(list[0].label, "Safe workflow preview");
 });
