/* State machine transition tests — node:test, zero dependencies. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  canTransition,
  assertTransition,
  TransitionError,
  statesFor,
} = require("../server-state-machine");

test("task follows the full happy path", () => {
  const path = ["draft", "planning", "awaiting_plan_review", "queued", "running", "completed"];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(
      canTransition("task", path[i], path[i + 1]),
      `${path[i]} → ${path[i + 1]} should be allowed`,
    );
    const event = assertTransition("task", path[i], path[i + 1], "user");
    assert.equal(event.entity, "task");
    assert.equal(event.from, path[i]);
    assert.equal(event.to, path[i + 1]);
    assert.ok(event.at);
  }
});

test("task cancellation is allowed from every active state", () => {
  for (const state of [
    "draft",
    "planning",
    "awaiting_plan_review",
    "queued",
    "running",
    "awaiting_approval",
    "paused",
  ]) {
    assert.ok(canTransition("task", state, "cancelled"), `${state} → cancelled`);
  }
});

test("terminal task states reject further transitions", () => {
  for (const state of ["completed", "cancelled"]) {
    for (const to of statesFor("task")) {
      if (to === state) continue;
      assert.ok(!canTransition("task", state, to), `${state} → ${to} must be rejected`);
      assert.throws(() => assertTransition("task", state, to), TransitionError);
    }
  }
});

test("retry paths exist only for failed/timed_out tasks", () => {
  assert.ok(canTransition("task", "failed", "queued"));
  assert.ok(canTransition("task", "timed_out", "queued"));
  assert.ok(!canTransition("task", "completed", "queued"));
  assert.ok(!canTransition("task", "cancelled", "queued"));
});

test("approval wait round-trips through running", () => {
  assert.ok(canTransition("task", "running", "awaiting_approval"));
  assert.ok(canTransition("task", "awaiting_approval", "running"));
  // A denied approval can also cancel the task.
  assert.ok(canTransition("task", "awaiting_approval", "cancelled"));
});

test("plan versioning transitions enforce review flow", () => {
  assert.ok(canTransition("plan", "draft", "approved"));
  assert.ok(canTransition("plan", "draft", "rejected"));
  assert.ok(canTransition("plan", "draft", "superseded"));
  assert.ok(canTransition("plan", "approved", "superseded"));
  assert.ok(canTransition("plan", "rejected", "draft")); // revision → new draft
  assert.ok(!canTransition("plan", "superseded", "draft"));
  assert.ok(!canTransition("plan", "rejected", "approved")); // must re-draft first
});

test("run lifecycle supports cancel, timeout, and retry", () => {
  assert.ok(canTransition("run", "queued", "active"));
  assert.ok(canTransition("run", "active", "succeeded"));
  assert.ok(canTransition("run", "active", "failed"));
  assert.ok(canTransition("run", "active", "cancelled"));
  assert.ok(canTransition("run", "active", "timed_out"));
  assert.ok(canTransition("run", "failed", "queued"));
  assert.ok(canTransition("run", "timed_out", "queued"));
  assert.ok(!canTransition("run", "succeeded", "queued"));
});

test("unknown entities and no-op transitions are rejected", () => {
  assert.throws(() => assertTransition("bogus", "a", "b"), TransitionError);
  assert.throws(() => assertTransition("task", "running", "running"), TransitionError);
});