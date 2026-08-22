/* Approval lifecycle tests — expiry, single-use, decision rules.
   Uses an isolated state file via MARINA_STATE_PATH so the real
   dashboard-state.json is never touched. */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marina-test-"));
process.env.MARINA_STATE_PATH = path.join(tmpDir, "state.json");

// Require AFTER the env override so the module binds to the temp path.
const {
  createApprovalRequest,
  listApprovals,
  decideApproval,
  markApprovalExecuted,
  addAuditEvent,
  listAuditEvents,
} = require("../dashboard-state");

beforeEach(() => {
  if (fs.existsSync(process.env.MARINA_STATE_PATH)) {
    fs.rmSync(process.env.MARINA_STATE_PATH);
  }
});

test("approval is created pending with a TTL and payload binding", () => {
  const approval = createApprovalRequest({
    action: "runCommand",
    riskTier: "high",
    description: "Run shell command: node -v",
    payloadHash: "abc123",
    payloadPreview: { command: "node -v" },
    instruction: { action: "runCommand", payload: { command: "node -v" } },
  });
  assert.equal(approval.status, "pending");
  assert.equal(approval.payloadHash, "abc123");
  assert.ok(new Date(approval.expiresAt).getTime() > Date.now());
  // Raw instruction retained server-side for the execute-once path.
  assert.deepEqual(approval.instruction, {
    action: "runCommand",
    payload: { command: "node -v" },
  });
});

test("approve → execute once → second execution rejected", () => {
  const approval = createApprovalRequest({ action: "deploy", riskTier: "critical" });

  const decided = decideApproval(approval.id, "approved", "looks good");
  assert.equal(decided.ok, true);
  assert.equal(decided.approval.status, "approved");

  const executed = markApprovalExecuted(approval.id, "completed");
  assert.equal(executed.ok, true);
  assert.equal(executed.approval.status, "executed");

  // Single-use: executing again must fail.
  const again = markApprovalExecuted(approval.id, "completed");
  assert.equal(again.ok, false);
});

test("deciding a non-pending approval is rejected", () => {
  const approval = createApprovalRequest({ action: "runCommand", riskTier: "high" });
  decideApproval(approval.id, "rejected", "no");
  const second = decideApproval(approval.id, "approved", "changed my mind");
  assert.equal(second.ok, false);
  assert.match(second.message, /already rejected/);
});

test("expired approvals cannot be approved", () => {
  const approval = createApprovalRequest({ action: "runCommand", riskTier: "high" });
  // Force-expire by rewriting the record's expiry into the past.
  const statePath = process.env.MARINA_STATE_PATH;
  const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const record = raw.approvals.find((a) => a.id === approval.id);
  record.expiresAt = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(statePath, JSON.stringify(raw));

  const result = decideApproval(approval.id, "approved");
  assert.equal(result.ok, false);
  assert.match(result.message, /expired/);
  // Listing marks it expired so the UI never shows stale pending.
  const listed = listApprovals("pending");
  assert.equal(listed.length, 0);
});

test("invalid decisions are rejected", () => {
  const approval = createApprovalRequest({ action: "runCommand", riskTier: "high" });
  const result = decideApproval(approval.id, "approve-all-forever");
  assert.equal(result.ok, false);
  assert.match(result.message, /Invalid decision/);
});

test("audit events capture the full approval lifecycle", () => {
  const approval = createApprovalRequest({ action: "deploy", riskTier: "critical" });
  decideApproval(approval.id, "approved");
  markApprovalExecuted(approval.id);

  const actions = listAuditEvents(50).map((e) => e.action);
  assert.ok(actions.includes("approval.requested"));
  assert.ok(actions.includes("approval.approved"));
  assert.ok(actions.includes("approval.executed"));
});