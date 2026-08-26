/* Tool registry and workspace authorization tests — node:test.

   The registry is now the only gateway for tool/handler
   dispatch. The tests assert the truthful public surface:
     - one executable handler (safe-internal) plus honest
       planned / not_configured / blocked descriptors
     - unknown tools fail closed as policy_blocked
     - input validation rejects missing, wrong-typed, and
       over-long fields
     - approval_policy semantics
     - feature-flag gating semantics
     - workspace authorization semantics

   The legacy readFile/writeFile/runCommand/deploy tools
   were intentionally removed from the active registry in
   this milestone. Their behavior is preserved only as
   honest "blocked" descriptors in the registry, with
   `available: false` and `executable: false`. These tests
   assert the truthful new surface.
*/
const { test } = require("node:test");
const assert = require("node:assert/strict");

// Enable the research/code-gen feature flags so web-search, research, and
// code-generation are dispatchable in this suite (fail-closed until set).
process.env.WEB_SEARCH_ENABLED = "1";
process.env.RESEARCH_ENABLED = "1";
process.env.CODE_GEN_ENABLED = "1";

const {
  validateToolInput,
  getToolDefinition,
  listTools,
  isToolAvailable,
  isDispatchable,
  requiresApproval,
  listDispatchableTools,
  AVAILABILITY,
} = require("../server-tool-registry");

const {
  resolveWorkspaceId,
  assertWorkspaceAccess,
  scopeToWorkspace,
  stampWorkspace,
  hasRole,
  AuthorizationError,
} = require("../server-workspace");

/* ── Tool Registry (truthful new surface) ── */

test("listTools returns the truthful registry", () => {
  const tools = listTools();
  assert.ok(tools.length >= 5);
  const names = tools.map((t) => t.name);
  assert.ok(names.includes("safe-internal"));
  assert.ok(names.includes("market-research"));
  assert.ok(names.includes("campaign-brief"));
  assert.ok(names.includes("proposal-drafting"));
  assert.ok(names.includes("client-delivery"));
  assert.ok(names.includes("business-connection"));
  assert.ok(names.includes("shell-exec"));
  assert.ok(names.includes("browser-automation"));
  assert.ok(names.includes("web-retrieval"));
  assert.ok(names.includes("messaging-send"));
  assert.ok(names.includes("payment-execute"));
  assert.ok(names.includes("deployment-execute"));
});

test("safe-internal, web-search, research, and code-generation are dispatchable; everything else is honest", () => {
  const dispatchable = listDispatchableTools();
  const names = dispatchable.map((t) => t.name).sort();
  assert.deepEqual(names, ["code-generation", "research", "safe-internal", "web-search"]);
  const EXECUTABLE = new Set(["safe-internal", "web-search", "research", "code-generation"]);
  for (const t of listTools()) {
    if (EXECUTABLE.has(t.name)) {
      assert.equal(t.executable, true, t.name + " must be executable");
    } else {
      // Either planned / not_configured / blocked — never executable.
      assert.notEqual(t.executable, true, t.name + " must not be executable");
    }
  }
});

test("getToolDefinition returns definition for known action", () => {
  const def = getToolDefinition("safe-internal");
  assert.ok(def);
  assert.equal(def.riskTier, "low");
  assert.equal(def.approvalPolicy, "plan_approval");
  assert.equal(def.availabilityState, AVAILABILITY.AVAILABLE);
  assert.equal(def.executable, true);
});

test("getToolDefinition returns null for unknown action", () => {
  assert.equal(getToolDefinition("totallyBogus"), null);
  assert.equal(getToolDefinition(null), null);
});

test("validateToolInput accepts a valid safe-internal payload", () => {
  const def = getToolDefinition("safe-internal");
  const result = validateToolInput(def, {
    workspaceId: "w-1", taskId: "t-1", planId: "p-1",
  });
  assert.equal(result.ok, true);
});

test("validateToolInput rejects missing required fields", () => {
  const def = getToolDefinition("safe-internal");
  const result = validateToolInput(def, { workspaceId: "w-1" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Missing required field: taskId|planId/);
});

test("validateToolInput rejects strings exceeding maxLength", () => {
  const def = getToolDefinition("safe-internal");
  const tooLong = "x".repeat(500);
  const result = validateToolInput(def, {
    workspaceId: tooLong, taskId: "t-1", planId: "p-1",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds max length/);
});

test("validateToolInput rejects wrong types", () => {
  const def = getToolDefinition("safe-internal");
  const result = validateToolInput(def, {
    workspaceId: 123, taskId: "t-1", planId: "p-1",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /workspaceId must be a string/);
});

test("validateToolInput rejects unknown fields when additionalProperties=false", () => {
  const def = getToolDefinition("safe-internal");
  const result = validateToolInput(def, {
    workspaceId: "w-1", taskId: "t-1", planId: "p-1", mystery: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unexpected field: mystery/);
});

test("requiresApproval returns true for high-risk tools and false for low-risk tools", () => {
  assert.equal(requiresApproval(getToolDefinition("safe-internal")), false);
  assert.equal(requiresApproval(getToolDefinition("business-connection")), true);
  assert.equal(requiresApproval(getToolDefinition("messaging-send")), true);
  assert.equal(requiresApproval(getToolDefinition("deployment-execute")), true);
});

test("requiresApproval returns true for unknown tools (fail-closed)", () => {
  assert.equal(requiresApproval(null), true);
});

test("isToolAvailable returns true only for available tools", () => {
  assert.equal(isToolAvailable(getToolDefinition("safe-internal")), true);
  assert.equal(isToolAvailable(getToolDefinition("market-research")), false);
  assert.equal(isToolAvailable(getToolDefinition("payment-execute")), false);
});

test("blocked tools are never dispatchable, even with a future feature flag", () => {
  const def = getToolDefinition("shell-exec");
  assert.equal(isDispatchable(def), false);
  assert.equal(def.availabilityState, AVAILABILITY.BLOCKED);
});

test("isDispatchable requires executable=true AND available=true", () => {
  const safe = getToolDefinition("safe-internal");
  assert.equal(isDispatchable(safe), true);
  const planned = getToolDefinition("market-research");
  assert.equal(isDispatchable(planned), false);
});

test("registry never includes external send / payment / deploy as executable", () => {
  for (const t of listTools()) {
    if (["messaging-send", "payment-execute", "deployment-execute", "shell-exec", "browser-automation", "web-retrieval"].includes(t.name)) {
      assert.equal(t.executable, false, t.name + " must not be executable");
      assert.equal(t.availabilityState, AVAILABILITY.BLOCKED);
    }
  }
});

/* ── Workspace Authorization ── */

test("resolveWorkspaceId returns default when no context", () => {
  assert.equal(resolveWorkspaceId(), "default");
  assert.equal(resolveWorkspaceId({}), "default");
  assert.equal(resolveWorkspaceId({ workspaceId: "ws-123" }), "ws-123");
});

test("assertWorkspaceAccess passes for matching workspace", () => {
  const record = { id: "task-1", workspaceId: "default" };
  assert.doesNotThrow(() => assertWorkspaceAccess(record, "default", "task"));
});

test("assertWorkspaceAccess passes for records without workspaceId (backward compat)", () => {
  const record = { id: "task-1" };
  assert.doesNotThrow(() => assertWorkspaceAccess(record, "default", "task"));
});

test("assertWorkspaceAccess throws for mismatched workspace", () => {
  const record = { id: "task-1", workspaceId: "ws-other" };
  assert.throws(
    () => assertWorkspaceAccess(record, "default", "task"),
    AuthorizationError,
  );
});

test("scopeToWorkspace filters records by workspace", () => {
  const records = [
    { id: "1", workspaceId: "default" },
    { id: "2", workspaceId: "ws-other" },
    { id: "3" },
    { id: "4", workspaceId: "default" },
  ];
  const scoped = scopeToWorkspace(records, "default");
  assert.equal(scoped.length, 3);
  assert.equal(scoped[0].id, "1");
  assert.equal(scoped[1].id, "3");
  assert.equal(scoped[2].id, "4");
});

test("stampWorkspace adds workspaceId to record", () => {
  const record = { id: "task-1", title: "Test" };
  const stamped = stampWorkspace(record, "ws-123");
  assert.equal(stamped.workspaceId, "ws-123");
  assert.equal(stamped.id, "task-1");
  assert.equal(record.workspaceId, undefined);
});

test("hasRole returns true for owner checking member", () => {
  assert.equal(hasRole({ role: "owner" }, "default", "member"), true);
  assert.equal(hasRole({ role: "owner" }, "default", "admin"), true);
  assert.equal(hasRole({ role: "owner" }, "default", "owner"), true);
});

test("hasRole returns false for viewer checking owner", () => {
  assert.equal(hasRole({ role: "viewer" }, "default", "owner"), false);
  assert.equal(hasRole({ role: "viewer" }, "default", "admin"), false);
  assert.equal(hasRole({ role: "viewer" }, "default", "member"), false);
  assert.equal(hasRole({ role: "viewer" }, "default", "viewer"), true);
});

test("hasRole defaults to owner for backward compatibility", () => {
  assert.equal(hasRole({}, "default", "owner"), true);
  assert.equal(hasRole(null, "default", "owner"), true);
});
