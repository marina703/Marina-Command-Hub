/* Phase 4E — Agent Bus tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.AGENT_BUS_ENABLED = "1";

const bus = require("../server-agent-bus");
const dispatch = require("../server-workflow-dispatch");
const registry = require("../server-tool-registry");

test("agent-bus tool is registered and dispatchable", () => {
  const def = registry.getToolDefinition("agent-bus");
  assert.ok(def);
  assert.equal(def.executable, true);
  assert.equal(registry.isDispatchable(def), true);
});

test("registerAgent and findAgents by capability", () => {
  bus.registerAgent({ id: "researcher", capabilities: ["research", "web-search"] });
  bus.registerAgent({ id: "coder", capabilities: ["code", "code-generation"] });
  const found = bus.findAgents("research");
  assert.equal(found.ok, true);
  assert.ok(found.agents.some((a) => a.id === "researcher"));
  assert.ok(!found.agents.some((a) => a.id === "coder"));
});

test("publish and listMessages by topic", () => {
  bus.publish({ topic: "context.shared", from: "researcher", payload: { note: "found sources" } });
  const msgs = bus.listMessages("context.shared");
  assert.equal(msgs.ok, true);
  assert.ok(msgs.messages.length > 0);
  assert.equal(msgs.messages[0].topic, "context.shared");
});

test("delegate creates a delegation and publishes task.delegated", () => {
  const d = bus.delegate({
    from: "planner",
    to: "coder",
    task: "Build the landing page",
    context: { repo: "web" },
    expectedOutput: "A React project",
  });
  assert.equal(d.ok, true);
  assert.equal(d.delegation.status, "delegated");
  assert.equal(d.delegation.to, "coder");
  const del = bus.listDelegations();
  assert.ok(del.delegations.some((x) => x.id === d.delegation.id));
  const msgs = bus.listMessages("task.delegated");
  assert.ok(msgs.messages.some((m) => m.payload.delegationId === d.delegation.id));
});

test("dispatch agent-bus register + find + stats", async () => {
  const reg = await dispatch.dispatch("agent-bus", { action: "register", id: "ops", capabilities: ["automation"] });
  assert.equal(reg.ok, true);

  const find = await dispatch.dispatch("agent-bus", { action: "find", capability: "automation" });
  assert.equal(find.ok, true);
  assert.ok(find.agents.some((a) => a.id === "ops"));

  const stats = await dispatch.dispatch("agent-bus", { action: "stats" });
  assert.equal(stats.ok, true);
  assert.ok(stats.agentCount > 0);
});

test("dispatch agent-bus rejects unknown action", async () => {
  const r = await dispatch.dispatch("agent-bus", { action: "nope" });
  assert.equal(r.ok, false);
  assert.equal(r.failureClassification, "invalid_input");
});
