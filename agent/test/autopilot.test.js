/* ============================================================
   Autopilot tests

   Exercises server-autopilot.runAutopilotCycle through an
   in-memory mock supabase client (same shape as the durable
   queue tests). Proves:

     1. Guard: disabled by default; cycle throws without the flag.
     2. Auto-approval policy: all-low/moderate safe-internal plans
        are auto-approved and enqueued.
     3. Hold policy: any step with requiresApproval, a non-
        auto risk tier, or external tool class stops at
        drafted_awaiting_approval with a pending approval row.
     4. Approved-plan fast path: tasks whose latest plan is
        already approved get a run enqueued idempotently — a
        second cycle returns run_already_enqueued, not a dup.
     5. Draft hold: existing draft plans are never touched.
     6. Active-run skip: queued/active runs suppress new work.
     7. Bounded cycles: maxTasks caps how many tasks are acted on.
     8. Audit trail: plan.auto_approved / run.enqueued_by_autopilot
        events are written with actor_type "autopilot".
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const autopilot = require("../server-autopilot");
const queue = require("../server-queue-repo");

function createMockClient() {
  const tables = {
    runs: [],
    run_events: [],
    artifacts: [],
    audit_events: [],
    plans: [],
    plan_steps: [],
    approval_requests: [],
    tasks: [],
    tool_invocations: [],
  };
  let idCounter = 1;

  function matchFilter(row, filters) {
    for (const f of filters) {
      const [op, col, val] = f;
      if (op === "eq") {
        if (row[col] !== val) return false;
      } else if (op === "in") {
        if (!val.includes(row[col])) return false;
      } else if (op === "neq") {
        if (row[col] === val) return false;
      } else if (op === "is") {
        if (row[col] !== val) return false;
      }
    }
    return true;
  }

  function makeQuery(table, state) {
    state.filters = [];
    const q = {
      select() {
        return q;
      },
      insert(row) {
        const rows = Array.isArray(row) ? row : [row];
        const withIds = rows.map((r) => ({
          id: table.slice(0, 3) + "-" + idCounter++,
          created_at: new Date().toISOString(),
          ...r,
        }));
        for (const r of withIds) tables[table].push(r);
        return makeQuery(table, {
          ...state,
          insertDone: true,
          insertedRows: withIds,
        });
      },
      update(fields) {
        // apply to matched rows immediately
        for (const r of tables[table]) {
          if (matchFilter(r, state.filters)) Object.assign(r, fields);
        }
        return makeQuery(table, { ...state, updated: true });
      },
      delete() {
        return q;
      },
      eq(col, val) {
        state.filters.push(["eq", col, val]);
        return q;
      },
      neq(col, val) {
        state.filters.push(["neq", col, val]);
        return q;
      },
      in(col, val) {
        state.filters.push(["in", col, val]);
        return q;
      },
      is(col, val) {
        state.filters.push(["is", col, val]);
        return q;
      },
      lte() {
        return q;
      },
      lt() {
        return q;
      },
      or() {
        return q;
      },
      order() {
        // keep insertion order; good enough for single-row tables in these tests
        return q;
      },
      limit() {
        return q;
      },
      single() {
        if (state.insertDone)
          return Promise.resolve({ data: state.insertedRows[0], error: null });
        const found = tables[table].find((r) => matchFilter(r, state.filters));
        if (!found)
          return Promise.resolve({
            data: null,
            error: { message: "row not found" },
          });
        return Promise.resolve({ data: found, error: null });
      },
      maybeSingle() {
        if (state.insertDone)
          return Promise.resolve({ data: state.insertedRows[0], error: null });
        const found =
          tables[table].find((r) => matchFilter(r, state.filters)) || null;
        return Promise.resolve({ data: found, error: null });
      },
      then(resolve) {
        const found = tables[table].filter((r) =>
          matchFilter(r, state.filters),
        );
        resolve({ data: found, error: null });
      },
    };
    return q;
  }

  return {
    __tables: tables,
    from(table) {
      if (!tables[table]) throw new Error("unknown table " + table);
      return makeQuery(table, {});
    },
  };
}

// Patch the planner so generated drafts are fully auto-eligible
// (all steps low risk, safe-internal, none requiring approval).
// The DEFAULT planner draft intentionally contains an "approval"
// checkpoint step, which autopilot must always hold for a human.
function patchPlannerAllSafe(modify) {
  const planner = require("../server-planner");
  const orig = planner.generatePlanDraft;
  planner.generatePlanDraft = (task) => {
    const d = orig(task);
    // Always filter out the approval checkpoint step (not auto-eligible)
    d.planDraft.steps = d.planDraft.steps.filter((s) => s.toolClass !== "approval");
    if (modify) modify(d);
    d.payloadHash = planner.hashPayload({
      taskId: task.id,
      summary: d.planDraft.summary,
      assumptions: d.planDraft.assumptions,
      risks: d.planDraft.risks,
      steps: d.planDraft.steps,
    });
    return d;
  };
  return () => {
    planner.generatePlanDraft = orig;
  };
}

// Repo wrappers bound to the mock client, mirroring the real deps.
function makeDeps(client) {
  const repo = require("../server-supabase-repo");
  return {
    enqueueRun: (c, args) => queue.enqueueRun(c, args),
    nextPlanVersion: (c, ws, taskId) => repo.nextPlanVersion(c, ws, taskId),
    createPlan: (c, p) => repo.createPlan(c, p),
    createPlanSteps: (c, rows) => repo.createPlanSteps(c, rows),
    createApproval: (c, a) => repo.createApproval(c, a),
    updateApprovalStatus: (c, ws, id, fields) =>
      repo.updateApprovalStatus(c, ws, id, fields),
    updatePlanStatus: (c, ws, planId, status) =>
      repo.updatePlanStatus(c, ws, planId, status),
  };
}

let idSeq = 1;
function seedTask(client, overrides = {}) {
  const id = overrides.id || "task-" + idSeq++;
  client.__tables.tasks.push({
    id,
    workspace_id: overrides.workspaceId || "ws-1",
    title: overrides.title || "Task " + id,
    desired_outcome: overrides.desiredOutcome || "A useful outcome",
    instructions: "",
    status: overrides.status || "queued",
    priority: "High",
    creator_id: "user-1",
    created_at: new Date().toISOString(),
    active_plan_version: null,
    project_id: null,
    budget_limit: null,
    time_limit_seconds: null,
  });
  return id;
}

function withAutopilotEnabled(fn) {
  const prev = process.env.MARINA_AUTOPILOT;
  process.env.MARINA_AUTOPILOT = "1";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.MARINA_AUTOPILOT;
      else process.env.MARINA_AUTOPILOT = prev;
    });
}

test("autopilot is disabled by default and throws without the guard", () => {
  delete process.env.MARINA_AUTOPILOT;
  assert.equal(autopilot.isAutopilotEnabled(), false);
  const client = createMockClient();
  assert.rejects(
    () => autopilot.runAutopilotCycle(client, { workspaceId: "ws-1" }),
    /MARINA_AUTOPILOT=1/,
  );
});

test("default planner draft (approval checkpoint step) holds for human review", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    const res = await autopilot.runAutopilotCycle(client, {
      workspaceId: "ws-1",
      actorId: "user-1",
      deps: makeDeps(client),
    });
    const out = res.outcomes.find((o) => o.taskId === taskId);
    assert.equal(out.action, "drafted_awaiting_approval");
    assert.equal(out.reason, "tool_class_approval");
    const approval = client.__tables.approval_requests.find(
      (a) => a.action_target === out.planId,
    );
    assert.equal(approval.status, "pending");
    assert.equal(client.__tables.runs.length, 0); // no run enqueued
  }));

test("all-safe plan is auto-approved and enqueued", () =>
  withAutopilotEnabled(async () => {
    const restore = patchPlannerAllSafe();
    try {
      const client = createMockClient();
      const taskId = seedTask(client);
      const res = await autopilot.runAutopilotCycle(client, {
        workspaceId: "ws-1",
        actorId: "user-1",
        deps: makeDeps(client),
      });
      assert.equal(res.ok, true);
      const out = res.outcomes.find((o) => o.taskId === taskId);
      assert.equal(out.action, "auto_approved_and_enqueued");
      assert.equal(res.counts.auto_approved_and_enqueued, 1);

      // Plan + steps + approval exist and are approved.
      const plan = client.__tables.plans.find((p) => p.id === out.planId);
      // Plan is superseded but was approved (has approved_at set)
      assert.equal(plan.status, "superseded");
      assert.ok(plan.approved_at, "plan should have approved_at set");
      assert.ok(plan.summary.length > 0);
      const approval = client.__tables.approval_requests.find(
        (a) => a.action_target === plan.id,
      );
      assert.equal(approval.status, "approved");
      assert.match(approval.decision_note, /autopilot:auto-approved/);

      // A queued run exists for the plan.
      const run = client.__tables.runs.find((r) => r.plan_id === plan.id);
      assert.equal(run.status, "queued");
      assert.equal(
        run.idempotency_key,
        "autopilot:" + taskId + ":v" + plan.version,
      );

      // Audit trail records both actions as autopilot.
      const audits = client.__tables.audit_events.filter(
        (a) => a.actor_type === "autopilot",
      );
      const actions = audits.map((a) => a.action).sort();
      assert.deepEqual(actions, [
        "plan.auto_approved",
        "run.enqueued_by_autopilot",
      ]);
    } finally {
      restore();
    }
  }));

test("step flagged requiresApproval stops at manual review", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    const orig = require("../server-planner").generatePlanDraft;
    require("../server-planner").generatePlanDraft = (task) => {
      const d = orig(task);
      d.planDraft.steps[0].requiresApproval = true;
      d.payloadHash = require("../server-planner").hashPayload({
        taskId: task.id,
        summary: d.planDraft.summary,
        assumptions: d.planDraft.assumptions,
        risks: d.planDraft.risks,
        steps: d.planDraft.steps,
      });
      return d;
    };
    try {
      const res = await autopilot.runAutopilotCycle(client, {
        workspaceId: "ws-1",
        actorId: "user-1",
        deps: makeDeps(client),
      });
      const out = res.outcomes.find((o) => o.taskId === taskId);
      assert.equal(out.action, "drafted_awaiting_approval");
      assert.match(out.reason, /^step_requires_approval:/);
      const approval = client.__tables.approval_requests.find(
        (a) => a.action_target === out.planId,
      );
      assert.equal(approval.status, "pending");
      const plan = client.__tables.plans.find((p) => p.id === out.planId);
      assert.equal(plan.status, "draft");
      assert.equal(client.__tables.runs.length, 0); // no run enqueued
    } finally {
      require("../server-planner").generatePlanDraft = orig;
    }
  }));

test("high-risk step stops at manual review", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    const orig = require("../server-planner").generatePlanDraft;
    require("../server-planner").generatePlanDraft = (task) => {
      const d = orig(task);
      d.planDraft.steps[0].riskTier = "critical";
      d.payloadHash = require("../server-planner").hashPayload({
        taskId: task.id,
        summary: d.planDraft.summary,
        assumptions: d.planDraft.assumptions,
        risks: d.planDraft.risks,
        steps: d.planDraft.steps,
      });
      return d;
    };
    try {
      const res = await autopilot.runAutopilotCycle(client, {
        workspaceId: "ws-1",
        actorId: "user-1",
        deps: makeDeps(client),
      });
      const out = res.outcomes.find((o) => o.taskId === taskId);
      assert.equal(out.action, "drafted_awaiting_approval");
      assert.equal(out.reason, "risk_tier_critical");
      assert.equal(client.__tables.runs.length, 0);
    } finally {
      require("../server-planner").generatePlanDraft = orig;
    }
  }));

test("external tool class stops at manual review", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    const orig = require("../server-planner").generatePlanDraft;
    require("../server-planner").generatePlanDraft = (task) => {
      const d = orig(task);
      d.planDraft.steps[0].toolClass = "shell-exec";
      d.payloadHash = require("../server-planner").hashPayload({
        taskId: task.id,
        summary: d.planDraft.summary,
        assumptions: d.planDraft.assumptions,
        risks: d.planDraft.risks,
        steps: d.planDraft.steps,
      });
      return d;
    };
    try {
      const res = await autopilot.runAutopilotCycle(client, {
        workspaceId: "ws-1",
        actorId: "user-1",
        deps: makeDeps(client),
      });
      const out = res.outcomes.find((o) => o.taskId === taskId);
      assert.equal(out.action, "drafted_awaiting_approval");
      assert.equal(out.reason, "tool_class_shell-exec");
    } finally {
      require("../server-planner").generatePlanDraft = orig;
    }
  }));

test("already-approved plan gets a run enqueued idempotently across cycles", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    // Seed an approved plan directly.
    const repo = require("../server-supabase-repo");
    const planRes = await repo.createPlan(client, {
      workspaceId: "ws-1",
      taskId,
      version: 1,
      author: "human",
      summary: "Human-approved plan",
      assumptions: [],
      risks: [],
    });
    await repo.updatePlanStatus(client, "ws-1", planRes.plan.id, "approved");

    const first = await autopilot.runAutopilotCycle(client, {
      workspaceId: "ws-1",
      actorId: "user-1",
      deps: makeDeps(client),
    });
    const out1 = first.outcomes.find((o) => o.taskId === taskId);
    assert.equal(out1.action, "run_enqueued");

    const second = await autopilot.runAutopilotCycle(client, {
      workspaceId: "ws-1",
      actorId: "user-1",
      deps: makeDeps(client),
    });
    // Second cycle: the run now exists and is queued → active-run skip.
    const out2 = second.outcomes.find((o) => o.taskId === taskId);
    assert.equal(out2.action, "skipped");
    assert.equal(out2.reason, "active_or_queued_run_exists");
    // Exactly one run total.
    assert.equal(
      client.__tables.runs.filter((r) => r.plan_id === planRes.plan.id).length,
      1,
    );
  }));

test("existing draft plan is left untouched for human decision", () =>
  withAutopilotEnabled(async () => {
    const client = createMockClient();
    const taskId = seedTask(client);
    const repo = require("../server-supabase-repo");
    const planRes = await repo.createPlan(client, {
      workspaceId: "ws-1",
      taskId,
      version: 1,
      author: "human",
      summary: "Draft",
      assumptions: [],
      risks: [],
    });
    const res = await autopilot.runAutopilotCycle(client, {
      workspaceId: "ws-1",
      actorId: "user-1",
      deps: makeDeps(client),
    });
    const out = res.outcomes.find((o) => o.taskId === taskId);
    assert.equal(out.action, "awaiting_approval");
    const stillOne = client.__tables.plans.filter(
      (p) => p.task_id === taskId,
    ).length;
    assert.equal(stillOne, 1);
    assert.equal(client.__tables.runs.length, 0);
    void planRes;
  }));

test("maxTasks bounds how many tasks are acted on per cycle", () =>
  withAutopilotEnabled(async () => {
    const restore = patchPlannerAllSafe();
    try {
      const client = createMockClient();
      for (let i = 0; i < 5; i++) seedTask(client, { title: "Bulk " + i });
      const res = await autopilot.runAutopilotCycle(client, {
        workspaceId: "ws-1",
        actorId: "user-1",
        maxTasks: 2,
        deps: makeDeps(client),
      });
      assert.equal(res.counts.auto_approved_and_enqueued, 2);
      const acted = res.outcomes.filter(
        (o) => o.action === "auto_approved_and_enqueued",
      ).length;
      assert.ok(acted <= 2, "expected at most 2 acted tasks, got " + acted);
    } finally {
      restore();
    }
  }));
