/* ============================================================
   MarinaAI — Autopilot (bounded autonomous planning + dispatch)

   A deliberate, policy-gated autonomy layer over the durable
   workflow. One "cycle" walks a bounded number of tasks in a
   workspace and, for each, does the smallest useful next thing:

     1. Skip if a run is already queued/active for the task.
     2. If the latest plan is already approved → enqueue a run
        through the durable queue (idempotent per plan version).
     3. If the latest plan is a draft awaiting approval → leave
        it untouched (a human decides).
     4. Otherwise generate a fresh plan draft. If every step is
        low/moderate risk, safe-internal only, and none requires
        approval → auto-approve the plan and enqueue the run.
        Anything else stops at a pending approval for a human.

   Hard rails:
     - Disabled unless MARINA_AUTOPILOT=1 is explicitly set.
     - Bounded tasks per cycle (default 3, hard cap 10).
     - Never auto-approves high/critical risk, external tool
       classes, or steps flagged requiresApproval.
     - Every action writes an audit event with actorType
       "autopilot".
   ============================================================ */

const planner = require("./server-planner");
const sm = require("./server-state-machine");

const GUARD_ENV = "MARINA_AUTOPILOT";
const AUTO_APPROVABLE_RISK = new Set(["low", "moderate"]);
const AUTO_TOOL_CLASSES = new Set(["safe-internal"]);
const MAX_TASKS_HARD_CAP = 10;

function isAutopilotEnabled() {
  return process.env[GUARD_ENV] === "1";
}

function requireAutopilotEnabled() {
  if (!isAutopilotEnabled()) {
    const err = new Error(
      "Autopilot is not enabled. Set MARINA_AUTOPILOT=1 to use it. Autopilot runs bounded cycles on demand; it never starts itself.",
    );
    err.code = "autopilot_disabled";
    throw err;
  }
}

/** Decide whether a generated plan draft qualifies for auto-approval. */
function assessPlanAutoApproval(planDraft) {
  const steps = (planDraft && planDraft.steps) || [];
  if (!steps.length) return { auto: false, reason: "no_steps", maxRisk: null };
  let maxRisk = "low";
  for (const s of steps) {
    if (s.requiresApproval) {
      return {
        auto: false,
        reason: "step_requires_approval:" + s.position,
        maxRisk,
      };
    }
    if (!AUTO_APPROVABLE_RISK.has(s.riskTier)) {
      return { auto: false, reason: "risk_tier_" + s.riskTier, maxRisk };
    }
    if (s.riskTier === "moderate") maxRisk = "moderate";
    const toolClass = s.toolClass || "safe-internal";
    if (!AUTO_TOOL_CLASSES.has(toolClass)) {
      return { auto: false, reason: "tool_class_" + toolClass, maxRisk };
    }
  }
  return { auto: true, reason: "all_steps_auto_eligible", maxRisk };
}

async function latestPlanForTask(client, workspaceId, taskId) {
  const { data, error } = await client
    .from("plans")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) return { ok: false, message: error.message };
  const row = data && data[0];
  return { ok: true, plan: row || null };
}

async function hasActiveOrQueuedRun(client, workspaceId, taskId) {
  const { data, error } = await client
    .from("runs")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .in("status", ["queued", "active"])
    .limit(1);
  if (error) return { ok: false, message: error.message };
  return { ok: true, active: Boolean(data && data.length) };
}

async function writeAudit(client, entry) {
  try {
    await client.from("audit_events").insert({
      workspace_id: entry.workspaceId,
      actor_id: entry.actorId,
      actor_type: "autopilot",
      action: entry.action,
      object_type: entry.objectType,
      object_id: entry.objectId,
      metadata: entry.metadata || {},
    });
  } catch (_) {
    /* audit is best-effort; never block the cycle on audit failure */
  }
}

/**
 * Process one task. Returns a structured outcome describing what
 * the autopilot did (or why it skipped).
 */
async function processTask(service, deps, task, actorId) {
  const workspaceId = task.workspaceId;
  const taskId = task.id;

  // 1. Skip if work is already queued or running.
  const active = await hasActiveOrQueuedRun(service, workspaceId, taskId);
  if (!active.ok)
    return {
      taskId,
      action: "skipped",
      reason: "run_lookup_failed:" + active.message,
    };
  if (active.active)
    return { taskId, action: "skipped", reason: "active_or_queued_run_exists" };

  // 2. Latest plan routing.
  const latest = await latestPlanForTask(service, workspaceId, taskId);
  if (!latest.ok)
    return {
      taskId,
      action: "skipped",
      reason: "plan_lookup_failed:" + latest.message,
    };

  // A plan is effectively approved if its status is "approved" or if it was
  // previously approved and later superseded (has approved_at set).
  function isEffectivelyApproved(plan) {
    return (
      plan &&
      (plan.status === "approved" ||
        (plan.approved_at && plan.status === "superseded"))
    );
  }

  if (isEffectivelyApproved(latest.plan)) {
    // Enqueue a run for this approved plan version (idempotent).
    const enq = await deps.enqueueRun(service, {
      workspaceId,
      taskId,
      planId: latest.plan.id,
      idempotencyKey: "autopilot:" + taskId + ":v" + latest.plan.version,
      provider: "autopilot",
    });
    if (!enq.ok)
      return {
        taskId,
        action: "skipped",
        reason: "enqueue_failed:" + enq.message,
      };
    await writeAudit(service, {
      workspaceId,
      actorId,
      action: enq.isExisting
        ? "run.enqueue_idempotent"
        : "run.enqueued_by_autopilot",
      objectType: "run",
      objectId: enq.run ? enq.run.id : null,
      metadata: {
        taskId,
        planId: latest.plan.id,
        planVersion: latest.plan.version,
      },
    });
    return {
      taskId,
      action: enq.isExisting ? "run_already_enqueued" : "run_enqueued",
      planId: latest.plan.id,
      planVersion: latest.plan.version,
      runId: enq.run ? enq.run.id : null,
    };
  }

  if (latest.plan && latest.plan.status === "draft") {
    // Human decision pending; autopilot must not touch it.
    return {
      taskId,
      action: "awaiting_approval",
      planId: latest.plan.id,
      planVersion: latest.plan.version,
    };
  }

  // 3. Generate a fresh draft (latest missing, rejected, or superseded).
  const draft = planner.generatePlanDraft(task);
  if (!draft.ok)
    return {
      taskId,
      action: "skipped",
      reason: "plan_draft_failed:" + draft.message,
    };

  const versionRes = await deps.nextPlanVersion(service, workspaceId, taskId);
  if (!versionRes.ok)
    return {
      taskId,
      action: "skipped",
      reason: "version_lookup_failed:" + versionRes.message,
    };

  const planRes = await deps.createPlan(service, {
    workspaceId,
    taskId,
    version: versionRes.version,
    author: "autopilot",
    summary: draft.planDraft.summary,
    assumptions: draft.planDraft.assumptions,
    risks: draft.planDraft.risks,
  });
  if (!planRes.ok)
    return {
      taskId,
      action: "skipped",
      reason: "plan_create_failed:" + planRes.message,
    };
  const plan = planRes.plan;

  const stepRows = draft.planDraft.steps.map((s) => ({
    ...s,
    workspaceId,
    planId: plan.id,
    taskId,
  }));
  const stepsRes = await deps.createPlanSteps(service, stepRows);
  if (!stepsRes.ok)
    return {
      taskId,
      action: "skipped",
      reason: "steps_create_failed:" + stepsRes.message,
    };

  const assessment = assessPlanAutoApproval(draft.planDraft);
  if (!assessment.auto) {
    // Create the bound approval request so the human inbox shows it.
    const approval = await deps.createApproval(service, {
      workspaceId,
      taskId,
      actionType: "plan.approve",
      actionTarget: plan.id,
      payloadHash: draft.payloadHash,
      payloadPreview: {
        planId: plan.id,
        planVersion: plan.version,
        summary: draft.planDraft.summary,
        generatedBy: "autopilot",
      },
      riskTier: "low",
      reason:
        "Autopilot drafted this plan; manual review required (" +
        assessment.reason +
        ").",
      requestedBy: actorId,
    });
    if (!approval.ok)
      return {
        taskId,
        action: "skipped",
        reason: "approval_create_failed:" + approval.message,
      };
    await writeAudit(service, {
      workspaceId,
      actorId,
      action: "plan.drafted_by_autopilot",
      objectType: "plan",
      objectId: plan.id,
      metadata: {
        taskId,
        version: plan.version,
        holdReason: assessment.reason,
      },
    });
    return {
      taskId,
      action: "drafted_awaiting_approval",
      planId: plan.id,
      planVersion: plan.version,
      reason: assessment.reason,
    };
  }

  // Auto-approve path: bind approval to the exact payload hash,
  // mark it approved immediately, flip the plan status, enqueue.
  const approval = await deps.createApproval(service, {
    workspaceId,
    taskId,
    actionType: "plan.approve",
    actionTarget: plan.id,
    payloadHash: draft.payloadHash,
    payloadPreview: {
      planId: plan.id,
      planVersion: plan.version,
      summary: draft.planDraft.summary,
      autoApproved: true,
    },
    riskTier: assessment.maxRisk,
    reason:
      "Autopilot auto-approved: all steps low/moderate risk, safe-internal, no step requires approval.",
    requestedBy: actorId,
  });
  if (!approval.ok)
    return {
      taskId,
      action: "skipped",
      reason: "approval_create_failed:" + approval.message,
    };

  const approveRes = await deps.updateApprovalStatus(
    service,
    workspaceId,
    approval.approval.id,
    {
      status: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy: actorId,
      decisionNote:
        "autopilot:auto-approved (max risk " + assessment.maxRisk + ")",
    },
  );
  if (!approveRes.ok)
    return {
      taskId,
      action: "skipped",
      reason: "approval_update_failed:" + approveRes.message,
    };

  const statusRes = await deps.updatePlanStatus(
    service,
    workspaceId,
    plan.id,
    "approved",
  );
  if (!statusRes.ok)
    return {
      taskId,
      action: "skipped",
      reason: "plan_status_failed:" + statusRes.message,
    };

  await writeAudit(service, {
    workspaceId,
    actorId,
    action: "plan.auto_approved",
    objectType: "plan",
    objectId: plan.id,
    metadata: {
      taskId,
      version: plan.version,
      maxRisk: assessment.maxRisk,
      approvalId: approval.approval.id,
    },
  });

  const enq = await deps.enqueueRun(service, {
    workspaceId,
    taskId,
    planId: plan.id,
    idempotencyKey: "autopilot:" + taskId + ":v" + plan.version,
    provider: "autopilot",
  });
  if (!enq.ok)
    return {
      taskId,
      action: "plan_approved_enqueue_failed",
      planId: plan.id,
      reason: enq.message,
    };

  await writeAudit(service, {
    workspaceId,
    actorId,
    action: "run.enqueued_by_autopilot",
    objectType: "run",
    objectId: enq.run ? enq.run.id : null,
    metadata: { taskId, planId: plan.id, planVersion: plan.version },
  });

  return {
    taskId,
    action: "auto_approved_and_enqueued",
    planId: plan.id,
    planVersion: plan.version,
    runId: enq.run ? enq.run.id : null,
  };
}

/**
 * Run one bounded autopilot cycle across a workspace's candidate
 * tasks (status queued or in-progress). Never throws for task
 * level failures; per-task outcomes carry the reason.
 */
async function runAutopilotCycle(service, opts) {
  requireAutopilotEnabled();
  opts = opts || {};
  const deps = opts.deps || {
    enqueueRun: (c, args) => require("./server-queue-repo").enqueueRun(c, args),
    nextPlanVersion: (c, ws, taskId) =>
      require("./server-supabase-repo").nextPlanVersion(c, ws, taskId),
    createPlan: (c, p) => require("./server-supabase-repo").createPlan(c, p),
    createPlanSteps: (c, rows) =>
      require("./server-supabase-repo").createPlanSteps(c, rows),
    createApproval: (c, a) =>
      require("./server-supabase-repo").createApproval(c, a),
    updateApprovalStatus: (c, ws, id, fields) =>
      require("./server-supabase-repo").updateApprovalStatus(c, ws, id, fields),
    updatePlanStatus: (c, ws, planId, status) =>
      require("./server-supabase-repo").updatePlanStatus(c, ws, planId, status),
  };
  const workspaceId = opts.workspaceId;
  if (!workspaceId) return { ok: false, message: "workspaceId is required" };
  const actorId = String(opts.actorId || "autopilot").slice(0, 200);
  const maxTasks = Math.max(
    1,
    Math.min(Number(opts.maxTasks) || 3, MAX_TASKS_HARD_CAP),
  );

  const { data: tasks, error } = await service
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["queued", "in-progress"])
    .order("created_at", { ascending: true })
    .limit(maxTasks * 3); // over-fetch so skips don't starve the cycle
  if (error) return { ok: false, message: error.message };

  const outcomes = [];
  for (const row of tasks || []) {
    if (outcomes.filter((o) => o.action !== "skipped").length >= maxTasks)
      break;
    const mapped = {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      desiredOutcome: row.desired_outcome,
      instructions: row.instructions,
      status: row.status,
      priority: row.priority,
    };
    outcomes.push(await processTask(service, deps, mapped, actorId));
  }

  const counts = {};
  for (const o of outcomes) counts[o.action] = (counts[o.action] || 0) + 1;

  return {
    ok: true,
    workspaceId,
    actorId,
    examined: (tasks || []).length,
    outcomes,
    counts,
  };
}

module.exports = {
  GUARD_ENV,
  MAX_TASKS_HARD_CAP,
  isAutopilotEnabled,
  requireAutopilotEnabled,
  assessPlanAutoApproval,
  runAutopilotCycle,
  processTask,
};
