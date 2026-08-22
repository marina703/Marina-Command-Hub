/* ============================================================
   MarinaAI — Durable Queue HTTP Routes

   Server-authorized HTTP routes for the durable queue and
   the local/manual worker harness. All routes:
     1. Validate the bearer token server-side
     2. Verify workspace membership on the server
     3. Scope every query to the verified workspace
     4. Return sanitized errors

   The routes are mounted under /api/durable/queue/* by
   server-durable-routes.js. The local worker script can also
   import this module to exercise the same contract.
   ============================================================ */

const queue = require("./server-queue-repo");
const supabaseRepo = require("./server-supabase");
const sm = require("./server-state-machine");
const worker = require("./server-queue-worker");

function json(res, code, body) {
  if (res.headersSent) return;
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const a = req.headers["authorization"] || "";
  if (!a.startsWith("Bearer ")) return null;
  return a.slice(7).trim() || null;
}

async function requireAuth(req) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: "Authorization header required" };
  const result = await supabaseRepo.verifySession(token);
  if (!result.ok) return { ok: false, status: 401, error: result.error };
  return { ok: true, user: result.user };
}

async function requireWorkspace(req, workspaceId) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  if (!workspaceId) return { ok: false, status: 400, error: "Workspace ID required" };
  const m = await supabaseRepo.verifyWorkspaceMembership(auth.user.id, workspaceId);
  if (!m.ok) return { ok: false, status: 403, error: "Not a member of this workspace" };
  return { ok: true, user: auth.user, role: m.role };
}

function configGuard(res) {
  if (!supabaseRepo.isConfigured) {
    json(res, 503, {
      ok: false,
      message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      code: "not_configured",
    });
    return true;
  }
  return false;
}

// POST /api/durable/queue/enqueue
// Body: { workspaceId, taskId, planId?, toolName?, toolVersion?,
//         idempotencyKey?, maxAttempts?, availableAt? }
async function enqueue(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  const result = await queue.enqueueRun(supabaseRepo, {
    workspaceId: body.workspaceId,
    taskId: body.taskId,
    planId: body.planId,
    toolName: body.toolName,
    toolVersion: body.toolVersion,
    idempotencyKey: body.idempotencyKey,
    maxAttempts: body.maxAttempts,
    availableAt: body.availableAt,
    actorId: auth.user.id,
    requestedBy: auth.user.id,
  });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, run: result.run, isExisting: result.isExisting, correlationId: result.correlationId });
}

// POST /api/durable/queue/cancel
// Body: { workspaceId, runId, reason? }
async function cancelRun(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  // Cross-workspace safety: confirm the run belongs to the workspace.
  const run = await supabaseRepo.getRunInDb(body.runId);
  if (!run.ok) return json(res, 404, { ok: false, message: run.message });
  if (run.run.workspaceId !== body.workspaceId) {
    return json(res, 403, { ok: false, message: "Cross-workspace access denied" });
  }
  const result = await queue.requestCancellation(supabaseRepo, {
    runId: body.runId,
    actorId: auth.user.id,
    reason: body.reason,
  });
  if (!result.ok) return json(res, result.failureClassification === "invalid_state" ? 409 : 500, {
    ok: false,
    message: result.message,
    failureClassification: result.failureClassification,
  });
  return json(res, 200, { ok: true, run: result.run, correlationId: result.correlationId });
}

// POST /api/durable/queue/retry
// Body: { workspaceId, runId, classification? }
async function retryRun(req, res) {
  if (configGuard(res)) return;
  const body = await readJson(req);
  const auth = await requireWorkspace(req, body.workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  const run = await supabaseRepo.getRunInDb(body.runId);
  if (!run.ok) return json(res, 404, { ok: false, message: run.message });
  if (run.run.workspaceId !== body.workspaceId) {
    return json(res, 403, { ok: false, message: "Cross-workspace access denied" });
  }
  const result = await queue.scheduleRetry(supabaseRepo, body.runId, { classification: body.classification });
  if (!result.ok) return json(res, 409, { ok: false, message: result.message });
  return json(res, 200, { ok: true, run: result.run, parentRunId: result.parentRunId, correlationId: result.correlationId });
}

// GET /api/durable/queue/lease-recovery
// Best-effort recovery: caller must be workspace member; we recover
// only expired leases across the queue. The local worker calls this
// periodically; the production worker would too.
async function recoverExpired(req, res, url) {
  if (configGuard(res)) return;
  const workspaceId = url.searchParams.get("workspaceId");
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  const result = await queue.releaseExpiredLeases(supabaseRepo, { workspaceId });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, recovered: result.released, count: result.count });
}

// POST /api/durable/queue/local-worker/once
// Local/development only: requires MARINA_LOCAL_WORKER=1.
// Claims and processes at most one run. Returns the outcome
// without altering the public dispatch surface.
async function localWorkerOnce(req, res) {
  if (configGuard(res)) return;
  if (!worker.isLocalWorkerEnabled()) {
    return json(res, 409, {
      ok: false,
      message: "Local worker harness is not enabled. Set MARINA_LOCAL_WORKER=1 to use it.",
      code: "local_worker_disabled",
    });
  }
  const body = await readJson(req);
  const workspaceId = body.workspaceId;
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  const workerId = body.workerId || "local-worker-api";
  const result = await worker.processOnce(supabaseRepo, workerId, { leaseMs: body.leaseMs });
  if (!result.ok) return json(res, 500, { ok: false, message: result.message });
  return json(res, 200, { ok: true, claimed: result.claimed, run: result.run, result: result.result, correlationId: result.correlationId });
}

// POST /api/durable/queue/local-worker/run
// Local/development only: requires MARINA_LOCAL_WORKER=1.
// Bounded loop: maxIterations hard cap to prevent an
// accidental "always-on" runtime.
async function localWorkerRun(req, res) {
  if (configGuard(res)) return;
  if (!worker.isLocalWorkerEnabled()) {
    return json(res, 409, {
      ok: false,
      message: "Local worker harness is not enabled. Set MARINA_LOCAL_WORKER=1 to use it.",
      code: "local_worker_disabled",
    });
  }
  const body = await readJson(req);
  const workspaceId = body.workspaceId;
  const auth = await requireWorkspace(req, workspaceId);
  if (!auth.ok) return json(res, auth.status, { ok: false, message: auth.error });
  const result = await worker.runLocalWorker(supabaseRepo, {
    workerId: body.workerId,
    maxIterations: body.maxIterations,
    idleSleepMs: body.idleSleepMs,
    leaseMs: body.leaseMs,
  });
  return json(res, 200, { ok: true, workerId: result.workerId, processed: result.processed, claimed: result.claimed, totalIterations: result.totalIterations });
}

module.exports = {
  enqueue,
  cancelRun,
  retryRun,
  recoverExpired,
  localWorkerOnce,
  localWorkerRun,
};
