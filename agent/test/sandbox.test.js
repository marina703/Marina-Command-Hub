const test = require("node:test");
const assert = require("node:assert/strict");
const sandbox = require("../server-sandbox.js");

test("sandbox module health check", async () => {
  const health = await sandbox.healthCheck();
  assert.equal(typeof health.ok, "boolean");
  assert.equal(health.ok, true);
  assert.ok(Array.isArray(health.available));
});

test("sandbox executeCode node evaluation", async () => {
  const result = await sandbox.executeCode("node", "console.log('hello sandbox');");
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes("hello sandbox"));
});
