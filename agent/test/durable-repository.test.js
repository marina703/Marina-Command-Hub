/* ============================================================
   Durable Repository tests

   These tests prove the durable repository layer exposes a
   complete typed CRUD surface over the persisted domain records
   and returns a truthful "not configured" unavailable state
   when Supabase is not configured.

   They do NOT exercise the Supabase client itself (that requires
   a live connection). Instead they verify the surface and the
   "not_configured" failure mode.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const supabaseRepo = require("../server-supabase");

test("repository exports a complete durable CRUD surface", () => {
  // Tasks
  assert.equal(typeof supabaseRepo.createTaskInDb, "function");
  assert.equal(typeof supabaseRepo.getTaskInDb, "function");
  assert.equal(typeof supabaseRepo.listTasksInDb, "function");
  assert.equal(typeof supabaseRepo.updateTaskInDb, "function");
  // Plans
  assert.equal(typeof supabaseRepo.nextPlanVersion, "function");
  assert.equal(typeof supabaseRepo.createPlanInDb, "function");
  assert.equal(typeof supabaseRepo.createPlanStepsInDb, "function");
  assert.equal(typeof supabaseRepo.listPlansForTaskInDb, "function");
  assert.equal(typeof supabaseRepo.getPlanInDb, "function");
  assert.equal(typeof supabaseRepo.updatePlanStatusInDb, "function");
  // Runs
  assert.equal(typeof supabaseRepo.createRunInDb, "function");
  assert.equal(typeof supabaseRepo.updateRunStatusInDb, "function");
  assert.equal(typeof supabaseRepo.getRunInDb, "function");
  assert.equal(typeof supabaseRepo.listRunsForTaskInDb, "function");
  assert.equal(typeof supabaseRepo.nextRunEventSequence, "function");
  assert.equal(typeof supabaseRepo.createRunEventInDb, "function");
  assert.equal(typeof supabaseRepo.listRunEventsInDb, "function");
  assert.equal(typeof supabaseRepo.findActiveRunForTaskInDb, "function");
  // Approvals
  assert.equal(typeof supabaseRepo.createApprovalInDb, "function");
  assert.equal(typeof supabaseRepo.getApprovalInDb, "function");
  assert.equal(typeof supabaseRepo.listApprovalsInDb, "function");
  assert.equal(typeof supabaseRepo.updateApprovalStatusInDb, "function");
  // Artifacts
  assert.equal(typeof supabaseRepo.createArtifactInDb, "function");
  assert.equal(typeof supabaseRepo.updateArtifactStateInDb, "function");
  assert.equal(typeof supabaseRepo.getArtifactInDb, "function");
  assert.equal(typeof supabaseRepo.listArtifactsInDb, "function");
  // Audit
  assert.equal(typeof supabaseRepo.createAuditEventInDb, "function");
  assert.equal(typeof supabaseRepo.listAuditEventsInDb, "function");
  // Storage
  assert.equal(typeof supabaseRepo.uploadArtifactFile, "function");
  assert.equal(typeof supabaseRepo.getArtifactSignedUrl, "function");
});

test("all repository functions return not_configured when Supabase is absent", async () => {
  // When the package is missing OR env vars are missing, isConfigured is false.
  if (supabaseRepo.isConfigured) return; // skip when live Supabase is configured
  const results = await Promise.all([
    supabaseRepo.createTaskInDb({ workspaceId: "w", title: "T" }),
    supabaseRepo.getTaskInDb("w", "t"),
    supabaseRepo.listTasksInDb("w"),
    supabaseRepo.updateTaskInDb("w", "t", {}),
    supabaseRepo.createPlanInDb({ workspaceId: "w", taskId: "t" }),
    supabaseRepo.createPlanStepsInDb([]),
    supabaseRepo.getPlanInDb("w", "p"),
    supabaseRepo.updatePlanStatusInDb("w", "p", "approved"),
    supabaseRepo.createRunInDb({ workspaceId: "w", taskId: "t" }),
    supabaseRepo.updateRunStatusInDb("r", "queued"),
    supabaseRepo.createRunEventInDb({ workspaceId: "w", runId: "r", event: "x", summary: "s" }),
    supabaseRepo.createArtifactInDb({ workspaceId: "w", displayName: "A" }),
    supabaseRepo.createApprovalInDb({ workspaceId: "w", actionType: "x", payloadHash: "h" }),
    supabaseRepo.createAuditEventInDb({ workspaceId: "w", action: "x" }),
  ]);
  for (const r of results) {
    assert.equal(r.ok, false);
    assert.match(r.message, /not configured/i);
  }
});

test("artifact validation: 50MB max + MIME allowlist constants are exposed", () => {
  assert.equal(supabaseRepo.ARTIFACT_MAX_BYTES, 50 * 1024 * 1024);
  assert.ok(supabaseRepo.ALLOWED_MIME_TYPES instanceof Set);
  assert.ok(supabaseRepo.ALLOWED_MIME_TYPES.has("text/markdown"));
  assert.ok(supabaseRepo.ALLOWED_MIME_TYPES.has("application/json"));
  // The list does NOT include dangerous executable types
  assert.ok(!supabaseRepo.ALLOWED_MIME_TYPES.has("application/x-executable"));
  assert.ok(!supabaseRepo.ALLOWED_MIME_TYPES.has("text/html"));
  assert.ok(!supabaseRepo.ALLOWED_MIME_TYPES.has("application/x-msdownload"));
});

test("workspace authorization helpers reject missing user/workspace", async () => {
  if (supabaseRepo.isConfigured) return;
  const r1 = await supabaseRepo.getUserWorkspaces(null);
  assert.equal(r1.ok, false);
  const r2 = await supabaseRepo.verifyWorkspaceMembership(null, null);
  assert.equal(r2.ok, false);
});

test("session verification requires a bearer token and is not configured without it", async () => {
  if (supabaseRepo.isConfigured) return;
  const r = await supabaseRepo.verifySession();
  assert.equal(r.ok, false);
  assert.match(r.error, /not configured|bearer/i);
});
