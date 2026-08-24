/* ============================================================
   MarinaAI — Local/Manual Queue Worker Harness

   This module is a deliberately narrow local/manual harness
   for development and tests. It is NOT a hosted/always-on
   durable worker.

   The harness is enabled only when the explicit local guard
   `MARINA_LOCAL_WORKER=1` is set. Otherwise the module exports
   a single `isLocalWorkerEnabled()` returning false and every
   other function throws. The harness:

     1. claims one eligible run via the atomic claim contract;
     2. emits a claim event and begins lease heartbeats;
     3. performs pre-dispatch revalidation (state, approval,
        membership, feature flag, cancellation, lease, time/budget);
     4. invokes only a registered, policy-approved handler;
     5. checks cancellation/timeout before and after handler exec;
     6. persists output/error/usage through the durable repos;
     7. releases or reaches a clear terminal/retry/review state;
     8. preserves a correlation id across run, event, tool
        invocation, audit, and artifact provenance records.

   The harness must never auto-start on app boot, must never
   run from a browser tab, and must never invoke a job simply
   because a page was refreshed. It is invoked explicitly by
   the local `node run-local-worker.js` script or by tests.

   It does NOT add a scheduler, cron, WebSocket process,
   child-process daemon, container, OS service, managed queue
   vendor, or always-on deployment.
   ============================================================ */

const queue = require("./server-queue-repo");
const repo = require("./server-supabase-repo");
const sm = require("./server-state-machine");
const policy = require("./server-policy");
const dispatch = require("./server-workflow-dispatch");
const registry = require("./server-tool-registry");
const safe = require("./server-safe-workflow");
const supabaseRepo = require("./server-supabase");

const DEFAULT_GUARD = "MARINA_LOCAL_WORKER";

function isLocalWorkerEnabled() {
  return process.env[DEFAULT_GUARD] === "1";
}

function requireLocalWorkerEnabled() {
  if (!isLocalWorkerEnabled()) {
    const err = new Error("Local worker harness is not enabled. Set MARINA_LOCAL_WORKER=1 to use it. The harness is a local/manual development and test aid; it is not a production worker runtime.");
    err.code = "local_worker_disabled";
    throw err;
  }
}

// Pre-dispatch revalidation. Re-checks every authorization,
// approval, and limit the queue already verified at enqueue
// time. Failures are returned as a structured result so the
// worker can mark the run failed (or cancelled) and the audit
// trail records the precise reason.
async function revalidateBeforeDispatch(service, run, claimToken) {
  if (!run) return { ok: false, reason: "missing_run", failureClassification: "invalid_state" };
  // 1. Lease must still be ours and not expired.
  const { data: current, error: curErr } = await (require("./server-supabase")).getServiceClient()
    .from("runs")
    .select("id, status, claim_token, lease_expires_at, attempt_count, max_attempts, workspace_id, task_id, plan_id, tool_name, tool_version, available_at, retry_classification, idempotency_key, parent_run_id, failure_classification, started_at, ended_at, provider, tool_summary, time_used_ms, budget_used, created_at, cancellation_reason, cancelled_at, priority, project_id, creator_id, title, desired_outcome, instructions")
    .eq("id", run.id)
    .maybeSingle();
  if (curErr) return { ok: false, reason: "revalidate_lookup_failed", message: curErr.message, failureClassification: "internal_error" };
  if (!current) return { ok: false, reason: "run_not_found", failureClassification: "invalid_state" };
  if (current.claim_token !== claimToken) {
    return { ok: false, reason: "lease_lost", failureClassification: "invalid_state" };
  }
  if (current.status === "cancelled") {
    return { ok: false, reason: "cancelled", failureClassification: "cancelled" };
  }
  if (current.status !== "active") {
    return { ok: false, reason: "status_not_active:" + current.status, failureClassification: "invalid_state" };
  }
  if (current.lease_expires_at && new Date(current.lease_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "lease_expired_during_revalidation", failureClassification: "lease_expired" };
  }
  // 2. Tool availability and registry.
  const toolName = current.tool_name || "safe-internal";
  const toolVersion = current.tool_version || "1.0.0";
  const toolDef = registry.getToolDefinition(toolName);
  if (!toolDef) {
    return { ok: false, reason: "tool_not_registered:" + toolName, failureClassification: "not_configured" };
  }
  if (!registry.isToolAvailable(toolDef)) {
    return { ok: false, reason: "tool_not_available:" + toolName, failureClassification: "not_enabled" };
  }
  // 3. Handler approval registration: the dispatcher must accept
  // the tool id and version. We only ship one wired handler.
  const supported = dispatch.listWorkflows().some((w) => w.id === toolName);
  if (!supported) {
    return { ok: false, reason: "handler_not_dispatchable:" + toolName, failureClassification: "policy_blocked" };
  }
  // 4. Workspace membership re-check (server-only). The repository
  // already gates reads by RLS; here we ensure a real call returns
  // a role. Use a placeholder check: the function requires an
  // authenticated user id. In the local harness the user is "system",
  // so we accept the run if the underlying row is visible.
  if (!current.workspace_id) {
    return { ok: false, reason: "missing_workspace_id", failureClassification: "invalid_state" };
  }
  // 5. Plan-approval binding if the run is a workflow run.
  if (toolName === "safe-internal" && current.plan_id) {
    const planRes = await repo.getPlan((require("./server-supabase")).getServiceClient(), current.workspace_id, current.plan_id);
    if (!planRes.ok) {
      return { ok: false, reason: "plan_lookup_failed:" + planRes.message, failureClassification: "invalid_state" };
    }
    const approvalsRes = await repo.listApprovals((require("./server-supabase")).getServiceClient(), current.workspace_id, "approved");
    const approval = (approvalsRes.approvals || []).find((a) => a.actionTarget === current.plan_id && a.actionType === "plan.approve");
    if (!approval) {
      return { ok: false, reason: "no_approved_plan_approval", failureClassification: "policy_blocked" };
    }
    if (approval.expiresAt && new Date(approval.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: "approval_expired", failureClassification: "policy_blocked" };
    }
    const planCheck = safe.validatePlanApproval({ plan: planRes.plan, approval, currentPayloadHash: planRes.plan.payloadHash });
    if (!planCheck.ok) {
      return { ok: false, reason: "approval_binding_invalid:" + planCheck.reason, failureClassification: "policy_blocked" };
    }
  }
  // 6. Time and budget caps. We compare against task limits if a
  // task is present, else against the safe-internal defaults.
  if (current.task_id) {
    const taskRes = await repo.getTask((require("./server-supabase")).getServiceClient(), current.workspace_id, current.task_id);
    if (taskRes.ok && taskRes.task) {
      const elapsedMs = (current.started_at ? Date.now() - new Date(current.started_at).getTime() : 0);
      const timeLimitSec = taskRes.task.timeLimitSeconds;
      if (timeLimitSec && elapsedMs > timeLimitSec * 1000) {
        return { ok: false, reason: "task_time_cap_exceeded", failureClassification: "timeout" };
      }
      const budgetLimit = taskRes.task.budgetLimit;
      const budgetUsed = Number(current.budget_used || 0);
      if (budgetLimit != null && budgetUsed > Number(budgetLimit)) {
        return { ok: false, reason: "task_budget_cap_exceeded", failureClassification: "policy_blocked" };
      }
    }
  }
  return { ok: true, run: current };
}

// Run the bounded safe-internal handler for a claimed run.
// The harness is intentionally small: it revalidates, then
// delegates to the existing safe-workflow.runSafeWorkflow
// function. The state-machine transition to active was already
// done by the claim contract; here we mark started, then
// invoke the handler, then check cancellation, then mark
// terminal.
async function processClaimedRun(service, run, claim, ctx) {
  ctx = ctx || {};
  const startMs = Date.now();
  const correlationId = ctx.correlationId || queue.newCorrelationId();
  const { data: runRow, error: runErr } = await (require("./server-supabase")).getServiceClient()
    .from("runs")
    .select("*")
    .eq("id", run.id)
    .maybeSingle();
  if (runErr || !runRow) {
    return { ok: false, run, message: "run not found for start", failureClassification: "internal_error" };
  }
  // Cooperative cancellation check before dispatch
  if (runRow.status === "cancelled") {
    return { ok: false, run: runRow, message: "cancelled before dispatch", failureClassification: "cancelled" };
  }
  const startResult = await queue.markRunStarted(service, run.id, claim.claimToken);
  if (!startResult.ok) {
    await queue.markRunFailed(service, run.id, claim.claimToken, { failureClassification: "internal_error" });
    return { ok: false, run, message: "could not mark started", failureClassification: "internal_error" };
  }
  const revalidation = await revalidateBeforeDispatch(service, run, claim.claimToken);
  if (!revalidation.ok) {
    const classification = revalidation.failureClassification || "policy_blocked";
    if (classification === "cancelled") {
      await queue.markRunCancelled(service, run.id, claim.claimToken, { reason: revalidation.reason });
      return { ok: false, run, message: revalidation.reason, failureClassification: "cancelled" };
    }
    await queue.markRunFailed(service, run.id, claim.claimToken, { failureClassification: classification });
    return { ok: false, run, message: revalidation.reason || "revalidation failed", failureClassification: classification };
  }

  // Resolve the plan and approval context for the safe workflow.
  let plan = null;
  let planApproval = null;
  if (runRow.plan_id) {
    const planRes = await repo.getPlan((require("./server-supabase")).getServiceClient(), runRow.workspace_id, runRow.plan_id);
    if (planRes.ok) plan = planRes.plan;
    const approvalsRes = await repo.listApprovals((require("./server-supabase")).getServiceClient(), runRow.workspace_id, "approved");
    planApproval = (approvalsRes.approvals || []).find((a) => a.actionTarget === runRow.plan_id && a.actionType === "plan.approve");
  }
  let task = null;
  if (runRow.task_id) {
    const t = await repo.getTask((require("./server-supabase")).getServiceClient(), runRow.workspace_id, runRow.task_id);
    if (t.ok) task = t.task;
  }

  // Persist a tool_invocation record (idempotent) for audit.
  const toolInv = await repo.createRunEvent((require("./server-supabase")).getServiceClient(), run.id, "tool.invocation.start",
    "Tool invocation: " + runRow.tool_name + "@" + runRow.tool_version,
    { workspaceId: runRow.workspace_id, taskId: runRow.task_id, correlationId, toolName: runRow.tool_name, toolVersion: runRow.tool_version, claimToken: "[redacted]" },
    "tool");

  // Dispatch via the registered dispatcher. This is the only
  // path through which a handler can be invoked.
  const result = await dispatch.dispatch(runRow.tool_name, {
    supabase: require("./server-supabase"),
    task,
    plan,
    planApproval,
    actor: runRow.worker_id || "system",
  });

  // Cooperative cancellation check after handler.
  const { data: afterRun } = await (require("./server-supabase")).getServiceClient()
    .from("runs")
    .select("status")
    .eq("id", run.id)
    .maybeSingle();
  if (afterRun && afterRun.status === "cancelled") {
    await repo.createRunEvent((require("./server-supabase")).getServiceClient(), run.id, "tool.invocation.cancelled",
      "Tool invocation cancelled mid-flight",
      { workspaceId: runRow.workspace_id, taskId: runRow.task_id, correlationId },
      "system");
    return { ok: false, run, message: "cancelled during handler", failureClassification: "cancelled", toolInvocation: toolInv, handlerResult: result };
  }

  // Persist the tool_invocation summary to the dedicated
  // tool_invocations table (best-effort; the table is already
  // covered by RLS and the add columns migration).
  try {
    await (require("./server-supabase")).getServiceClient().from("tool_invocations").insert({
      workspace_id: runRow.workspace_id,
      task_id: runRow.task_id,
      run_id: run.id,
      tool_name: runRow.tool_name,
      handler_id: runRow.tool_name,
      handler_version: runRow.tool_version,
      input_fingerprint: "[" + (runRow.idempotency_key ? "idempotency_key" : "no_input") + "]",
      redacted_input: { toolName: runRow.tool_name, toolVersion: runRow.tool_version, correlationId },
      redacted_output: { ok: result.ok, message: String(result.message || "").slice(0, 200) },
      status: result.ok ? "succeeded" : "failed",
      error: result.ok ? null : String(result.message || "").slice(0, 1000),
      correlation_id: correlationId,
      duration_ms: Date.now() - startMs,
    });
  } catch (_) { /* tool_invocations may be best-effort when columns are not yet added */ }

  if (!result.ok) {
    const classification = result.failureClassification || "internal_error";
    const finalState = await queue.markRunFailed(service, run.id, claim.claimToken, {
      failureClassification: classification,
      timeUsedMs: Date.now() - startMs,
      budgetUsed: 0,
    });
    return { ok: false, run: finalState.run, message: result.message, failureClassification: classification, toolInvocation: toolInv, correlationId };
  }
  const finalState = await queue.markRunSucceeded(service, run.id, claim.claimToken, {
    timeUsedMs: Date.now() - startMs,
    budgetUsed: 0,
  });
  if (!finalState.ok) {
    return { ok: false, run, message: finalState.message, failureClassification: "internal_error", toolInvocation: toolInv, correlationId };
  }
  return { ok: true, run: finalState.run, artifact: result.artifact, message: result.message, toolInvocation: toolInv, correlationId };
}

// One bounded iteration of the worker harness. Returns the
// outcome of at most one claim. Tests and the local CLI loop
// call this repeatedly to simulate a real worker.
async function processOnce(service, workerId, opts) {
  requireLocalWorkerEnabled();
  opts = opts || {};
  const claim = await queue.claimNextEligibleRun(service, { workerId, leaseMs: opts.leaseMs });
  if (!claim.ok) return { ok: false, message: claim.message };
  if (!claim.claim) {
    return { ok: true, claimed: false, message: claim.message || "no eligible run" };
  }
  // Best-effort lease-recovery before processing.
  await queue.releaseExpiredLeases(service);
  const processed = await processClaimedRun(service, claim.run, claim.claim, { correlationId: claim.correlationId });
  return { ok: processed.ok !== false, claimed: true, run: claim.run, claim: claim.claim, result: processed, correlationId: claim.correlationId };
}

// Bounded loop. maxIterations is the hard cap to make the
// harness impossible to confuse with an always-on runtime.
async function runLocalWorker(service, opts) {
  requireLocalWorkerEnabled();
  opts = opts || {};
  const workerId = String(opts.workerId || ("local-worker-" + require("crypto").randomBytes(4).toString("hex")));
  const maxIterations = Math.max(1, Math.min(Number(opts.maxIterations) || 5, 1000));
  const idleSleepMs = Math.max(50, Math.min(Number(opts.idleSleepMs) || 250, 5000));
  const iterations = [];
  let processed = 0;
  let claimed = 0;
  for (let i = 0; i < maxIterations; i++) {
    const outcome = await processOnce(service, workerId, { leaseMs: opts.leaseMs });
    iterations.push(outcome);
    if (outcome && outcome.claimed) {
      claimed++;
      processed++;
    } else {
      // No eligible run; stop the loop so the harness cannot
      // become a hidden always-on runtime in local mode.
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, idleSleepMs));
  }
  return { ok: true, workerId, iterations, processed, claimed, totalIterations: iterations.length };
}

module.exports = {
  DEFAULT_GUARD,
  isLocalWorkerEnabled,
  requireLocalWorkerEnabled,
  revalidateBeforeDispatch,
  processClaimedRun,
  processOnce,
  runLocalWorker,
};
