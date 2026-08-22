/* Policy engine tests — risk classification, redaction, veto. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyRisk,
  redactPayload,
  payloadHash,
  describeInstruction,
  policyVeto,
} = require("../server-policy");

test("risk classification maps actions to tiers", () => {
  assert.equal(classifyRisk("readFile"), "low");
  assert.equal(classifyRisk("writeFile"), "moderate");
  assert.equal(classifyRisk("modifyFile"), "moderate");
  assert.equal(classifyRisk("runCommand"), "high");
  assert.equal(classifyRisk("installDependencies"), "high");
  assert.equal(classifyRisk("deploy"), "critical");
});

test("unknown or missing actions fail closed as critical", () => {
  assert.equal(classifyRisk("totallyUnknownAction"), "critical");
  assert.equal(classifyRisk(undefined), "critical");
  assert.equal(classifyRisk(""), "critical");
  assert.equal(classifyRisk(null), "critical");
});

test("redaction masks sensitive keys at any depth", () => {
  const payload = {
    command: "deploy --token abc123",
    apiKey: "AIzaSuperSecret",
    nested: {
      password: "hunter2",
      safe: "visible",
    },
  };
  const redacted = redactPayload(payload);
  assert.equal(redacted.apiKey, "[redacted]");
  assert.equal(redacted.nested.password, "[redacted]");
  assert.equal(redacted.nested.safe, "visible");
  // Original payload must not be mutated.
  assert.equal(payload.apiKey, "AIzaSuperSecret");
});

test("redaction truncates long strings and deep objects", () => {
  const long = "x".repeat(1000);
  const out = redactPayload({ blob: long });
  assert.ok(out.blob.length < 400);
  assert.ok(out.blob.endsWith("[truncated]"));
  const deep = { a: { b: { c: { d: 1 } } } };
  const outDeep = redactPayload(deep);
  assert.equal(outDeep.a.b, "[deep object omitted]");
});

test("payload hash is stable and input-sensitive", () => {
  const a = payloadHash({ command: "node -v" });
  const b = payloadHash({ command: "node -v" });
  const c = payloadHash({ command: "node -w" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(typeof a, "string");
  assert.ok(a.length > 0);
});

test("describeInstruction produces readable previews without raw secrets", () => {
  const text = describeInstruction({
    action: "runCommand",
    payload: { command: "npm test" },
  });
  assert.ok(text.includes("npm test"));
  const write = describeInstruction({
    action: "writeFile",
    payload: { path: "tmp/notes.md", content: "hello" },
  });
  assert.ok(write.includes("tmp/notes.md"));
});

test("destructive commands are vetoed regardless of tier", () => {
  const dangerous = [
    "rm -rf /",
    "rm -rf ~",
    "format C:",
    "shutdown /s",
    "mkfs.ext4 /dev/sda1",
    "dd if=/dev/zero of=/dev/sda",
  ];
  for (const cmd of dangerous) {
    const reason = policyVeto({ action: "runCommand", payload: { command: cmd } });
    assert.ok(reason, `"${cmd}" must be vetoed`);
  }
  // Benign commands pass.
  assert.equal(
    policyVeto({ action: "runCommand", payload: { command: "node -v" } }),
    null,
  );
});