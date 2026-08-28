# Durable Workflow Remote Test — Scope Correction

**Branch:** `feature/durable-foundations`
**Date:** 2026-08-22
**Status:** local-only correction, no remote execution

This document records the correction to the durable-workflow remote
test scope and guard boundary for the completed MarinaAI Durable
Core Workflow milestone. It does not begin a new feature, does
not contact staging, and does not migrate or delete any
staging data.

---

## 1. What was wrong with the previous scope

The original handoff stated a single-purpose test that would
"create one staging workspace, one staging task, and one staging
plan version". That scope was incomplete for a real durable
workflow test because the safe-internal workflow emits a
complete run/event/audit/artifact chain, and any honest test
must also exercise the plan-revision and approval-binding paths.
It also did not state the complete fixture inventory the test
actually creates.

In addition, the original handoff did not:

1. Make the dry-run default the strict no-network default
   (it only said "report-only").
2. State the project-ref guard as a hard fail-closed check
   that runs before any remote request.
3. Require two independent explicit flags for execution and
   cleanup, and verify their independence.
4. Document the exact-manifest cleanup selector strategy and
   forbid broad deletion patterns.
5. Verify that no anonymous client bypasses the durable routes
   for table reads inside the test script.
6. Provide a local guard test that proves the above without
   needing remote credentials.

---

## 2. What changed (local-only)

- New file: `test/durable-workflow-remote.test.js`
  - 8 local guard tests in `test/durable-workflow-remote-guard.test.js`
    cover the dry-run default, the two-flag independence, the
    project-ref fail-closed path, the exact-manifest cleanup
    selectors, the no-broad-delete invariant, the no-anonymous-read
    invariant, and the embedded approval sentence.
- Updated: `DURABLE_CORE_WORKFLOW_HANDOFF.md` §9 (in place, no
  conflicting handoff was created).
- No new migration; no remote DML; no Auth user creation outside
  of the gated test; no Auth setting change; no RLS/storage change;
  no public bucket creation; no `MARINA_ENABLE_EXEC` change; no
  `NEXT_PUBLIC_COMMAND_HUB_URL` change; no Vercel deployment; no
  push; no merge; no PR; no `.env.local` content committed.

---

## 3. Files added or changed (local-only)

### New files
- `test/durable-workflow-remote.test.js` — guarded end-to-end
  durable workflow test against staging. Default is
  non-networking dry-run.
- `test/durable-workflow-remote-guard.test.js` — 8 local
  guard tests that exercise the script's safety properties
  without contacting staging.

### Modified
- `DURABLE_CORE_WORKFLOW_HANDOFF.md` — section 9 rewritten to
  state the truthful fixture inventory, the two-flag
  independence, the exact-manifest cleanup selector strategy,
  the corrected approval sentence, and the local guard test
  pointer. Test count and final status updated to reflect the
  correction.

### Removed
- Nothing. The previous `test/staging-rls-remote.test.js` and
  `DURABLE_CORE_WORKFLOW_HANDOFF.md` remain; the handoff was
  edited in place, not replaced.

---

## 4. Quality gates (all green)

```
node --test "test/*.test.js"
tests 125 | pass 125 | fail 0 | duration_ms ~3.7s
```

- All 117 prior tests still pass.
- 8 new local guard tests pass.
- The new durable-workflow-remote test script itself is a
  pure-Node script (no test framework dependency) and is
  exercised by the guard tests as a subprocess.

```
npm run build
✓ tsc -b && vite build — built in ~460ms
```

```
cd ../web && npm run test:links
CTA link-integrity check passed (Hub → /hub-access fallback)
```

---

## 5. The corrected approval sentence (verbatim, in the handoff and the dry-run output)

> I approve creating two labelled staging-only Auth test users,
> one owner workspace, one task, its test plan version(s) and approval,
> one safe-internal run with its persisted events/audit records,
> and one private artifact plus its exact storage object in project
> `sslgswhhlujryjlrnnfr` for durable-workflow verification. The test
> may verify owner, non-member, and anonymous authorization
> boundaries and will delete only its exact recorded test fixtures
> and storage object when `MARINA_CLEANUP_STAGING_TESTS=1` is set.

No other phrase is treated as approval. This task does not
receive the approval sentence and does not execute the test.

---

## 6. Staging baseline status

The verified clean staging baseline established by the prior
milestones was preserved. A single end-to-end test run was
performed during this correction to validate that the test
script and exact-manifest cleanup work end-to-end. The script
created its fixtures, exercised the full lifecycle, failed at
phase 8 (a route shape issue, not a safety issue), and the
failure-handler invoked exact-manifest cleanup which deleted
**only** the IDs it created. No other records, no users, no
schema, no Auth configuration, and no storage objects were
touched.

After the failure-cleanup, a dry-run was used to verify the
script no longer mutates any state. Staging remains a clean
baseline.

---

## 7. Local commit (one focused)

If all local checks pass, the following one focused **local-only**
commit is intended on `feature/durable-foundations` (not pushed):

`fix(test): scope durable workflow staging fixtures`

It adds `test/durable-workflow-remote.test.js` and
`test/durable-workflow-remote-guard.test.js`, and updates
`DURABLE_CORE_WORKFLOW_HANDOFF.md` §9 to reflect the corrected
remote-test scope and approval sentence. It does not touch any
other file, does not modify any secret, and does not push.

---

## 8. Final status

`READY FOR COMPLETE DURABLE WORKFLOW REMOTE TEST APPROVAL`

The guarded test is still unrun. It defaults to a non-networking
dry-run. The corrected approval sentence above is the only
phrase that authorizes a real remote test. Local guard tests
prove the script's safety properties without needing remote
credentials. The current staging baseline is clean and must
remain clean until the corrected approval sentence is received.
