/* Phase 4B — Autonomous File/Code Creation tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.CODE_GEN_ENABLED = "1";

const codeGen = require("../server-code-gen");
const dispatch = require("../server-workflow-dispatch");
const registry = require("../server-tool-registry");

test("code-generation tool is registered and dispatchable", () => {
  const def = registry.getToolDefinition("code-generation");
  assert.ok(def);
  assert.equal(def.executable, true);
  assert.equal(registry.isDispatchable(def), true);
});

test("generateProject builds a node-cli file tree", () => {
  const result = codeGen.generateProject("node-cli", { name: "demo", description: "Demo" });
  assert.equal(result.ok, true);
  assert.equal(result.projectName, "demo");
  assert.ok(result.files.length > 0);
  assert.ok(result.files.some((f) => f.path === "package.json"));
  assert.ok(result.files.every((f) => typeof f.content === "string"));
});

test("generateProject rejects invalid names and unknown templates", () => {
  const badName = codeGen.generateProject("node-cli", { name: "Bad Name" });
  assert.equal(badName.ok, false);
  const badTemplate = codeGen.generateProject("nope", { name: "demo" });
  assert.equal(badTemplate.ok, false);
});

test("createProjectZip produces a zip", async () => {
  const project = codeGen.generateProject("node-cli", { name: "demo" });
  const zip = await codeGen.createProjectZip(project);
  assert.equal(zip.ok, true);
  assert.equal(zip.filename, "demo.zip");
  assert.ok(zip.base64.length > 0);
});

test("dispatch code-generation returns project + manifest + zip", async () => {
  const result = await dispatch.dispatch("code-generation", {
    template: "react-app",
    variables: { name: "myapp", description: "App" },
    outputZip: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.project.projectName, "myapp");
  assert.ok(result.manifest.files.length > 0);
  assert.ok(result.zip);
  assert.equal(result.zip.filename, "myapp.zip");
});

test("dispatch code-generation rejects missing variables", async () => {
  const result = await dispatch.dispatch("code-generation", { template: "node-cli" });
  assert.equal(result.ok, false);
  assert.equal(result.failureClassification, "invalid_input");
});
