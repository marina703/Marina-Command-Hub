/* ============================================================
   Durable Workflow Remote Test — Local Guard Tests

   These tests run entirely locally (no network). They verify the
   safety properties of the durable-workflow-remote.test.js script:
     1. Default behavior is non-networking dry-run (no remote contact).
     2. Project-ref guard fails closed before any remote request when
        SUPABASE_URL is wrong (even with both run + cleanup flags set).
     3. The run and cleanup flags are independent. Setting only the
        cleanup flag is not enough to run; setting only the run flag
        does not auto-clean.
     4. The exact-manifest cleanup selector strategy is documented
        in the test script and does not use broad email prefixes or
        wildcard storage deletion.
     5. No remote test operation runs without the explicit
        MARINA_RUN_REMOTE_STAGING_TESTS=1 guard.

   The tests inspect the script source and spawn it as a subprocess
   with controlled env vars, asserting on stdout/stderr.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "durable-workflow-remote.test.js");
const SRC = fs.readFileSync(SCRIPT, "utf8");
const PROJECT_REF_FOR_GUARD = "sslgswhhlujryjlrnnfr";


function runScript(env) {
  // Use --no-warnings to keep output clean and isolate to stdout.
  const r = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 15000,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

test("default: dry-run, no remote contact, exit 0", () => {
  const r = runScript({ MARINA_RUN_REMOTE_STAGING_TESTS: "", MARINA_CLEANUP_STAGING_TESTS: "" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
  assert.match(r.stdout, /DRY RUN \(no-op\)/, "should announce DRY RUN");
  assert.match(r.stdout, /no staging resources touched/, "should print dry-run status");
  // Sanity: no remote fixture ids should have been created.
  assert.ok(!/@test\.invalid/.test(r.stdout.split("Phase")[0]),
    "dry-run should not print any created user emails");
});

test("cleanup flag alone does NOT enable remote execution", () => {
  const r = runScript({ MARINA_RUN_REMOTE_STAGING_TESTS: "", MARINA_CLEANUP_STAGING_TESTS: "1" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /DRY RUN \(no-op\)/,
    "cleanup-only flag must still print DRY RUN (cleanup requires run)");
});

test("run flag without cleanup: still dry-run when project guard fails", () => {
  // Force a project-guard failure by setting a wrong URL.
  const r = runScript({
    MARINA_RUN_REMOTE_STAGING_TESTS: "1",
    MARINA_CLEANUP_STAGING_TESTS: "0",
    SUPABASE_URL: "https://wrong-project-ref.supabase.co",
  });
  assert.equal(r.status, 2, "wrong SUPABASE_URL must fail closed with exit 2");
  const combined = r.stdout + "\n" + r.stderr;
  assert.match(combined, /FATAL: SUPABASE_URL does not contain expected project ref/);
  assert.match(combined, /Refusing to contact staging/);
});

test("source: two flags are checked independently", () => {
  // Both flag checks must appear in the script, with explicit !== "1" comparisons.
  // The script binds the env var to RUN_GUARD / CLEANUP_GUARD consts.
  assert.match(SRC, /RUN_GUARD !== "1"/,
    "must check run guard before any network call");
  assert.match(SRC, /CLEANUP_GUARD !== "1"/,
    "must check cleanup guard independently of run guard");
  // The run guard must gate the dry-run early.
  assert.match(SRC, /if \(RUN_GUARD !== "1"\)[\s\S]*?printDryRun\(\)/,
    "RUN_GUARD must gate the run path before any remote request");
  // The raw env vars must be read into the bound consts at the top of the file.
  assert.match(SRC, /const RUN_GUARD = process\.env\.MARINA_RUN_REMOTE_STAGING_TESTS/,
    "must read MARINA_RUN_REMOTE_STAGING_TESTS into RUN_GUARD");
  assert.match(SRC, /const CLEANUP_GUARD = process\.env\.MARINA_CLEANUP_STAGING_TESTS/,
    "must read MARINA_CLEANUP_STAGING_TESTS into CLEANUP_GUARD");
});

test("source: project-ref is hard-coded to the staging ref", () => {
  assert.match(SRC, /PROJECT_REF = "sslgswhhlujryjlrnnfr"/,
    "must use the verified staging project ref");
});

test("source: cleanup uses exact-manifest selectors, no broad deletes", () => {
  // Forbid known-broad patterns: no eq with empty string, no ilike, no wildcard *.
  // Cleanup must reference the recorded manifest fields explicitly.
  for (const required of [
    "manifest.artifactStoragePath",
    "manifest.artifactId",
    "manifest.runId",
    "manifest.draftPlanId",
    "manifest.revisionPlanId",
    "manifest.taskId",
    "manifest.workspaceId",
    "manifest.ownerUserId",
    "manifest.nonMemberUserId",
  ]) {
    assert.ok(SRC.includes(required),
      `cleanup must delete by exact manifest field: ${required}`);
  }
  // No email-prefix or ilike-style patterns.
  assert.ok(!/ilike\(/i.test(SRC), "no ilike-based broad deletes");
  assert.ok(!/like\(['"`]%/i.test(SRC), "no LIKE prefix-based broad deletes");
  assert.ok(!/prefix.*delete|delete.*prefix/i.test(SRC),
    "no 'delete by prefix' pattern in cleanup");
  // No wildcard storage delete (Supabase would accept and delete all).
  assert.ok(!/storage[\s\S]*\.remove\(\[\s*\*\s*\]\)/.test(SRC),
    "storage.remove must never use a wildcard array");
  // Run-specific storage path is built from exact manifest fields.
  assert.match(SRC, /manifest\.workspaceId \+ "\/" \+ manifest\.artifactId \+ "\/plan-brief-v2\.md"/,
    "storage object path must be built from exact manifest fields");
});

test("source: script does not call Supabase directly except for documented bootstrap and cleanup", () => {
  // Find every direct Supabase call (other than .from/.storage which is OK for bootstrap/cleanup).
  // The script is allowed to call:
  //   serviceClient.auth.admin.createUser  (bootstrap)
  //   serviceClient.auth.admin.deleteUser  (cleanup)
  //   serviceClient.rpc('create_workspace')  (bootstrap)
  //   serviceClient.from('workspace_memberships').select  (bootstrap verification)
  //   serviceClient.from(...).delete/.remove  (cleanup)
  //   serviceClient.storage.from('artifacts').download  (verify storage object exists)
  // Anything else (e.g. arbitrary table reads, anonymous client creation for reads) is not allowed.
  const directCalls = SRC.match(/serviceClient\.[a-zA-Z.]+\(/g) || [];
  const allowed = [
    "serviceClient.auth.admin.createUser(",
    "serviceClient.auth.admin.deleteUser(",
    "serviceClient.rpc(",
    "serviceClient.from(",
    "serviceClient.storage.from(",
  ];
  for (const c of directCalls) {
    const ok = allowed.some((p) => c.startsWith(p));
    assert.ok(ok, `disallowed direct Supabase call: ${c}`);
  }
  // No anonymous client for table reads: the script must not construct an anon client
  // other than for signInWithPassword during user bootstrap.
  assert.ok(!/createClient\(SUPABASE_URL[\s\S]*?\)\.[a-z]+\.[a-z]+\(/g.test(SRC.replace(/signInWithPassword/g, "")),
    "no anonymous Supabase reads should bypass the durable routes");
});

test("source: required approval sentence is embedded verbatim", () => {
  // The corrected approval sentence must be present in the dry-run output.
  const expected = "I approve creating two labelled staging-only Auth test users";
  assert.ok(SRC.includes(expected),
    "the corrected approval sentence must be embedded in the dry-run output");
});

test("source: corrected approval sentence matches task spec exactly", () => {
  // The exact full approval sentence required by the task spec must be
  // embedded in the dry-run output. The script builds the sentence from
  // a const APPROVAL_SENTENCE = [...].join(" "), so we extract that
  // array and verify the rendered string equals the task spec exactly.
  // This is a strict equality check that prevents any drift in the
  // approval contract (the only phrase that may authorize a real run).
  const arrayMatch = SRC.match(/const APPROVAL_SENTENCE = (\[[\s\S]*?\]\.join\(" "\));/);
  assert.ok(arrayMatch, "the script must define const APPROVAL_SENTENCE = [...].join(\" \");");
  // Evaluate the array literal in a sandboxed Function to get the rendered string.
  const rendered = new Function("PROJECT_REF", "return (" + arrayMatch[1] + ");")(PROJECT_REF_FOR_GUARD);
  const REQUIRED_SENTENCE =
    "I approve creating two labelled staging-only Auth test users, " +
    "one owner workspace, one task, its test plan version(s) and approval, " +
    "one safe-internal run with its persisted events/audit records, " +
    "and one private artifact plus its exact storage object in project " +
    PROJECT_REF_FOR_GUARD + " for durable-workflow verification. The test may verify " +
    "owner, non-member, and anonymous authorization boundaries and will " +
    "delete only its exact recorded test fixtures and storage object when " +
    "MARINA_CLEANUP_STAGING_TESTS=1 is set.";
  assert.equal(rendered, REQUIRED_SENTENCE,
    "rendered APPROVAL_SENTENCE must match the task spec exactly");
});



test("source: project ref is the exact verified staging ref, not a placeholder", () => {
  // The project ref must be exactly the verified staging ref. Fail closed
  // if anyone changes it to a placeholder, an example, or any other value.
  assert.match(SRC, /PROJECT_REF = "sslgswhhlujryjlrnnfr"/,
    "must use the exact verified staging project ref");
  assert.ok(!/PROJECT_REF = "your-project-ref"/.test(SRC),
    "PROJECT_REF must never be a placeholder");
  assert.ok(!/PROJECT_REF = "TODO/i.test(SRC),
    "PROJECT_REF must never be a TODO placeholder");
});

test("source: no broad-delete patterns anywhere in cleanup", () => {
  // Strong invariants to forbid broad-deletion patterns anywhere in the
  // remote test script source.
  assert.ok(!/ilike\(/i.test(SRC), "no ilike-based broad deletes");
  assert.ok(!/like\(['"`]%/i.test(SRC), "no LIKE prefix-based broad deletes");
  assert.ok(!/like\(['"`]%.*%/i.test(SRC), "no LIKE substring-based broad deletes");
  assert.ok(!/storage[\s\S]{0,200}\.remove\(\[\s*\*\s*\]\)/.test(SRC),
    "storage.remove must never use a wildcard array");
  assert.ok(!/\.delete\(\)\.neq\(/i.test(SRC), "no delete().neq() broad deletes");
  assert.ok(!/\.delete\(\)\.gte\(/i.test(SRC), "no delete().gte() range-based broad deletes");
  assert.ok(!/\.delete\(\)\.lte\(/i.test(SRC), "no delete().lte() range-based broad deletes");
});

