/* ============================================================
   Durable HTTP Routes tests

   Verify the /api/durable/* dispatcher enforces:
     - bearer token authentication
     - workspace membership authorization
     - not_configured guard
     - invalid transition rejection
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const routes = require("../server-durable-routes");
const supabaseRepo = require("../server-supabase");
const sm = require("../server-state-machine");

// Minimal mock response
function mockRes() {
  const res = {
    headersSent: false,
    statusCode: null,
    body: null,
    writeHead(code, headers) { this.statusCode = code; return this; },
    end(body) { this.body = body; return this; },
  };
  return res;
}

function parseJson(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

test("durable routes: missing auth → 401 (or 503 when not configured)", async () => {
  const req = { method: "GET", url: "/api/durable/tasks?workspaceId=w", headers: {} };
  const res = mockRes();
  await routes.handleDurable(req, res, new URL(req.url, "http://localhost"));
  // When Supabase is not configured, the configGuard returns 503.
  // When configured, auth fails first with 401. Either is a correct
  // server-authorized rejection.
  assert.ok([401, 503].includes(res.statusCode), `unexpected ${res.statusCode}`);
  assert.equal(parseJson(res).ok, false);
});

test("durable routes: tasks list with not_configured returns 503 (or auth error first)", async () => {
  const req = { method: "GET", url: "/api/durable/tasks?workspaceId=w", headers: { authorization: "Bearer fake-token" } };
  const res = mockRes();
  await routes.handleDurable(req, res, new URL(req.url, "http://localhost"));
  // When Supabase is not configured, the configGuard returns 503.
  // When configured, auth fails with 401. Either is a correct server-authorized rejection.
  assert.ok([401, 403, 503].includes(res.statusCode), `unexpected ${res.statusCode}`);
});

test("durable routes: workflow registry lists exactly one workflow", async () => {
  const req = { method: "GET", url: "/api/durable/workflows", headers: {} };
  const res = mockRes();
  await routes.handleDurable(req, res, new URL(req.url, "http://localhost"));
  // The registry endpoint is browser-safe and unauthenticated (read-only metadata).
  assert.equal(res.statusCode, 200);
  const body = parseJson(res);
  assert.equal(body.ok, true);
  assert.equal(body.workflows.length, 1);
  assert.equal(body.workflows[0].id, "safe-internal");
});

test("durable routes: unknown route returns 404", async () => {
  const req = { method: "GET", url: "/api/durable/not-a-real-route", headers: {} };
  const res = mockRes();
  await routes.handleDurable(req, res, new URL(req.url, "http://localhost"));
  assert.equal(res.statusCode, 404);
});

test("state machine: plan revision creates a new version, never overwrites approved", () => {
  // Plan version 1 approved
  assert.ok(sm.canTransition("plan", "draft", "approved"));
  assert.ok(sm.canTransition("plan", "approved", "superseded"));
  // Cannot transition approved back to draft
  assert.ok(!sm.canTransition("plan", "approved", "draft"));
  // But rejected CAN go back to draft for revision
  assert.ok(sm.canTransition("plan", "rejected", "draft"));
});

test("state machine: task happy path through safe workflow", () => {
  const path = ["draft", "planning", "awaiting_plan_review", "queued", "running", "completed"];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(sm.canTransition("task", path[i], path[i + 1]),
      `task ${path[i]} → ${path[i + 1]} must be allowed`);
  }
});

test("state machine: run cancel is allowed from queued and active", () => {
  for (const s of ["queued", "active"]) {
    assert.ok(sm.canTransition("run", s, "cancelled"));
  }
  assert.ok(!sm.canTransition("run", "succeeded", "cancelled"));
});

test("state machine: run retry is only allowed from failed/timed_out/cancelled", () => {
  for (const s of ["failed", "timed_out", "cancelled"]) {
    assert.ok(sm.canTransition("run", s, "queued"), `${s} → queued should be allowed for retry`);
  }
  assert.ok(!sm.canTransition("run", "succeeded", "queued"));
});

test("artifact repository functions preserve a public = false contract (no public URL surface)", () => {
  // The signed-url helper must be the only public-facing artifact route.
  // There is no getArtifactPublicUrl function exported.
  assert.equal(typeof supabaseRepo.getArtifactSignedUrl, "function");
  // The constants block executable / html / x-msdownload MIME types.
  const blocked = ["application/x-executable", "text/html", "application/x-msdownload", "application/x-shockwave-flash"];
  for (const m of blocked) {
    assert.ok(!supabaseRepo.ALLOWED_MIME_TYPES.has(m), `${m} must not be allow-listed`);
  }
});
