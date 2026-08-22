/* ============================================================
   Deterministic Local Planner tests

   The planner is the source of structured plan drafts. It must
   always be deterministic, never claim to be a live model, and
   produce a strictly-validated structured plan.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const planner = require("../server-planner");

test("planner exports truthful identity constants", () => {
  assert.equal(planner.PLANNER_ID, "deterministic-local-planner");
  assert.equal(planner.PLANNER_LABEL, "Deterministic local planner");
  assert.equal(planner.PLANNER_AVAILABILITY, "available_local_only");
});

test("generatePlanDraft produces a structured plan for a valid task", () => {
  const result = planner.generatePlanDraft({
    id: "task-1",
    title: "Draft launch plan",
    desiredOutcome: "Identify launch steps and risks",
    instructions: "Use the existing workspace context.",
    priority: "Medium",
  });
  assert.equal(result.ok, true);
  assert.ok(result.planDraft);
  assert.ok(typeof result.payloadHash === "string" && result.payloadHash.length === 32);
  // Required fields
  assert.ok(typeof result.planDraft.summary === "string");
  assert.ok(Array.isArray(result.planDraft.assumptions));
  assert.ok(Array.isArray(result.planDraft.risks));
  assert.ok(Array.isArray(result.planDraft.steps));
  // At most 5 steps
  assert.ok(result.planDraft.steps.length <= 5);
  // Provider identity is truthful
  assert.equal(result.planDraft.provider, "deterministic-local-planner");
  assert.equal(result.planDraft.providerLabel, "Deterministic local planner");
});

test("generatePlanDraft is deterministic: same input → same hash", () => {
  const a = planner.generatePlanDraft({
    id: "task-2",
    title: "Repeatable plan",
    desiredOutcome: "Repeatable outcome",
    instructions: "Same input",
    priority: "Low",
  });
  const b = planner.generatePlanDraft({
    id: "task-2",
    title: "Repeatable plan",
    desiredOutcome: "Repeatable outcome",
    instructions: "Same input",
    priority: "Low",
  });
  assert.equal(a.payloadHash, b.payloadHash);
  assert.equal(a.planDraft.steps.length, b.planDraft.steps.length);
  // Steps must be deterministic
  for (let i = 0; i < a.planDraft.steps.length; i++) {
    assert.equal(a.planDraft.steps[i].title, b.planDraft.steps[i].title);
  }
});

test("generatePlanDraft fails closed on missing task id", () => {
  const result = planner.generatePlanDraft({});
  assert.equal(result.ok, false);
  assert.match(result.message, /Task ID is required/);
});

test("all auto-generated steps are low-risk and require no approval", () => {
  const result = planner.generatePlanDraft({
    id: "task-3",
    title: "Safe plan",
    desiredOutcome: "Safe outcome",
    instructions: "None",
    priority: "Low",
  });
  for (const s of result.planDraft.steps) {
    assert.equal(s.riskTier, "low", `step ${s.title} should be low-risk`);
    assert.equal(s.requiresApproval, false);
  }
});
