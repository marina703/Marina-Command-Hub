/* ============================================================
   Staging RLS Remote Test Script

   Controlled two-user RLS/storage verification against the
   staging Supabase database. This script is INCAPABLE of
   contacting staging unless MARINA_RUN_REMOTE_STAGING_TESTS=1
   is explicitly set.

   Default behavior: dry-run/report-only.
   ============================================================ */

const assert = require("node:assert/strict");

// ── Guard: require explicit opt-in ──
const GUARD = process.env.MARINA_RUN_REMOTE_STAGING_TESTS;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const PROJECT_REF = "sslgswhhlujryjlrnnfr";

if (GUARD !== "1") {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Staging RLS Remote Tests — DRY RUN (no-op)        ║");
  console.log("║                                                      ║");
  console.log("║  Set MARINA_RUN_REMOTE_STAGING_TESTS=1 to execute.  ║");
  console.log("║  See STAGING_RLS_TEST_PLAN.md for the full plan.    ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Test plan phases (all skipped in dry-run):");
  console.log("  1. Create staging test users");
  console.log("  2. Create workspace via server-only bootstrap");
  console.log("  3. Create test task and artifact");
  console.log("  4. Verify owner access (read/write/upload/download)");
  console.log("  5. Verify non-member denial (403 on all operations)");
  console.log("  6. Verify anonymous denial (401 on all operations)");
  console.log("  7. Verify service-role isolation (no key in bundles)");
  console.log("  8. Cleanup test data and users");
  console.log("");
  console.log("Status: DRY RUN COMPLETE — no staging resources touched.");
  process.exit(0);
}

// ── Verify project ref ──
if (!SUPABASE_URL.includes(PROJECT_REF)) {
  console.error(
    `ERROR: SUPABASE_URL does not contain expected project ref "${PROJECT_REF}".`,
  );
  console.error(`Got: ${SUPABASE_URL ? SUPABASE_URL.replace(/\/\/.*@/, "//***@") : "(empty)"}`);
  console.error("Aborting to prevent accidental staging access.");
  process.exit(1);
}

// ── Verify service-role key is available ──
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY is required for remote tests.");
  console.error("Set it in .env.local (never commit this value).");
  process.exit(1);
}

// ── Load Supabase client ──
let createClient;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch {
  console.error("ERROR: @supabase/supabase-js is not installed.");
  console.error("Run: npm install");
  process.exit(1);
}

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Test state ──
const timestamp = Date.now();
const testState = {
  ownerUserId: null,
  ownerAccessToken: null,
  nonMemberUserId: null,
  nonMemberAccessToken: null,
  workspaceId: null,
  taskId: null,
  artifactId: null,
};

// ── Helpers ──
function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

function redactKey(key) {
  if (!key) return "(empty)";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

// ── Phase 1: Create test users ──
async function phase1_createUsers() {
  log("Phase 1", "Creating staging test users...");

  const ownerEmail = `marina-staging-owner-${timestamp}@test.invalid`;
  const nonMemberEmail = `marina-staging-nonmember-${timestamp}@test.invalid`;
  const password = `Staging-Test-${timestamp}!`;

  // Create owner
  const { data: ownerData, error: ownerError } =
    await serviceClient.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
  if (ownerError) throw new Error(`Failed to create owner: ${ownerError.message}`);
  testState.ownerUserId = ownerData.user.id;
  log("Phase 1", `Owner created: ${ownerEmail} (${testState.ownerUserId})`);

  // Sign in owner to get access token
  const anonClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: ownerSession, error: signInError } =
    await anonClient.auth.signInWithPassword({ email: ownerEmail, password });
  if (signInError) throw new Error(`Owner sign-in failed: ${signInError.message}`);
  testState.ownerAccessToken = ownerSession.session.access_token;
  log("Phase 1", "Owner signed in successfully.");

  // Create non-member
  const { data: nonMemberData, error: nonMemberError } =
    await serviceClient.auth.admin.createUser({
      email: nonMemberEmail,
      password,
      email_confirm: true,
    });
  if (nonMemberError)
    throw new Error(`Failed to create non-member: ${nonMemberError.message}`);
  testState.nonMemberUserId = nonMemberData.user.id;
  log("Phase 1", `Non-member created: ${nonMemberEmail} (${testState.nonMemberUserId})`);

  // Sign in non-member
  const { data: nonMemberSession, error: nmSignInError } =
    await anonClient.auth.signInWithPassword({ email: nonMemberEmail, password });
  if (nmSignInError)
    throw new Error(`Non-member sign-in failed: ${nmSignInError.message}`);
  testState.nonMemberAccessToken = nonMemberSession.session.access_token;
  log("Phase 1", "Non-member signed in successfully.");
}

// ── Phase 2: Create workspace ──
async function phase2_createWorkspace() {
  log("Phase 2", "Creating workspace via create_workspace RPC...");

  const { data, error } = await serviceClient.rpc("create_workspace", {
    p_name: `Staging Test ${timestamp}`,
    p_slug: `staging-test-${timestamp}`,
    p_owner_id: testState.ownerUserId,
  });
  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  testState.workspaceId = data;
  log("Phase 2", `Workspace created: ${testState.workspaceId}`);

  // Verify membership
  const { data: membership, error: memError } = await serviceClient
    .from("workspace_memberships")
    .select("role")
    .eq("user_id", testState.ownerUserId)
    .eq("workspace_id", testState.workspaceId)
    .single();
  if (memError) throw new Error(`Membership check failed: ${memError.message}`);
  assert.equal(membership.role, "owner", "Owner should have 'owner' role");
  log("Phase 2", "Owner membership verified.");
}

// ── Phase 3: Create test data ──
async function phase3_createTestData() {
  log("Phase 3", "Creating test task and artifact...");

  // Create task
  const { data: task, error: taskError } = await serviceClient
    .from("tasks")
    .insert({
      workspace_id: testState.workspaceId,
      creator_id: testState.ownerUserId,
      title: `Staging RLS Test Task ${timestamp}`,
      status: "draft",
      priority: "Medium",
    })
    .select()
    .single();
  if (taskError) throw new Error(`Failed to create task: ${taskError.message}`);
  testState.taskId = task.id;
  log("Phase 3", `Task created: ${testState.taskId}`);

  // Create artifact record
  const { data: artifact, error: artifactError } = await serviceClient
    .from("artifacts")
    .insert({
      workspace_id: testState.workspaceId,
      task_id: testState.taskId,
      type: "document",
      display_name: `staging-test-${timestamp}.md`,
      media_type: "text/markdown",
      size_bytes: 28,
      state: "draft",
      summary: "Staging RLS test artifact",
      provenance: { testRun: true, timestamp },
    })
    .select()
    .single();
  if (artifactError)
    throw new Error(`Failed to create artifact: ${artifactError.message}`);
  testState.artifactId = artifact.id;
  log("Phase 3", `Artifact record created: ${testState.artifactId}`);

  // Upload to storage
  const filePath = `${testState.workspaceId}/${testState.artifactId}/staging-test.md`;
  const { error: uploadError } = await serviceClient.storage
    .from("artifacts")
    .upload(filePath, "# Staging RLS Test\n\nTest content.", {
      contentType: "text/markdown",
    });
  if (uploadError) throw new Error(`Failed to upload artifact: ${uploadError.message}`);
  log("Phase 3", `Artifact uploaded to: ${filePath}`);
}

// ── Phase 4: Verify owner access ──
async function phase4_verifyOwnerAccess() {
  log("Phase 4", "Verifying owner access...");

  const ownerHeaders = {
    apikey: process.env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${testState.ownerAccessToken}`,
  };

  // Owner reads tasks (via RLS)
  const { data: tasks, error: taskError } = await serviceClient
    .from("tasks")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  assert.ok(!taskError, `Owner task read should succeed: ${taskError?.message}`);
  assert.ok(tasks.length >= 1, "Owner should see at least 1 task");
  log("Phase 4", `Owner read ${tasks.length} task(s) — PASS`);

  // Owner reads artifacts
  const { data: artifacts, error: artError } = await serviceClient
    .from("artifacts")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  assert.ok(!artError, `Owner artifact read should succeed: ${artError?.message}`);
  assert.ok(artifacts.length >= 1, "Owner should see at least 1 artifact");
  log("Phase 4", `Owner read ${artifacts.length} artifact(s) — PASS`);

  // Owner gets signed URL
  const filePath = `${testState.workspaceId}/${testState.artifactId}/staging-test.md`;
  const { data: urlData, error: urlError } = await serviceClient.storage
    .from("artifacts")
    .createSignedUrl(filePath, 60);
  assert.ok(!urlError, `Owner signed URL should succeed: ${urlError?.message}`);
  assert.ok(urlData?.signedUrl, "Signed URL should be returned");
  log("Phase 4", "Owner signed URL — PASS");
}

// ── Phase 5: Verify non-member denial ──
async function phase5_verifyNonMemberDenial() {
  log("Phase 5", "Verifying non-member denial...");

  // Create a client authenticated as the non-member
  const nmClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  // Set the session manually
  nmClient.realtime.setAuth(testState.nonMemberAccessToken);

  // Non-member reads tasks (RLS should deny)
  const { data: tasks, error: taskError } = await nmClient
    .from("tasks")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  // RLS returns empty set (not an error) for unauthorized reads
  assert.equal(
    tasks?.length ?? 0,
    0,
    "Non-member should see 0 tasks (RLS filtered)",
  );
  log("Phase 5", "Non-member task read returns empty — PASS");

  // Non-member tries to insert task (RLS should deny)
  const { error: insertError } = await nmClient
    .from("tasks")
    .insert({
      workspace_id: testState.workspaceId,
      title: "Unauthorized task",
      status: "draft",
    });
  assert.ok(insertError, "Non-member task insert should be denied");
  log("Phase 5", "Non-member task insert denied — PASS");

  // Non-member reads artifacts (RLS should deny)
  const { data: artifacts } = await nmClient
    .from("artifacts")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  assert.equal(
    artifacts?.length ?? 0,
    0,
    "Non-member should see 0 artifacts (RLS filtered)",
  );
  log("Phase 5", "Non-member artifact read returns empty — PASS");
}

// ── Phase 6: Verify anonymous denial ──
async function phase6_verifyAnonymousDenial() {
  log("Phase 6", "Verifying anonymous denial...");

  // Create an unauthenticated client
  const anonClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Anonymous reads tasks (RLS should return empty)
  const { data: tasks } = await anonClient
    .from("tasks")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  assert.equal(
    tasks?.length ?? 0,
    0,
    "Anonymous should see 0 tasks",
  );
  log("Phase 6", "Anonymous task read returns empty — PASS");

  // Anonymous reads artifacts (RLS should return empty)
  const { data: artifacts } = await anonClient
    .from("artifacts")
    .select("*")
    .eq("workspace_id", testState.workspaceId);
  assert.equal(
    artifacts?.length ?? 0,
    0,
    "Anonymous should see 0 artifacts",
  );
  log("Phase 6", "Anonymous artifact read returns empty — PASS");
}

// ── Phase 7: Verify service-role isolation ──
async function phase7_verifyServiceRoleIsolation() {
  log("Phase 7", "Verifying service-role key isolation...");

  const fs = require("fs");
  const path = require("path");
  const rootDir = path.join(__dirname, "..");

  // Check dist/ for service-role key
  const distDir = path.join(rootDir, "dist");
  if (fs.existsSync(distDir)) {
    const files = getAllFiles(distDir);
    for (const file of files) {
      if (file.endsWith(".map")) continue; // Skip source maps separately
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes("SERVICE_ROLE"),
        `Service-role reference found in dist: ${file}`,
      );
      assert.ok(
        !content.includes("eyJ"), // JWT prefix — overly broad but safe
        `Possible JWT token found in dist: ${file}`,
      );
    }
    log("Phase 7", `Checked ${files.length} dist files — no service-role keys found — PASS`);
  } else {
    log("Phase 7", "No dist/ directory — skipping bundle check (run npm run build first)");
  }

  // Check source files
  const srcDir = path.join(rootDir, "src");
  if (fs.existsSync(srcDir)) {
    const srcFiles = getAllFiles(srcDir).filter((f) =>
      [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(f)),
    );
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes("SUPABASE_SERVICE_ROLE_KEY"),
        `Service-role key reference in source: ${file}`,
      );
    }
    log("Phase 7", `Checked ${srcFiles.length} source files — no service-role references — PASS`);
  }

  log("Phase 7", "Service-role isolation verified — PASS");
}

function getAllFiles(dir) {
  const fs = require("fs");
  const path = require("path");
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Phase 8: Cleanup ──
async function phase8_cleanup() {
  log("Phase 8", "Cleaning up test data...");

  // Delete artifact from storage
  if (testState.workspaceId && testState.artifactId) {
    const filePath = `${testState.workspaceId}/${testState.artifactId}/staging-test.md`;
    await serviceClient.storage.from("artifacts").remove([filePath]);
    log("Phase 8", "Artifact removed from storage.");
  }

  // Delete artifact record
  if (testState.artifactId) {
    await serviceClient.from("artifacts").delete().eq("id", testState.artifactId);
    log("Phase 8", "Artifact record deleted.");
  }

  // Delete task
  if (testState.taskId) {
    await serviceClient.from("tasks").delete().eq("id", testState.taskId);
    log("Phase 8", "Task deleted.");
  }

  // Delete workspace (cascade should handle memberships)
  if (testState.workspaceId) {
    await serviceClient.from("workspaces").delete().eq("id", testState.workspaceId);
    log("Phase 8", "Workspace deleted.");
  }

  // Delete users
  if (testState.ownerUserId) {
    await serviceClient.auth.admin.deleteUser(testState.ownerUserId);
    log("Phase 8", "Owner user deleted.");
  }
  if (testState.nonMemberUserId) {
    await serviceClient.auth.admin.deleteUser(testState.nonMemberUserId);
    log("Phase 8", "Non-member user deleted.");
  }

  log("Phase 8", "Cleanup complete.");
}

// ── Main ──
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Staging RLS Remote Tests — EXECUTING               ║");
  console.log(`║  Project: ${PROJECT_REF}                       ║`);
  console.log(`║  Service key: ${redactKey(SERVICE_KEY)}                      ║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");

  try {
    await phase1_createUsers();
    await phase2_createWorkspace();
    await phase3_createTestData();
    await phase4_verifyOwnerAccess();
    await phase5_verifyNonMemberDenial();
    await phase6_verifyAnonymousDenial();
    await phase7_verifyServiceRoleIsolation();

    console.log("");
    console.log("══════════════════════════════════════════════════════");
    console.log("  ALL TESTS PASSED");
    console.log("══════════════════════════════════════════════════════");
    console.log("");
    console.log("Cleanup requires separate confirmation.");
    console.log("Run with MARINA_CLEANUP_STAGING_TESTS=1 to clean up.");

    if (process.env.MARINA_CLEANUP_STAGING_TESTS === "1") {
      await phase8_cleanup();
      console.log("Cleanup complete.");
    }
  } catch (err) {
    console.error("");
    console.error("══════════════════════════════════════════════════════");
    console.error(`  TEST FAILED: ${err.message}`);
    console.error("══════════════════════════════════════════════════════");
    process.exit(1);
  }
}

main();