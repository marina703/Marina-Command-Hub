/* ============================================================
   MarinaAI — Durable Queue & Worker Repository

   Server-only, service-role-backed queue primitives for the
   authenticated core workflow. This module adapts to the
   existing `runs`, `run_events`, `tool_invocations`, and
   `audit_events` tables. The only additive schema requirements
   are documented in
     supabase/migrations/20260823000001_durable_queue_foundation.sql
   That migration is staged but NOT applied in this milestone.

   Every function in this module:
     - Returns { ok, ...data, message? } consistently.
     - Treats Supabase absence as a truthful "not_configured"
       unavailable state.
     - Performs the atomic claim / heartbeat / cancel contract
       using a single SQL update guarded by WHERE clauses on
       (id, status, claim_token) so two workers cannot
       simultaneously claim the same run.
     - Records ordered run events and redacted audit events
       through the existing server-supabase-repo surface so
       page-refresh reconstruction works without server memory.

   This module does NOT start a worker. It is the durable
   storage layer used by both the HTTP routes and the
   local/manual harness in server-queue-worker.js.
   ============================================================ */

const repo = require("./server-supabase-repo");

const NOT_CONFIGURED = { ok: false, message: "Supabase not configured" };

const LEASE_DEFAULTS = {
  leaseMs: 30 * 1000,
  heartbeatMs: 5 * 1000,
  maxAttempts: 3,
  backoffBaseMs: 2 * 1000,
  backoffCapMs: 60 * 1000,
};

const RETRY_CLASSIFICATIONS = new Set([
  "internal_error",
  "timeout",
  "transient_provider",
]);

const NOT_RETRYABLE_REASONS = {
  policy_blocked: "policy_blocked is never retried",
  invalid_state: "invalid_state is never retried",
  cancelled: "cancelled is never retried",
  duplicate: "duplicate is never retried",
};

function newCorrelationId() {
  return require("./server-safe-workflow").newCorrelationId();
}

function newClaimToken() {
  return require("crypto").randomBytes(16).toString("hex");
}

function classifyRunFailureForRetry(failureClassification) {
  if (!failureClassification) return { retryable: false, reason: "no classification" };
  if (RETRY_CLASSIFICATIONS.has(failureClassification)) {
    return { retryable: true, reason: "retryable classification" };
  }
  if (NOT_RETRYABLE_REASONS[failureClassification]) {
    return { retryable: false, reason: NOT_RETRYABLE_REASONS[failureClassification] };
  }
  return { retryable: false, reason: "unrecognized classification " + failureClassification };
}

function computeBackoffMs(attemptCount) {
  if (attemptCount <= 1) return 0;
  const exp = Math.min(attemptCount - 2, 10);
  const ms = LEASE_DEFAULTS.backoffBaseMs * Math.pow(2, exp);
  return Math.min(ms, LEASE_DEFAULTS.backoffCapMs);
}

function getClient(service) {
  if (!service) return null;
  if (typeof service.getServiceClient === "function") return service.getServiceClient();
  return service;
}

async function appendRunEvent(client, runId, eventName, summary, metadata, actor) {
  const seqRes = await repo.nextRunEventSequence(client, runId);
  return repo.createRunEvent(client, {
    workspaceId: metadata && metadata.workspaceId,
    runId,
    taskId: metadata && metadata.taskId,
    sequence: seqRes.ok ? seqRes.sequence : 0,
    event: eventName,
    summary,
    metadata: metadata || {},
    actor: actor || "system",
  });
}

async function enqueueRun(service, args) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!args || !args.workspaceId || !args.taskId) {
    return { ok: false, message: "workspaceId and taskId are required" };
  }
  const correlationId = args.correlationId || newCorrelationId();
  const idempotencyKey = args.idempotencyKey ? String(args.idempotencyKey).slice(0, 200) : null;
  const toolName = String(args.toolName || "safe-internal").slice(0, 100);
  const toolVersion = String(args.toolVersion || "1.0.0").slice(0, 50);
  const maxAttempts = Math.max(1, Math.min(Number(args.maxAttempts) || LEASE_DEFAULTS.maxAttempts, 10));
  const availableAt = args.availableAt || new Date().toISOString();

  if (idempotencyKey) {
    const { data: existing, error: exErr } = await client.from("runs")
      .select("*")
      .eq("workspace_id", args.workspaceId)
      .eq("task_id", args.taskId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (exErr) return { ok: false, message: exErr.message };
    if (existing) {
      return {
        ok: true,
        isExisting: true,
        run: repo.mapRun(existing),
        message: "Idempotent enqueue: existing run returned",
      };
    }
  }

  const insert = await client.from("runs").insert({
    workspace_id: args.workspaceId,
    task_id: args.taskId,
    plan_id: args.planId || null,
    status: "queued",
    attempt_count: 1,
    parent_run_id: args.parentRunId || null,
    provider: args.provider || "deterministic-local-planner",
    tool_summary: toolName,
    tool_name: toolName,
    tool_version: toolVersion,
    available_at: availableAt,
    idempotency_key: idempotencyKey,
    max_attempts: maxAttempts,
  }).select().single();

  if (insert.error) {
    if (idempotencyKey && /runs_idempotency_key_uidx|duplicate key value/i.test(insert.error.message || "")) {
      const { data: raceWinner } = await client.from("runs")
        .select("*")
        .eq("workspace_id", args.workspaceId)
        .eq("task_id", args.taskId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raceWinner) {
        return {
          ok: true,
          isExisting: true,
          run: repo.mapRun(raceWinner),
          message: "Idempotent enqueue: race winner returned",
        };
      }
    }
    return { ok: false, message: insert.error.message };
  }

  const run = insert.data;
  await appendRunEvent(client, run.id, "run.queued",
    "Run " + run.id + " enqueued for " + toolName + "@" + toolVersion,
    { workspaceId: args.workspaceId, taskId: args.taskId, correlationId, toolName, toolVersion, maxAttempts, idempotencyKey, availableAt, requestedBy: args.requestedBy || null },
    "system");
  await repo.createAuditEvent(client, {
    workspaceId: args.workspaceId,
    actorId: args.actorId || null,
    actorType: "user",
    action: "queue.enqueued",
    objectType: "run",
    objectId: run.id,
    metadata: {
      toolName,
      toolVersion,
      correlationId,
      maxAttempts,
      idempotencyKey: idempotencyKey ? "[idempotency_key]" : null,
      inputFingerprint: args.inputFingerprint ? "[redacted]" : null,
    },
    correlationId,
  });
  return { ok: true, isExisting: false, run: repo.mapRun(run), correlationId };
}

async function claimNextEligibleRun(service, args) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  const workerId = String(args && args.workerId || "").slice(0, 200);
  if (!workerId) return { ok: false, message: "workerId is required" };
  const leaseMs = Math.max(1000, Math.min(Number(args && args.leaseMs) || LEASE_DEFAULTS.leaseMs, 5 * 60 * 1000));
  const claimToken = newClaimToken();
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();

  let q = client.from("runs")
    .select("id, workspace_id, task_id, plan_id, tool_name, tool_version, status, attempt_count, max_attempts, available_at, retry_classification, idempotency_key")
    .eq("status", "queued")
    .lte("available_at", nowIso)
    .or("lease_expires_at.is.null,lease_expires_at.lt." + nowIso)
    .order("available_at", { ascending: true })
    .limit(1);
  if (args && args.workspaceId) q = q.eq("workspace_id", args.workspaceId);

  const { data: candidates, error: candErr } = await q;
  if (candErr) return { ok: false, message: candErr.message };
  if (!candidates || candidates.length === 0) {
    return { ok: true, claim: null, message: "no eligible run" };
  }
  const target = candidates[0];

  const { data: claimed, error: claimErr } = await client.from("runs")
    .update({
      status: "active",
      claim_token: claimToken,
      worker_id: workerId,
      lease_expires_at: leaseExpiresAt,
      heartbeat_at: nowIso,
      started_at: nowIso,
    })
    .eq("id", target.id)
    .eq("status", "queued")
    .or("lease_expires_at.is.null,lease_expires_at.lt." + nowIso)
    .lte("available_at", nowIso)
    .select()
    .single();
  if (claimErr || !claimed) {
    return { ok: true, claim: null, message: "claim race lost" };
  }
  const correlationId = newCorrelationId();
  await appendRunEvent(client, claimed.id, "run.claimed",
    "Run " + claimed.id + " claimed by " + workerId,
    { workspaceId: claimed.workspace_id, taskId: claimed.task_id, workerId, leaseExpiresAt, claimToken: "[redacted]", correlationId },
    "system");
  await repo.createAuditEvent(client, {
    workspaceId: claimed.workspace_id,
    actorId: null,
    actorType: "system",
    action: "queue.claimed",
    objectType: "run",
    objectId: claimed.id,
    metadata: { workerId, correlationId, leaseExpiresAt },
    correlationId,
  });
  return {
    ok: true,
    claim: { claimToken, workerId, leaseExpiresAt, heartbeatAt: nowIso },
    run: repo.mapRun(claimed),
    correlationId,
  };
}

async function heartbeatLease(service, runId, claimToken) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId || !claimToken) return { ok: false, message: "runId and claimToken are required" };
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + LEASE_DEFAULTS.leaseMs).toISOString();
  const { data: runRow, error: rErr } = await client.from("runs")
    .select("id, status, claim_token")
    .eq("id", runId)
    .maybeSingle();
  if (rErr) return { ok: false, message: rErr.message };
  if (!runRow) return { ok: false, message: "run not found" };
  if (runRow.status === "cancelled") {
    return { ok: false, message: "run was cancelled", failureClassification: "cancelled" };
  }
  const { data: updated, error } = await client.from("runs")
    .update({ heartbeat_at: nowIso, lease_expires_at: leaseExpiresAt })
    .eq("id", runId)
    .eq("claim_token", claimToken)
    .eq("status", "active")
    .select("id, heartbeat_at, lease_expires_at, status, claim_token")
    .single();
  if (error || !updated) {
    return { ok: false, message: "claim lost; another worker owns the run or lease expired" };
  }
  return {
    ok: true,
    heartbeat: {
      heartbeatAt: updated.heartbeat_at,
      leaseExpiresAt: updated.lease_expires_at,
    },
  };
}

async function releaseExpiredLeases(service, opts) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  opts = opts || {};
  const nowIso = new Date().toISOString();
  const { data: candidates, error: candErr } = await client.from("runs")
    .select("id, workspace_id, attempt_count, max_attempts, retry_classification, task_id")
    .eq("status", "active")
    .lt("lease_expires_at", nowIso)
    .limit(50);
  if (candErr) return { ok: false, message: candErr.message };
  const released = [];
  for (const row of candidates || []) {
    const attemptCount = Number(row.attempt_count || 1);
    const maxAttempts = Number(row.max_attempts || 1);
    const classification = row.retry_classification || "lease_expired";
    const retryDecision = classifyRunFailureForRetry(classification);
    const willRetry = retryDecision.retryable && attemptCount < maxAttempts;
    let updateFields = {};
    if (willRetry) {
      const nextAttempt = attemptCount + 1;
      const backoffMs = computeBackoffMs(nextAttempt);
      updateFields = {
        status: "queued",
        available_at: new Date(Date.now() + backoffMs).toISOString(),
        attempt_count: nextAttempt,
        retry_classification: classification,
        claim_token: null,
        worker_id: null,
        heartbeat_at: null,
        lease_expires_at: null,
      };
    } else {
      updateFields = {
        status: "failed",
        failure_classification: "lease_expired",
        ended_at: nowIso,
        claim_token: null,
        worker_id: null,
        heartbeat_at: null,
        lease_expires_at: null,
      };
    }
    const { data: updated, error: uErr } = await client.from("runs")
      .update(updateFields)
      .eq("id", row.id)
      .eq("status", "active")
      .lt("lease_expires_at", nowIso)
      .select()
      .single();
    if (uErr || !updated) continue;
    const correlationId = newCorrelationId();
    await appendRunEvent(client, row.id, willRetry ? "queue.lease_retry_scheduled" : "queue.lease_lost",
      willRetry
        ? "Lease expired; attempt " + attemptCount + " -> " + (attemptCount + 1) + " scheduled"
        : "Lease expired and retries exhausted; run failed (reviewable)",
      { workspaceId: row.workspace_id, taskId: row.task_id, correlationId, attemptCount, maxAttempts, classification, retryDecision },
      "system");
    await repo.createAuditEvent(client, {
      workspaceId: row.workspace_id,
      actorId: null,
      actorType: "system",
      action: willRetry ? "queue.lease_retry_scheduled" : "queue.lease_lost",
      objectType: "run",
      objectId: row.id,
      metadata: { correlationId, attemptCount, maxAttempts, classification, willRetry },
      correlationId,
    });
    released.push({ runId: row.id, willRetry, attemptCount, classification });
  }
  return { ok: true, released, count: released.length };
}

async function requestCancellation(service, args) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!args || !args.runId) return { ok: false, message: "runId is required" };
  const nowIso = new Date().toISOString();
  const { data: row, error: rErr } = await client.from("runs")
    .select("id, status, workspace_id, task_id")
    .eq("id", args.runId)
    .maybeSingle();
  if (rErr) return { ok: false, message: rErr.message };
  if (!row) return { ok: false, message: "run not found" };
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(row.status)) {
    return { ok: false, message: "run is in terminal state " + row.status + "; cannot cancel", failureClassification: "invalid_state" };
  }
  const { data: updated, error } = await client.from("runs")
    .update({
      status: "cancelled",
      ended_at: nowIso,
      failure_classification: "cancelled",
      claim_token: null,
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
    })
    .eq("id", args.runId)
    .in("status", ["queued", "active"])
    .select()
    .single();
  if (error || !updated) {
    return { ok: false, message: "could not transition run to cancelled", failureClassification: "invalid_state" };
  }
  const correlationId = newCorrelationId();
  await appendRunEvent(client, args.runId, "run.cancelled",
    "Run cancelled by " + (args.actorId || "user"),
    { workspaceId: updated.workspace_id, taskId: updated.task_id, actorId: args.actorId || null, correlationId, reason: String(args.reason || "").slice(0, 200) },
    "user");
  await repo.createAuditEvent(client, {
    workspaceId: updated.workspace_id,
    actorId: args.actorId || null,
    actorType: "user",
    action: "queue.cancelled",
    objectType: "run",
    objectId: args.runId,
    metadata: { correlationId, reason: String(args.reason || "").slice(0, 200) },
    correlationId,
  });
  return { ok: true, run: repo.mapRun(updated), correlationId };
}

async function markRunStarted(service, runId, claimToken) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId || !claimToken) return { ok: false, message: "runId and claimToken are required" };
  const nowIso = new Date().toISOString();
  const { data, error } = await client.from("runs")
    .update({ started_at: nowIso, heartbeat_at: nowIso })
    .eq("id", runId)
    .eq("claim_token", claimToken)
    .eq("status", "active")
    .select()
    .single();
  if (error || !data) return { ok: false, message: "claim lost; cannot mark started" };
  return { ok: true, run: repo.mapRun(data) };
}

async function markRunSucceeded(service, runId, claimToken, opts) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId || !claimToken) return { ok: false, message: "runId and claimToken are required" };
  opts = opts || {};
  const nowIso = new Date().toISOString();
  const updates = {
    status: "succeeded",
    ended_at: nowIso,
    time_used_ms: opts.timeUsedMs != null ? Math.max(0, Math.floor(Number(opts.timeUsedMs))) : 0,
    budget_used: opts.budgetUsed != null ? Math.max(0, Number(opts.budgetUsed)) : 0,
    claim_token: null,
    worker_id: null,
    heartbeat_at: null,
    lease_expires_at: null,
  };
  const { data, error } = await client.from("runs")
    .update(updates)
    .eq("id", runId)
    .eq("claim_token", claimToken)
    .eq("status", "active")
    .select()
    .single();
  if (error || !data) return { ok: false, message: "claim lost; cannot mark succeeded" };
  return { ok: true, run: repo.mapRun(data) };
}

async function markRunFailed(service, runId, claimToken, opts) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId || !claimToken) return { ok: false, message: "runId and claimToken are required" };
  opts = opts || {};
  const nowIso = new Date().toISOString();
  const updates = {
    status: "failed",
    ended_at: nowIso,
    failure_classification: String(opts.failureClassification || "internal_error").slice(0, 100),
    retry_classification: String(opts.failureClassification || "internal_error").slice(0, 100),
    time_used_ms: opts.timeUsedMs != null ? Math.max(0, Math.floor(Number(opts.timeUsedMs))) : 0,
    budget_used: opts.budgetUsed != null ? Math.max(0, Number(opts.budgetUsed)) : 0,
    claim_token: null,
    worker_id: null,
    heartbeat_at: null,
    lease_expires_at: null,
  };
  const { data, error } = await client.from("runs")
    .update(updates)
    .eq("id", runId)
    .eq("claim_token", claimToken)
    .eq("status", "active")
    .select()
    .single();
  if (error || !data) return { ok: false, message: "claim lost; cannot mark failed" };
  return { ok: true, run: repo.mapRun(data) };
}

async function markRunTimedOut(service, runId, claimToken, opts) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId || !claimToken) return { ok: false, message: "runId and claimToken are required" };
  opts = opts || {};
  const nowIso = new Date().toISOString();
  const updates = {
    status: "timed_out",
    ended_at: nowIso,
    failure_classification: "timeout",
    retry_classification: "timeout",
    time_used_ms: opts.timeUsedMs != null ? Math.max(0, Math.floor(Number(opts.timeUsedMs))) : 0,
    budget_used: opts.budgetUsed != null ? Math.max(0, Number(opts.budgetUsed)) : 0,
    claim_token: null,
    worker_id: null,
    heartbeat_at: null,
    lease_expires_at: null,
  };
  const { data, error } = await client.from("runs")
    .update(updates)
    .eq("id", runId)
    .eq("claim_token", claimToken)
    .eq("status", "active")
    .select()
    .single();
  if (error || !data) return { ok: false, message: "claim lost; cannot mark timed out" };
  return { ok: true, run: repo.mapRun(data) };
}

async function scheduleRetry(service, runId, opts) {
  if (!service) return NOT_CONFIGURED;
  const client = getClient(service);
  if (!client) return NOT_CONFIGURED;
  if (!runId) return { ok: false, message: "runId is required" };
  opts = opts || {};
  const { data: row, error: rErr } = await client.from("runs")
    .select("id, workspace_id, task_id, plan_id, attempt_count, max_attempts, failure_classification, status, tool_name, tool_version, parent_run_id, provider")
    .eq("id", runId)
    .maybeSingle();
  if (rErr) return { ok: false, message: rErr.message };
  if (!row) return { ok: false, message: "run not found" };
  if (!["failed", "timed_out", "cancelled"].includes(row.status)) {
    return { ok: false, message: "run is in status " + row.status + "; only failed/timed_out/cancelled are retryable" };
  }
  const classification = opts.classification || row.failure_classification || "internal_error";
  const retryDecision = classifyRunFailureForRetry(classification);
  if (!retryDecision.retryable) {
    return { ok: false, message: "classification " + classification + " is not retryable: " + retryDecision.reason };
  }
  const attemptCount = Number(row.attempt_count || 1);
  const maxAttempts = Number(row.max_attempts || 1);
  if (attemptCount >= maxAttempts) {
    return { ok: false, message: "max attempts reached; refusing to enqueue duplicate retry" };
  }
  const nextAttempt = attemptCount + 1;
  const backoffMs = computeBackoffMs(nextAttempt);
  const newRun = await client.from("runs").insert({
    workspace_id: row.workspace_id,
    task_id: row.task_id,
    plan_id: row.plan_id,
    status: "queued",
    attempt_count: nextAttempt,
    parent_run_id: row.id,
    provider: row.provider || "deterministic-local-planner",
    tool_summary: row.tool_name || "safe-internal",
    tool_name: row.tool_name || "safe-internal",
    tool_version: row.tool_version || "1.0.0",
    available_at: new Date(Date.now() + backoffMs).toISOString(),
    idempotency_key: null,
    max_attempts: maxAttempts,
  }).select().single();
  if (newRun.error || !newRun.data) return { ok: false, message: newRun.error ? newRun.error.message : "retry insert failed" };
  const correlationId = newCorrelationId();
  await appendRunEvent(client, newRun.data.id, "run.queued",
    "Retry attempt " + nextAttempt + " of " + maxAttempts + " (parent " + row.id + ")",
    { workspaceId: row.workspace_id, taskId: row.task_id, correlationId, parentRunId: row.id, classification, retryDecision, backoffMs },
    "system");
  await repo.createAuditEvent(client, {
    workspaceId: row.workspace_id,
    actorId: null,
    actorType: "system",
    action: "queue.retry_scheduled",
    objectType: "run",
    objectId: newRun.data.id,
    metadata: { parentRunId: row.id, attempt: nextAttempt, maxAttempts, correlationId, classification },
    correlationId,
  });
  return { ok: true, run: repo.mapRun(newRun.data), parentRunId: row.id, correlationId };
}

function getRetryClassifications() {
  return Array.from(RETRY_CLASSIFICATIONS);
}

module.exports = {
  LEASE_DEFAULTS,
  RETRY_CLASSIFICATIONS,
  newCorrelationId,
  newClaimToken,
  classifyRunFailureForRetry,
  computeBackoffMs,
  enqueueRun,
  claimNextEligibleRun,
  heartbeatLease,
  releaseExpiredLeases,
  requestCancellation,
  markRunStarted,
  markRunSucceeded,
  markRunFailed,
  markRunTimedOut,
  scheduleRetry,
  getRetryClassifications,
};
   