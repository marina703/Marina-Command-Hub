/* ============================================================
   MarinaAI — Durable Authenticated API Routes

   Server-authorized HTTP routes for the authenticated core
   workflow. All routes:
     1. Validate the bearer token server-side
     2. Verify workspace membership on the server
     3. Scope every query to the verified workspace
     4. Return sanitized errors

   This module exports a single async handler dispatcher that
   dashboard-server.js mounts as /api/durable/*.

   It does NOT touch the legacy JSON state for any authenticated
   workflow read or write. If Supabase is not configured, the
   routes return a truthful "not_configured" unavailable state
   so the UI can show the configuration-required screen.
   ============================================================ */

const supabaseRepo = require("./server-supabase");
const planner = require("./server-planner");
const workflow = require("./server-workflow-dispatch");
const sm = require("./server-state-machine");
const autopilot = require("./server-autopilot");
const { getServiceClient } = require("./server-supabase");

function json(res, code, body) {
  if (res.headersSent) return;
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const a = req.headers["authorization"] || "";
  if (!a.startsWith("Bearer ")) return null;
  return a.slice(7).trim() || null;
}

async function requireAuth(req) {
  const token = bearer(req);
  if (!token)
    return { ok: false, status: 401, error: "Authorization header required" };
  const result = await supabaseRepo.verifySession(token);
  if (!result.ok) return { ok: false, status: 401, error: result.error };
  return { ok: true, user: result.user };
}

async function requireWorkspace(req, workspaceId) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  if (!workspaceId)
    return { ok: false, status: 400, error: "Workspace ID required" };
  const m = await supabaseRepo.verifyWorkspaceMembership(
    auth.user.id,
    workspaceId,
  );
  if (!m.ok)
    return { ok: false, status: 403, error: "Not a member of this workspace" };
  return { ok: true, user: auth.user, role: m.role };
}

function configGuard(res) {
  if (!supabaseRepo.isConfigured) {
    json(res, 503, {
      ok: false,
      message:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      code: "not_configured",
    });
    return true;
  }
  return false;
}

// ── Tasks ──

async function listTasks(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const result = await supabaseRepo.listTasksInDb(workspaceId, {
    status: url.searchParams.get("status") || undefined,
    projectId: url.searchParams.get("projectId") || undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, tasks: result.tasks });
}

async function createTask(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const title = String(body.title || "").trim();
  if (!title)
    return json(res, 400, { ok: false, message: "title is required" });
  if (title.length > 200)
    return json(res, 400, { ok: false, message: "title exceeds 200 chars" });

  const priority = ["Low", "Medium", "High", "Critical"].includes(body.priority)
    ? body.priority
    : "Medium";
  const budgetLimit =
    body.budgetLimit != null ? Number(body.budgetLimit) : null;
  const timeLimitSeconds =
    body.timeLimitSeconds != null ? Number(body.timeLimitSeconds) : null;

  const result = await supabaseRepo.createTaskInDb({
    workspaceId: body.workspaceId,
    projectId: body.projectId || null,
    creatorId: auth.user.id,
    title,
    desiredOutcome: String(body.desiredOutcome || "").slice(0, 2000),
    instructions: String(body.instructions || "").slice(0, 20000),
    priority,
    budgetLimit,
    timeLimitSeconds,
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, task: result.task });
}

async function getTask(req, res, url, taskId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getTaskInDb(workspaceId, taskId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  return json(res, 200, { ok: true, task: result.task });
}

async function updateTask(req, res, taskId) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  // Transition enforcement
  if (body.status) {
    const cur = await supabaseRepo.getTaskInDb(body.workspaceId, taskId);
    if (!cur.ok) return json(res, 404, { ok: false, message: cur.message });
    try {
      sm.assertTransition("task", cur.task.status, body.status, auth.user.id);
    } catch (err) {
      return json(res, 409, {
        ok: false,
        message: err.message,
        code: "invalid_transition",
      });
    }
  }
  const result = await supabaseRepo.updateTaskInDb(
    body.workspaceId,
    taskId,
    body,
  );
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, task: result.task });
}

async function cancelTask(req, res, taskId) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const cur = await supabaseRepo.getTaskInDb(body.workspaceId, taskId);
  if (!cur.ok) return json(res, 404, { ok: false, message: cur.message });
  try {
    sm.assertTransition("task", cur.task.status, "cancelled", auth.user.id);
  } catch (err) {
    return json(res, 409, {
      ok: false,
      message: err.message,
      code: "invalid_transition",
    });
  }
  const result = await supabaseRepo.updateTaskInDb(body.workspaceId, taskId, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancellationReason: String(body.reason || "Cancelled by user").slice(
      0,
      500,
    ),
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, task: result.task });
}

// ── Plans ──

async function generatePlan(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const taskResult = await supabaseRepo.getTaskInDb(
    body.workspaceId,
    body.taskId,
  );
  if (!taskResult.ok)
    return json(res, 404, { ok: false, message: taskResult.message });
  const task = taskResult.task;

  const draft = planner.generatePlanDraft(task);
  if (!draft.ok) return json(res, 400, { ok: false, message: draft.message });

  const nextVer = await supabaseRepo.nextPlanVersion(
    body.workspaceId,
    body.taskId,
  );
  if (!nextVer.ok)
    return json(res, 500, { ok: false, message: nextVer.message });
  const version = nextVer.version;

  // Transition task -> planning if currently draft
  if (task.status === "draft") {
    try {
      sm.assertTransition("task", task.status, "planning", auth.user.id);
      await supabaseRepo.updateTaskInDb(body.workspaceId, task.id, {
        status: "planning",
      });
    } catch {
      /* ignore state errors here */
    }
  }

  const planResult = await supabaseRepo.createPlanInDb({
    workspaceId: body.workspaceId,
    taskId: body.taskId,
    version,
    author: planner.PLANNER_ID,
    summary: draft.planDraft.summary,
    assumptions: draft.planDraft.assumptions,
    risks: draft.planDraft.risks,
  });
  if (!planResult.ok)
    return json(res, 500, { ok: false, message: planResult.message });

  const plan = planResult.plan;
  // Persist plan steps
  const steps = draft.planDraft.steps.map((s) => ({
    workspaceId: body.workspaceId,
    planId: plan.id,
    taskId: body.taskId,
    ...s,
  }));
  const stepsResult = await supabaseRepo.createPlanStepsInDb(steps);
  if (!stepsResult.ok)
    return json(res, 500, { ok: false, message: stepsResult.message });

  // After draft creation, transition task to awaiting_plan_review
  try {
    sm.assertTransition(
      "task",
      "planning",
      "awaiting_plan_review",
      auth.user.id,
    );
    await supabaseRepo.updateTaskInDb(body.workspaceId, task.id, {
      status: "awaiting_plan_review",
    });
  } catch {
    /* tolerate */
  }

  // Persist an immutable approval record (pending) bound to this plan version
  const approvalResult = await supabaseRepo.createApprovalInDb({
    workspaceId: body.workspaceId,
    taskId: body.taskId,
    actionType: "plan.approve",
    actionTarget: plan.id,
    payloadHash: draft.payloadHash,
    payloadPreview: {
      planId: plan.id,
      planVersion: plan.version,
      summary: plan.summary,
    },
    riskTier: "moderate",
    reason: `Plan v${plan.version} awaiting review.`,
    requestedBy: auth.user.id,
  });
  if (!approvalResult.ok) {
    return json(res, 500, { ok: false, message: approvalResult.message });
  }

  await supabaseRepo.createAuditEventInDb({
    workspaceId: body.workspaceId,
    actorId: auth.user.id,
    actorType: "user",
    action: "plan.generated",
    objectType: "plan",
    objectId: plan.id,
    metadata: {
      taskId: task.id,
      version: plan.version,
      provider: planner.PLANNER_ID,
      providerLabel: planner.PLANNER_LABEL,
      payloadHash: draft.payloadHash,
    },
  });

  return json(res, 200, {
    ok: true,
    plan: { ...plan, steps: stepsResult.steps },
    planApproval: approvalResult.approval,
    payloadHash: draft.payloadHash,
    planner: {
      id: planner.PLANNER_ID,
      label: planner.PLANNER_LABEL,
      availability: planner.PLANNER_AVAILABILITY,
    },
  });
}

async function listPlans(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const taskId = url.searchParams.get("taskId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  if (!taskId)
    return json(res, 400, { ok: false, message: "taskId is required" });
  const result = await supabaseRepo.listPlansForTaskInDb(workspaceId, taskId);
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, plans: result.plans });
}

async function getPlan(req, res, url, planId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getPlanInDb(workspaceId, planId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  return json(res, 200, { ok: true, plan: result.plan });
}

async function revisePlan(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const planResult = await supabaseRepo.getPlanInDb(
    body.workspaceId,
    body.planId,
  );
  if (!planResult.ok)
    return json(res, 404, { ok: false, message: planResult.message });
  const prev = planResult.plan;
  if (prev.status !== "draft" && prev.status !== "rejected") {
    return json(res, 409, {
      ok: false,
      message: `Cannot revise plan in status ${prev.status}. Revisions are only allowed for draft or rejected plans.`,
    });
  }

  // Build a new draft version from provided overrides; if not provided, regenerate.
  const task = (await supabaseRepo.getTaskInDb(body.workspaceId, prev.taskId))
    .task;
  let base = planner.generatePlanDraft(task);
  if (!base.ok) return json(res, 400, { ok: false, message: base.message });

  const overrides = body.overrides || {};
  const summary = String(overrides.summary || base.planDraft.summary).slice(
    0,
    2000,
  );
  const assumptions = Array.isArray(overrides.assumptions)
    ? overrides.assumptions
    : base.planDraft.assumptions;
  const risks = Array.isArray(overrides.risks)
    ? overrides.risks
    : base.planDraft.risks;
  const steps =
    Array.isArray(overrides.steps) && overrides.steps.length > 0
      ? overrides.steps.map((s, i) => ({
          position: i,
          title: String(s.title || `Step ${i + 1}`).slice(0, 200),
          purpose: String(s.purpose || "").slice(0, 500),
          dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
          toolClass: String(s.toolClass || "safe-internal").slice(0, 100),
          inputSummary: String(s.inputSummary || "").slice(0, 500),
          expectedOutput: String(s.expectedOutput || "").slice(0, 500),
          riskTier: ["low", "moderate", "high", "critical"].includes(s.riskTier)
            ? s.riskTier
            : "low",
          requiresApproval: Boolean(s.requiresApproval),
          estimatedDuration:
            s.estimatedDuration != null ? Number(s.estimatedDuration) : null,
          estimatedCost:
            s.estimatedCost != null ? Number(s.estimatedCost) : null,
          retryPolicy: s.retryPolicy || { maxRetries: 0 },
        }))
      : base.planDraft.steps;

  const payloadHash = planner.hashPayload({
    planId: prev.id, // include the previous plan in the binding to invalidate prior approvals
    summary,
    assumptions,
    risks,
    steps,
  });

  const nextVer = await supabaseRepo.nextPlanVersion(
    body.workspaceId,
    prev.taskId,
  );
  if (!nextVer.ok)
    return json(res, 500, { ok: false, message: nextVer.message });
  const newPlan = await supabaseRepo.createPlanInDb({
    workspaceId: body.workspaceId,
    taskId: prev.taskId,
    version: nextVer.version,
    author: planner.PLANNER_ID,
    summary,
    assumptions,
    risks,
  });
  if (!newPlan.ok)
    return json(res, 500, { ok: false, message: newPlan.message });
  const stepRows = steps.map((s) => ({
    ...s,
    workspaceId: body.workspaceId,
    planId: newPlan.plan.id,
    taskId: prev.taskId,
  }));
  const stepInsert = await supabaseRepo.createPlanStepsInDb(stepRows);
  if (!stepInsert.ok)
    return json(res, 500, { ok: false, message: stepInsert.message });

  const approval = await supabaseRepo.createApprovalInDb({
    workspaceId: body.workspaceId,
    taskId: prev.taskId,
    actionType: "plan.approve",
    actionTarget: newPlan.plan.id,
    payloadHash,
    payloadPreview: {
      planId: newPlan.plan.id,
      planVersion: newPlan.plan.version,
      summary,
      feedback: String(body.feedback || "").slice(0, 1000),
    },
    riskTier: "moderate",
    reason: `Plan v${newPlan.plan.version} awaiting review.`,
    requestedBy: auth.user.id,
  });
  if (!approval.ok)
    return json(res, 500, { ok: false, message: approval.message });

  await supabaseRepo.createAuditEventInDb({
    workspaceId: body.workspaceId,
    actorId: auth.user.id,
    actorType: "user",
    action: "plan.revised",
    objectType: "plan",
    objectId: newPlan.plan.id,
    metadata: {
      previousPlanId: prev.id,
      previousVersion: prev.version,
      version: newPlan.plan.version,
      payloadHash,
      feedback: String(body.feedback || "").slice(0, 500),
    },
  });

  return json(res, 200, {
    ok: true,
    plan: { ...newPlan.plan, steps: stepInsert.steps },
    planApproval: approval.approval,
    payloadHash,
    supersededPlanId: prev.id,
  });
}

async function decidePlan(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const decision = String(body.decision || "").toLowerCase();
  if (!["approve", "reject"].includes(decision)) {
    return json(res, 400, {
      ok: false,
      message: "decision must be 'approve' or 'reject'",
    });
  }

  const planResult = await supabaseRepo.getPlanInDb(
    body.workspaceId,
    body.planId,
  );
  if (!planResult.ok)
    return json(res, 404, { ok: false, message: planResult.message });
  const plan = planResult.plan;

  try {
    sm.assertTransition(
      "plan",
      plan.status,
      decision === "approve" ? "approved" : "rejected",
      auth.user.id,
    );
  } catch (err) {
    return json(res, 409, {
      ok: false,
      message: err.message,
      code: "invalid_transition",
    });
  }

  const approvals = await supabaseRepo.listApprovalsInDb(
    body.workspaceId,
    "pending",
  );
  const planApprovals = (approvals.approvals || []).filter(
    (a) => a.actionTarget === plan.id,
  );
  const latestApproval = planApprovals.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )[0];
  if (
    latestApproval &&
    body.payloadHash &&
    latestApproval.payloadHash !== body.payloadHash
  ) {
    return json(res, 409, {
      ok: false,
      message:
        "Plan approval payload hash mismatch. Reload the latest plan version.",
      code: "stale_approval",
    });
  }

  const update = await supabaseRepo.updatePlanStatusInDb(
    body.workspaceId,
    plan.id,
    decision === "approve" ? "approved" : "rejected",
  );
  if (!update.ok) return json(res, 500, { ok: false, message: update.message });

  if (latestApproval) {
    await supabaseRepo.updateApprovalStatusInDb(
      body.workspaceId,
      latestApproval.id,
      {
        status: decision === "approve" ? "approved" : "rejected",
        decidedAt: new Date().toISOString(),
        decidedBy: auth.user.id,
        decisionNote: String(body.note || "").slice(0, 500),
      },
    );
  }

  if (decision === "approved") {
    try {
      sm.assertTransition(
        "task",
        "awaiting_plan_review",
        "queued",
        auth.user.id,
      );
      await supabaseRepo.updateTaskInDb(body.workspaceId, plan.taskId, {
        status: "queued",
        activePlanVersion: plan.version,
      });
    } catch {
      /* tolerate */
    }
  } else if (decision === "rejected") {
    try {
      sm.assertTransition(
        "task",
        "awaiting_plan_review",
        "planning",
        auth.user.id,
      );
      await supabaseRepo.updateTaskInDb(body.workspaceId, plan.taskId, {
        status: "planning",
      });
    } catch {
      /* tolerate */
    }
  }

  await supabaseRepo.createAuditEventInDb({
    workspaceId: body.workspaceId,
    actorId: auth.user.id,
    actorType: "user",
    action: `plan.${decision === "approve" ? "approved" : "rejected"}`,
    objectType: "plan",
    objectId: plan.id,
    metadata: {
      taskId: plan.taskId,
      version: plan.version,
      payloadHash: body.payloadHash || null,
      note: String(body.note || "").slice(0, 500),
    },
  });

  return json(res, 200, { ok: true, plan: update.plan });
}

async function listApprovals(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const status = url.searchParams.get("status") || null;
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.listApprovalsInDb(workspaceId, status);
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, approvals: result.approvals });
}

async function getApproval(req, res, url, approvalId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getApprovalInDb(workspaceId, approvalId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  return json(res, 200, { ok: true, approval: result.approval });
}

async function startRun(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const taskResult = await supabaseRepo.getTaskInDb(
    body.workspaceId,
    body.taskId,
  );
  if (!taskResult.ok)
    return json(res, 404, { ok: false, message: taskResult.message });
  const task = taskResult.task;

  const planResult = await supabaseRepo.getPlanInDb(
    body.workspaceId,
    body.planId,
  );
  if (!planResult.ok)
    return json(res, 404, { ok: false, message: planResult.message });
  const plan = planResult.plan;

  const approvals = await supabaseRepo.listApprovalsInDb(
    body.workspaceId,
    "approved",
  );
  const planApproval = (approvals.approvals || []).find(
    (a) => a.actionTarget === plan.id && a.actionType === "plan.approve",
  );

  const result = await workflow.dispatch("safe-internal", {
    supabase: supabaseRepo,
    task,
    plan,
    planApproval,
    actor: auth.user.id,
  });
  if (!result.ok) {
    return json(
      res,
      result.failureClassification === "policy_blocked" ? 403 : 409,
      {
        ok: false,
        message: result.message,
        failureClassification: result.failureClassification,
        correlationId: result.correlationId,
      },
    );
  }
  return json(res, 200, {
    ok: true,
    run: result.run,
    artifact: result.artifact,
    message: result.message,
    correlationId: result.correlationId,
  });
}

// Autopilot: one bounded autonomous planning + dispatch cycle.
// Guarded server-side by MARINA_AUTOPILOT=1; auth + workspace
// membership still required from the caller.
async function runAutopilotCycleRoute(req, res) {
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  if (!autopilot.isAutopilotEnabled()) {
    return json(res, 409, {
      ok: false,
      code: "autopilot_disabled",
      message:
        "Autopilot is disabled. Set MARINA_AUTOPILOT=1 to enable bounded on-demand cycles.",
    });
  }
  const service = getServiceClient();
  if (!service)
    return json(res, 503, {
      ok: false,
      code: "not_configured",
      message: "Supabase is not configured",
    });
  const result = await autopilot.runAutopilotCycle(service, {
    workspaceId: body.workspaceId,
    actorId: auth.user.id,
    maxTasks: body.maxTasks,
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, ...result });
}

async function listRuns(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const taskId = url.searchParams.get("taskId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  if (!taskId)
    return json(res, 400, { ok: false, message: "taskId is required" });
  const result = await supabaseRepo.listRunsForTaskInDb(workspaceId, taskId);
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, runs: result.runs });
}

async function getRun(req, res, url, runId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getRunInDb(runId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  if (result.run.workspaceId !== workspaceId) {
    return json(res, 403, {
      ok: false,
      message: "Cross-workspace access denied",
    });
  }
  return json(res, 200, { ok: true, run: result.run });
}

async function listRunEvents(req, res, url, runId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.listRunEventsInDb(runId);
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, events: result.events });
}

async function cancelRun(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const result = await supabaseRepo.getRunInDb(body.runId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  const run = result.run;
  if (run.workspaceId !== body.workspaceId) {
    return json(res, 403, {
      ok: false,
      message: "Cross-workspace access denied",
    });
  }
  try {
    sm.assertTransition("run", run.status, "cancelled", auth.user.id);
  } catch (err) {
    return json(res, 409, {
      ok: false,
      message: err.message,
      code: "invalid_transition",
    });
  }
  const update = await supabaseRepo.updateRunStatusInDb(run.id, "cancelled", {
    failureClassification: "cancelled",
  });
  if (!update.ok) return json(res, 500, { ok: false, message: update.message });
  const seqRes = await supabaseRepo.nextRunEventSequence(run.id);
  await supabaseRepo.createRunEventInDb({
    workspaceId: body.workspaceId,
    runId: run.id,
    taskId: run.taskId,
    sequence: seqRes.ok ? seqRes.sequence : 0,
    event: "run.cancelled",
    summary: "Run cancelled by user",
    metadata: { actor: auth.user.id },
    actor: "user",
  });
  return json(res, 200, { ok: true, run: update.run });
}

async function retryRun(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });

  const orig = await supabaseRepo.getRunInDb(body.runId);
  if (!orig.ok) return json(res, 404, { ok: false, message: orig.message });
  if (orig.run.workspaceId !== body.workspaceId) {
    return json(res, 403, {
      ok: false,
      message: "Cross-workspace access denied",
    });
  }
  if (!["failed", "timed_out", "cancelled"].includes(orig.run.status)) {
    return json(res, 409, {
      ok: false,
      message: `Run is ${orig.run.status}; only failed, timed_out, or cancelled runs can be retried.`,
    });
  }
  const taskResult = await supabaseRepo.getTaskInDb(
    body.workspaceId,
    orig.run.taskId,
  );
  if (!taskResult.ok)
    return json(res, 404, { ok: false, message: taskResult.message });
  const task = taskResult.task;
  if (orig.run.planId) {
    const planResult = await supabaseRepo.getPlanInDb(
      body.workspaceId,
      orig.run.planId,
    );
    if (planResult.ok) {
      const approvals = await supabaseRepo.listApprovalsInDb(
        body.workspaceId,
        "approved",
      );
      const planApproval = (approvals.approvals || []).find(
        (a) =>
          a.actionTarget === planResult.plan.id &&
          a.actionType === "plan.approve",
      );
      const result = await workflow.dispatch("safe-internal", {
        supabase: supabaseRepo,
        task,
        plan: planResult.plan,
        planApproval,
        actor: auth.user.id,
      });
      if (!result.ok) {
        return json(res, 409, {
          ok: false,
          message: result.message,
          failureClassification: result.failureClassification,
          correlationId: result.correlationId,
        });
      }
      return json(res, 200, {
        ok: true,
        run: result.run,
        artifact: result.artifact,
        parentRunId: orig.run.id,
        message: result.message,
        correlationId: result.correlationId,
      });
    }
  }
  return json(res, 400, {
    ok: false,
    message: "Retry requires the original plan to still exist.",
  });
}

async function listArtifacts(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.listArtifactsInDb(workspaceId, {
    taskId: url.searchParams.get("taskId") || undefined,
    runId: url.searchParams.get("runId") || undefined,
    type: url.searchParams.get("type") || undefined,
    state: url.searchParams.get("state") || undefined,
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, artifacts: result.artifacts });
}

async function getArtifact(req, res, url, artifactId) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getArtifactInDb(workspaceId, artifactId);
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  return json(res, 200, { ok: true, artifact: result.artifact });
}

async function artifactDownloadUrl(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const result = await supabaseRepo.getArtifactInDb(
    body.workspaceId,
    body.artifactId,
  );
  if (!result.ok) return json(res, 404, { ok: false, message: result.message });
  const filename =
    (body.filename && String(body.filename).replace(/[^a-zA-Z0-9._-]/g, "_")) ||
    "artifact.md";
  const urlResult = await supabaseRepo.getArtifactSignedUrl(
    body.workspaceId,
    body.artifactId,
    filename,
    body.expiresIn || 3600,
  );
  if (!urlResult.ok)
    return json(res, 500, { ok: false, message: urlResult.message });
  return json(res, 200, {
    ok: true,
    url: urlResult.url,
    expiresIn: body.expiresIn || 3600,
  });
}

async function listAuditEvents(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    200,
  );
  const result = await supabaseRepo.listAuditEventsInDb(workspaceId, limit);
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, events: result.events });
}

async function listWorkflows(_req, res) {
  return json(res, 200, { ok: true, workflows: workflow.listWorkflows() });
}

async function queueState(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok)
    return json(res, auth.status, { ok: false, message: auth.error });
  // Truthful state: count runs by status for the workspace.
  // We use the public run list and group by status in memory.
  // This endpoint is for the Operations Shelf; it never lies
  // about a worker it does not have.
  let counts = {
    queued: 0,
    active: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    timed_out: 0,
  };
  let totalRuns = 0;
  // We rely on the existing supabase repo. List up to 200 recent runs.
  const { data, error } = await supabaseRepo
    .getServiceClient()
    .from("runs")
    .select(
      "id, status, attempt_count, max_attempts, lease_expires_at, heartbeat_at, available_at, worker_id, tool_name, tool_version, failure_classification",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return json(res, 500, { ok: false, message: error.message });
  }
  totalRuns = (data || []).length;
  const now = Date.now();
  for (const r of data || []) {
    if (counts[r.status] != null) counts[r.status] += 1;
  }
  // Most-recent activity view (oldest first for stable display)
  const recent = (data || [])
    .slice(0, 10)
    .reverse()
    .map((r) => ({
      id: r.id,
      status: r.status,
      attempt: r.attempt_count,
      maxAttempts: r.max_attempts,
      tool: r.tool_name,
      toolVersion: r.tool_version,
      worker: r.worker_id,
      leaseExpired: r.lease_expires_at
        ? new Date(r.lease_expires_at).getTime() < now
        : false,
      failureClassification: r.failure_classification,
    }));
  return json(res, 200, {
    ok: true,
    workspaceId,
    totalRuns,
    counts,
    localWorkerEnabled: Boolean(process.env.MARINA_LOCAL_WORKER),
    persistentWorkerEnabled: false,
    recent,
    truthStatement:
      "This is the current durable queue state. The persistent worker runtime is not enabled in this milestone; use MARINA_LOCAL_WORKER=1 to opt in to the local/manual harness for development and tests.",
  });
}

async function handleDurable(req, res, url) {
  const method = req.method;
  const path = url.pathname;

  // Tasks
  if (path === "/api/durable/tasks" && method === "GET")
    return listTasks(req, res, url);
  if (path === "/api/durable/tasks" && method === "POST")
    return createTask(req, res);
  const taskMatch = path.match(/^\/api\/durable\/tasks\/([^\/]+)$/);
  if (taskMatch) {
    if (method === "GET") return getTask(req, res, url, taskMatch[1]);
    if (method === "PATCH" || method === "PUT")
      return updateTask(req, res, taskMatch[1]);
  }
  if (path === "/api/durable/tasks/cancel" && method === "POST") {
    const body = await readJson(req);
    return cancelTask(req, res, body.taskId);
  }

  // Plans
  if (path === "/api/durable/plans/generate" && method === "POST")
    return generatePlan(req, res);
  if (path === "/api/durable/plans/revise" && method === "POST")
    return revisePlan(req, res);
  if (path === "/api/durable/plans/decide" && method === "POST")
    return decidePlan(req, res);
  if (path === "/api/durable/plans" && method === "GET")
    return listPlans(req, res, url);
  const planMatch = path.match(/^\/api\/durable\/plans\/([^\/]+)$/);
  if (planMatch && method === "GET")
    return getPlan(req, res, url, planMatch[1]);

  // Approvals
  if (path === "/api/durable/approvals" && method === "GET")
    return listApprovals(req, res, url);
  const approvalMatch = path.match(/^\/api\/durable\/approvals\/([^\/]+)$/);
  if (approvalMatch && method === "GET")
    return getApproval(req, res, url, approvalMatch[1]);

  // Runs
  if (path === "/api/durable/autopilot/cycle" && method === "POST")
    return runAutopilotCycleRoute(req, res);
  if (path === "/api/durable/runs/start" && method === "POST")
    return startRun(req, res);
  if (path === "/api/durable/runs/cancel" && method === "POST")
    return cancelRun(req, res);
  if (path === "/api/durable/runs/retry" && method === "POST")
    return retryRun(req, res);
  if (path === "/api/durable/runs" && method === "GET")
    return listRuns(req, res, url);
  const runMatch = path.match(/^\/api\/durable\/runs\/([^\/]+)$/);
  if (runMatch && method === "GET") return getRun(req, res, url, runMatch[1]);
  const runEventsMatch = path.match(/^\/api\/durable\/runs\/([^\/]+)\/events$/);
  if (runEventsMatch && method === "GET")
    return listRunEvents(req, res, url, runEventsMatch[1]);

  // Artifacts
  if (path === "/api/durable/artifacts" && method === "GET")
    return listArtifacts(req, res, url);
  if (path === "/api/durable/artifacts/download-url" && method === "POST")
    return artifactDownloadUrl(req, res);
  const artifactMatch = path.match(/^\/api\/durable\/artifacts\/([^\/]+)$/);
  if (artifactMatch && method === "GET")
    return getArtifact(req, res, url, artifactMatch[1]);

  // Audit
  if (path === "/api/durable/audit" && method === "GET")
    return listAuditEvents(req, res, url);

  // Workflows
  if (path === "/api/durable/workflows" && method === "GET")
    return listWorkflows(req, res);

  // Queue (durable worker foundation)
  if (path === "/api/durable/queue/enqueue" && method === "POST") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.enqueue(req, res);
  }
  if (path === "/api/durable/queue/cancel" && method === "POST") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.cancelRun(req, res);
  }
  if (path === "/api/durable/queue/retry" && method === "POST") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.retryRun(req, res);
  }
  if (path === "/api/durable/queue/lease-recovery" && method === "GET") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.recoverExpired(req, res, url);
  }
  if (path === "/api/durable/queue/local-worker/once" && method === "POST") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.localWorkerOnce(req, res);
  }
  if (path === "/api/durable/queue/local-worker/run" && method === "POST") {
    const queueRoutes = require("./server-queue-routes");
    return queueRoutes.localWorkerRun(req, res);
  }
  if (path === "/api/durable/queue/state" && method === "GET") {
    return queueState(req, res, url);
  }

  return json(res, 404, {
    ok: false,
    message: "Durable route not found",
    path,
  });
}

module.exports = {
  handleDurable,
  listTasks,
  createTask,
  getTask,
  updateTask,
  cancelTask,
  generatePlan,
  revisePlan,
  decidePlan,
  listPlans,
  getPlan,
  listApprovals,
  getApproval,
  startRun,
  listRuns,
  getRun,
  listRunEvents,
  cancelRun,
  retryRun,
  listArtifacts,
  getArtifact,
  artifactDownloadUrl,
  listAuditEvents,
  listWorkflows,
  runAutopilotCycleRoute,
};
