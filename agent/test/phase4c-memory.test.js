/* Phase 4C — Knowledge Graph Memory tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.MEMORY_ENABLED = "1";
process.env.MEMORY_GRAPH_FILE = require("path").join(require("os").tmpdir(), "memory-test-graph.json");

const memory = require("../server-graph-memory");
const dispatch = require("../server-workflow-dispatch");
const registry = require("../server-tool-registry");

// Fresh store per run.
memory.clear();

test("memory tool is registered and dispatchable", () => {
  const def = registry.getToolDefinition("memory");
  assert.ok(def);
  assert.equal(def.executable, true);
  assert.equal(registry.isDispatchable(def), true);
});

test("remember writes nodes and relations", () => {
  const r = memory.remember({
    id: "task-1",
    type: "task",
    label: "Deploy to Vercel",
    props: { lesson: "Use the SPA fallback rewrite" },
    relations: [{ to: "vercel", relation: "uses" }, { to: "nextjs", relation: "built_with" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.nodeCount, 3); // task-1 + vercel + nextjs
  assert.equal(r.edgeCount, 2);
});

test("recall finds a node by query and traverses neighbors", () => {
  memory.remember({ id: "vercel", type: "platform", label: "Vercel hosting" });
  const r = memory.recall({ query: "deploy", depth: 2, limit: 10 });
  assert.equal(r.ok, true);
  assert.ok(r.results.length > 0);
  assert.ok(r.results.some((x) => x.node.id === "task-1"));
});

test("reason finds a multi-hop path", () => {
  memory.remember({ id: "nextjs", type: "framework", label: "Next.js", relations: [{ to: "vercel", relation: "deploys_to" }] });
  memory.remember({
    id: "task-2",
    label: "Build landing page",
    relations: [{ to: "nextjs", relation: "uses" }],
  });
  const r = memory.reason({ start: "task-2", end: "vercel", maxHops: 5 });
  assert.equal(r.ok, true);
  assert.ok(r.path.includes("nextjs"));
});

test("reason returns not-found for unknown nodes", () => {
  const r = memory.reason({ start: "nope", end: "vercel" });
  assert.equal(r.ok, false);
});

test("dispatch memory remember + recall + stats", async () => {
  const rem = await dispatch.dispatch("memory", {
    action: "remember",
    id: "lesson-1",
    label: "Deploy lesson",
    props: { lesson: "Always run migrations first" },
  });
  assert.equal(rem.ok, true);

  const rec = await dispatch.dispatch("memory", { action: "recall", query: "lesson", depth: 2 });
  assert.equal(rec.ok, true);
  assert.ok(rec.results.some((x) => x.node.id === "lesson-1"));

  const stats = await dispatch.dispatch("memory", { action: "stats" });
  assert.equal(stats.ok, true);
  assert.ok(stats.nodeCount > 0);
});

test("dispatch memory rejects unknown action", async () => {
  const r = await dispatch.dispatch("memory", { action: "nope" });
  assert.equal(r.ok, false);
  assert.equal(r.failureClassification, "invalid_input");
});
