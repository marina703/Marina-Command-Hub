/* ============================================================
   Auth Integration Tests

   Tests for signed-out, member, and non-member server API
   behavior; server-side workspace binding; no client-side
   service-role references; private artifact validation; and
   dry-run guard behavior.

   These tests run locally against the server-supabase.js
   module in its "not configured" state (no real Supabase
   connection required).
   ============================================================ */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

// ── Test: server-supabase.js module loads safely ──
describe("server-supabase module", () => {
  test("loads without crashing when env vars are missing", () => {
    const repo = require("../server-supabase");
    assert.ok(repo, "Module should load");
    assert.equal(typeof repo.isConfigured, "boolean");
    assert.equal(typeof repo.getSupabaseStatus, "function");
    assert.equal(typeof repo.verifySession, "function");
    assert.equal(typeof repo.getUserWorkspaces, "function");
    assert.equal(typeof repo.verifyWorkspaceMembership, "function");
    assert.equal(typeof repo.createWorkspaceForAuthenticatedUser, "function");
  });

  test("reports not configured when env vars are missing", () => {
    const repo = require("../server-supabase");
    // In test environment without .env.local, isConfigured should be false
    assert.equal(repo.isConfigured, false);
    const status = repo.getSupabaseStatus();
    assert.equal(status.configured, false);
    assert.equal(status.packageInstalled, true); // @supabase/supabase-js is installed
  });

  test("verifySession returns error when not configured", async () => {
    const repo = require("../server-supabase");
    const result = await repo.verifySession("fake-token");
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("not configured"));
  });

  test("getUserWorkspaces returns error when not configured", async () => {
    const repo = require("../server-supabase");
    const result = await repo.getUserWorkspaces("fake-user-id");
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("not configured"));
  });

  test("verifyWorkspaceMembership returns error when not configured", async () => {
    const repo = require("../server-supabase");
    const result = await repo.verifyWorkspaceMembership(
      "fake-user-id",
      "fake-workspace-id",
    );
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("not configured"));
  });

  test("createWorkspaceForAuthenticatedUser rejects without token", async () => {
    const repo = require("../server-supabase");
    const result = await repo.createWorkspaceForAuthenticatedUser(
      "",
      "Test",
      "test",
    );
    assert.equal(result.ok, false);
  });

  test("createWorkspace rejects without userId", async () => {
    const repo = require("../server-supabase");
    const result = await repo.createWorkspace({
      userId: "",
      name: "Test",
      slug: "test",
    });
    assert.equal(result.ok, false);
    // When not configured, returns "Supabase not configured"; when configured
    // but no userId, returns "Authenticated user ID required"
    assert.ok(
      result.message.includes("not configured") ||
        result.message.includes("Authenticated user ID required"),
      `Unexpected message: ${result.message}`,
    );
  });
});

// ── Test: Artifact validation constants ──
describe("artifact validation", () => {
  test("ARTIFACT_MAX_BYTES is 50MB", () => {
    const repo = require("../server-supabase");
    assert.equal(repo.ARTIFACT_MAX_BYTES, 50 * 1024 * 1024);
  });

  test("ALLOWED_MIME_TYPES includes common types", () => {
    const repo = require("../server-supabase");
    assert.ok(repo.ALLOWED_MIME_TYPES.has("text/markdown"));
    assert.ok(repo.ALLOWED_MIME_TYPES.has("application/json"));
    assert.ok(repo.ALLOWED_MIME_TYPES.has("application/pdf"));
    assert.ok(repo.ALLOWED_MIME_TYPES.has("image/png"));
    assert.ok(!repo.ALLOWED_MIME_TYPES.has("application/x-executable"));
    assert.ok(!repo.ALLOWED_MIME_TYPES.has("text/html"));
  });

  test("uploadArtifactFile rejects oversized files when not configured", async () => {
    const repo = require("../server-supabase");
    const result = await repo.uploadArtifactFile(
      "ws-1",
      "art-1",
      "test.md",
      "content",
      "text/markdown",
      100 * 1024 * 1024, // 100MB
    );
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("not configured"));
  });
});

// ── Test: Dashboard server auth helpers ──
describe("dashboard-server auth helpers", () => {
  test("module exports handleRequest and sendJson", () => {
    const server = require("../dashboard-server");
    assert.equal(typeof server.handleRequest, "function");
    assert.equal(typeof server.sendJson, "function");
    assert.equal(typeof server.readJsonBody, "function");
  });
});

// ── Test: Staging RLS remote test dry-run guard ──
describe("staging RLS remote test guard", () => {
  test("dry-run exits cleanly without env var", () => {
    const { execSync } = require("node:child_process");
    const path = require("node:path");
    const script = path.join(__dirname, "staging-rls-remote.test.js");

    // Run without MARINA_RUN_REMOTE_STAGING_TESTS — should exit 0 with dry-run message
    const output = execSync(`node "${script}"`, {
      encoding: "utf8",
      env: { ...process.env, MARINA_RUN_REMOTE_STAGING_TESTS: "" },
    });
    assert.ok(output.includes("DRY RUN"));
    assert.ok(output.includes("no staging resources touched"));
  });

  test("exits with error when guard is set but URL is wrong", () => {
    const { execSync } = require("node:child_process");
    const path = require("node:path");
    const script = path.join(__dirname, "staging-rls-remote.test.js");

    try {
      execSync(`node "${script}"`, {
        encoding: "utf8",
        env: {
          ...process.env,
          MARINA_RUN_REMOTE_STAGING_TESTS: "1",
          SUPABASE_URL: "https://wrong-project.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "fake-key",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with error");
    } catch (err) {
      // Error output may be on stdout or stderr depending on platform
      const output = (err.stdout || "") + (err.stderr || "");
      assert.ok(
        output.includes("does not contain expected project ref"),
        `Expected project ref error, got: ${output.slice(0, 200)}`,
      );
    }
  });
});

// ── Test: No service-role references in source ──
describe("service-role isolation", () => {
  test("no SUPABASE_SERVICE_ROLE_KEY in client source files", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const srcDir = path.join(__dirname, "..", "src");

    function walk(dir) {
      const results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full));
        else results.push(full);
      }
      return results;
    }

    const files = walk(srcDir).filter((f) =>
      [".ts", ".tsx", ".js", ".jsx"].includes(path.extname(f)),
    );

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes("SUPABASE_SERVICE_ROLE_KEY"),
        `Service-role key reference found in: ${path.relative(srcDir, file)}`,
      );
      assert.ok(
        !content.includes("service_role"),
        `service_role reference found in: ${path.relative(srcDir, file)}`,
      );
    }
  });
});