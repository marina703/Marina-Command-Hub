/* Integration test: /api/chat policy gating over the real HTTP handler.
   The LLM is stubbed deterministically; everything else (policy engine,
   approval store, executor dispatch) is the production code path. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marina-gate-"));
process.env.MARINA_STATE_PATH = path.join(tmpDir, "state.json");

// Stub askLLM BEFORE dashboard-server captures it, via require.cache.
const agentPath = require.resolve("../agent");
const realAgent = require("../agent");
require.cache[agentPath] = {
  id: agentPath,
  filename: agentPath,
  loaded: true,
  exports: {
    ...realAgent,
    askLLM: async () => ({
      instructions: [{ action: "runCommand", payload: { command: "node -v" } }],
      rawText: "",
    }),
  },
};

const { handleRequest } = require("../dashboard-server");

function post(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path: pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(out || "{}") }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pathname }, (res) => {
      let out = "";
      res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(out || "{}") }));
    }).on("error", reject);
  });
}

test("high-risk model-requested action is gated behind approval end-to-end", async () => {
  const server = http.createServer(handleRequest);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Chat with an autonomous high-risk instruction → must NOT execute.
    const chat = await post(port, "/api/chat", { message: "do work", autonomous: true });
    assert.equal(chat.status, 200);
    assert.equal(chat.body.executed.length, 0, "high-risk action must not auto-execute");
    assert.equal(chat.body.pendingApprovals.length, 1);
    const approvalId = chat.body.pendingApprovals[0].id;
    assert.equal(chat.body.pendingApprovals[0].riskTier, "high");
    // Raw payload never leaves the server.
    assert.equal(chat.body.pendingApprovals[0].instruction, undefined);

    // 2. Approval queue lists it as pending, without the raw instruction.
    const list = await get(port, "/api/approvals?status=pending");
    assert.equal(list.body.approvals.length, 1);
    assert.equal(list.body.approvals[0].id, approvalId);
    assert.equal(list.body.approvals[0].instruction, undefined);

    // 3. Approving executes exactly once (benign command).
    const decided = await post(port, "/api/approvals/decision", {
      id: approvalId, decision: "approve", note: "verified benign",
    });
    assert.equal(decided.status, 200);
    assert.equal(decided.body.approval.status, "executed");

    // 4. Re-approval is rejected (single-use).
    const again = await post(port, "/api/approvals/decision", {
      id: approvalId, decision: "approve",
    });
    assert.equal(again.status, 409);

    // 5. Audit trail records request + decision + execution.
    const audit = await get(port, "/api/audit?limit=50");
    const actions = audit.body.events.map((e) => e.action);
    assert.ok(actions.includes("approval.requested"));
    assert.ok(actions.includes("approval.approved"));
    assert.ok(actions.includes("approval.executed"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("destructive commands are blocked outright even before approval", async () => {
  const agentPath2 = require.resolve("../agent");
  const realAgent2 = require("../agent");
  require.cache[agentPath2] = {
    id: agentPath2, filename: agentPath2, loaded: true,
    exports: {
      ...realAgent2,
      askLLM: async () => ({
        instructions: [{ action: "runCommand", payload: { command: "rm -rf /" } }],
        rawText: "",
      }),
    },
  };
  // Re-require picks up the patched cache entry.
  delete require.cache[require.resolve("../dashboard-server")];
  const { handleRequest: gatedHandler } = require("../dashboard-server");

  const server = http.createServer(gatedHandler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const chat = await post(port, "/api/chat", { message: "clean disk", autonomous: true });
    assert.equal(chat.status, 200);
    assert.equal(chat.body.executed.length, 0);
    assert.equal(chat.body.pendingApprovals.length, 0, "destructive action must not even reach approvals");
    assert.equal(chat.body.blocked.length, 1);
    assert.match(chat.body.reply, /blocked by policy/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});