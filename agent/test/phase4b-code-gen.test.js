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

test("analyzeSpec maps keywords to templates", () => {
  assert.equal(codeGen.analyzeSpec("Build a react dashboard UI").template, "react-app");
  assert.equal(codeGen.analyzeSpec("python fastapi backend service").template, "python-fastapi");
  assert.equal(codeGen.analyzeSpec("build an express rest api").template, "express-api");
  assert.equal(codeGen.analyzeSpec("a cli tool for the terminal").template, "node-cli");
  assert.equal(codeGen.analyzeSpec("unrelated text").template, codeGen.DEFAULT_TEMPLATE);
});

test("deriveName produces a safe project name", () => {
  assert.equal(codeGen.deriveName("My Cool Project"), "my");
  assert.equal(codeGen.deriveName("123 Dashboard"), "123");
  assert.equal(codeGen.deriveName("!!!"), "project");
});

test("scaffoldProject builds a project from a spec", () => {
  const result = codeGen.scaffoldProject("Create a react frontend for tracking tasks");
  assert.equal(result.ok, true);
  assert.equal(result.template, "React Application (Vite + TypeScript)");
  assert.ok(result.files.length > 0);
});

test("dispatch code-generation with a spec auto-selects template", async () => {
  const result = await dispatch.dispatch("code-generation", {
    spec: "python fastapi backend service for orders",
    outputZip: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.project.template, "Python FastAPI Service");
  assert.ok(result.manifest.files.length > 0);
  assert.ok(result.zip);
});

test("createProjectZip includes README and manifest for portability", async () => {
  const project = codeGen.generateProject("node-cli", { name: "demo" });
  const zip = await codeGen.createProjectZip(project);
  const JSZIP = require("jszip");
  const loaded = await JSZIP.loadAsync(Buffer.from(zip.base64, "base64"));
  assert.ok(loaded.file("README.md"));
  assert.ok(loaded.file("manifest.json"));
  const manifest = JSON.parse(await loaded.file("manifest.json").async("string"));
  assert.equal(manifest.projectName, "demo");
});
