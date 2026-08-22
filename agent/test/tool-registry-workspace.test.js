/* Tool registry and workspace authorization tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateToolInput,
  getToolDefinition,
  listTools,
  isToolAvailable,
  requiresApproval,
} = require("../server-tool-registry");

const {
  resolveWorkspaceId,
  assertWorkspaceAccess,
  scopeToWorkspace,
  stampWorkspace,
  hasRole,
  AuthorizationError,
} = require("../server-workspace");

/* ── Tool Registry ── */

test("listTools returns all registered tools", () => {
  const tools = listTools();
  assert.ok(tools.length >= 7);
  const names = tools.map((t) => t.name);
  assert.ok(names.includes("readFile"));
  assert.ok(names.includes("writeFile"));
  assert.ok(names.includes("runCommand"));
  assert.ok(names.includes("deploy"));
});

test("getToolDefinition returns definition for known action", () => {
  const def = getToolDefinition("runCommand");
  assert.ok(def);
  assert.equal(def.riskTier, "high");
  assert.equal(def.approvalPolicy, "just_in_time");
});

test("getToolDefinition returns null for unknown action", () => {
  assert.equal(getToolDefinition("totallyBogus"), null);
  assert.equal(getToolDefinition(null), null);
});

test("validateToolInput accepts valid input", () => {
  const def = getToolDefinition("writeFile");
  const result = validateToolInput(def, { path: "test.txt", content: "hello" });
  assert.equal(result.ok, true);
});

test("validateToolInput rejects missing required fields", () => {
  const def = getToolDefinition("writeFile");
  const result = validateToolInput(def, { content: "hello" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Missing required field: path/);
});

test("validateToolInput rejects strings exceeding maxLength", () => {
  const def = getToolDefinition("writeFile");
  const longPath = "x".repeat(600);
  const result = validateToolInput(def, { path: longPath, content: "x" });
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds max length/);
});

test("validateToolInput rejects wrong types", () => {
  const def = getToolDefinition("writeFile");
  const result = validateToolInput(def, { path: 123, content: "x" });
  assert.equal(result.ok, false);
  assert.match(result.error, /path must be a string/);
});

test("validateToolInput rejects invalid enum values", () => {
  const def = getToolDefinition("installDependencies");
  const result = validateToolInput(def, {
    packages: ["test"],
    packageManager: "invalid-pm",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /packageManager must be one of/);
});

test("requiresApproval returns true for high-risk tools", () => {
  assert.equal(requiresApproval(getToolDefinition("runCommand")), true);
  assert.equal(requiresApproval(getToolDefinition("deploy")), true);
});

test("requiresApproval returns false for low-risk tools", () => {
  assert.equal(requiresApproval(getToolDefinition("readFile")), false);
  assert.equal(requiresApproval(getToolDefinition("generateReport")), false);
});

test("requiresApproval returns true for unknown tools (fail-closed)", () => {
  assert.equal(requiresApproval(null), true);
});

test("isToolAvailable returns false for feature-gated tools without env", () => {
  // runCommand requires MARINA_ENABLE_EXEC
  const def = getToolDefinition("runCommand");
  // Without the env var set, it should be unavailable
  const saved = process.env.MARINA_ENABLE_EXEC;
  delete process.env.MARINA_ENABLE_EXEC;
  assert.equal(isToolAvailable(def), false);
  // With the env var set, it should be available
  process.env.MARINA_ENABLE_EXEC = "1";
  assert.equal(isToolAvailable(def), true);
  // Restore
  if (saved) process.env.MARINA_ENABLE_EXEC = saved;
  else delete process.env.MARINA_ENABLE_EXEC;
});

test("isToolAvailable returns true for non-gated tools", () => {
  assert.equal(isToolAvailable(getToolDefinition("readFile")), true);
  assert.equal(isToolAvailable(getToolDefinition("writeFile")), true);
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
    { id: "3" }, // no workspaceId → included (backward compat)
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
  // Original not mutated
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