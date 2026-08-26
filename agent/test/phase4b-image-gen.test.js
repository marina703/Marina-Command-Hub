/* Image Generation (AI Design) tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.IMAGE_GEN_ENABLED = "1";
// Ensure no provider key is set so the tool reports not-configured.
delete process.env.OPENAI_API_KEY;
delete process.env.STABLE_API_KEY;

const imageGen = require("../server-image-gen");
const dispatch = require("../server-workflow-dispatch");
const registry = require("../server-tool-registry");

test("image-generation tool is registered and dispatchable", () => {
  const def = registry.getToolDefinition("image-generation");
  assert.ok(def);
  assert.equal(def.executable, true);
  assert.equal(registry.isDispatchable(def), true);
});

test("generateImage returns not-configured without a provider key", async () => {
  const r = await imageGen.generateImage({ prompt: "a cat" });
  assert.equal(r.ok, false);
  assert.match(r.message, /No API key configured/);
});

test("generateImage rejects missing prompt", async () => {
  const r = await imageGen.generateImage({});
  assert.equal(r.ok, false);
  assert.match(r.message, /prompt is required/);
});

test("generateImage rejects unknown provider", async () => {
  const r = await imageGen.generateImage({ prompt: "x", provider: "nope" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Unknown provider/);
});

test("dispatch image-generation returns not_configured without a key", async () => {
  const r = await dispatch.dispatch("image-generation", { prompt: "a sunset" });
  assert.equal(r.ok, false);
  assert.equal(r.failureClassification, "not_configured");
});
