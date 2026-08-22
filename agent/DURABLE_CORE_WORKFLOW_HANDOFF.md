# MarinaAI Command Hub — Durable Core Workflow Handoff

**Branch:** `feature/durable-foundations`
**Date:** 2026-08-22
**Milestone:** Durable Core Workflow
**Status:** `READY FOR DURABLE WORKFLOW REMOTE TEST APPROVAL`

This handoff documents the milestone that makes the verified Supabase
staging database the authoritative persistence layer for the
authenticated core workflow.

---

## 1. Architecture and durable-source-of-truth boundary

The verified Supabase staging database is now the durable source of
truth for the authenticated core workflow. The legacy `dashboard-state.js`
JSON file is intentionally retained only for legacy read paths that are
not in the scope of this milestone (e.g. `getDashboardState`, the
`/api/dashboard` aggregate, the dashboard-side `/api/approvals` queue
for high/critical model instructions, and the existing `/api/tasks`,
`/api/plans`, `/api/runs`, `/api/artifacts` endpoints that back the
existing UI cards). No new authenticated workflow write goes to JSON,
and no authenticated workflow read falls back to JSON when Supabase is
unavailable — instead the durable routes return a truthful
`{ ok: false, code: "not_configured" }` so the UI can show the
configuration-required state.

**Boundary at a glance:**

| Surface | Authoritative source | Status |
|---|---|---|
| `GET /api/dashboard` aggregate | JSON (legacy) | Unchanged |
| `/api/tasks` `POST/GET` (legacy) | JSON | Unchanged |
| `/api/plans*`, `/api/runs*`, `/api/artifacts*` (legacy) | JSON | Unchanged |
| `GET /api/workspaces` (auth required) | Supabase | Existing |
| `GET /api/auth/session` | Supabase session | Existing |
| `GET /api/auth/status` | Browser-safe status | Existing |
| `/api/durable/tasks*` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/plans*` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/runs*` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/artifacts*` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/approvals*` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/audit` | **Supabase** (new, authoritative) | This milestone |
| `/api/durable/workflows` | Public read-only metadata | This milestone |

The browser code never sees the service-role key. All durable
requests are authorized server-side using the bearer token derived
from the Supabase Auth JWT, and the workspace is verified against
`workspace_memberships` via the server-only `private.has_workspace_role`
RLS helper.

---

## 2. Files added or changed and why

### New modules
- `server-supabase-repo.js` — typed, workspace-scoped repository
  functions for every persisted domain record (task, plan, plan step,
  run, run event, approval, artifact, audit event, storage). All
  functions return `{ ok, ...data, message? }`.
- `server-planner.js` — deterministic local planner. Produces a
  strictly-validated structured plan draft. The output is identified
  as `deterministic-local-planner` and never claims to be a real
  model or a configured provider.
- `server-safe-workflow.js` — one bounded execution path named
  `safe-internal` (label: "Safe workflow preview"). Deterministic,
  side-effect-free outside the MarinaAI database and private artifact
  bucket. Creates run + ordered events + private artifact + audit
  event. Enforces state-machine transitions, plan-approval binding
  (workspace + task + plan version + payload hash), idempotent
  duplicate-run protection, time/budget limits, and bounded output
  size (200KB).
- `server-workflow-dispatch.js` — narrow documented dispatcher
  interface. Only `safe-internal` is wired in this milestone; any
  other id returns `policy_blocked` or `not_configured`.
- `server-durable-routes.js` — server-authorized HTTP routes for
  `/api/durable/*`. Every route:
  1. validates the bearer token server-side,
  2. verifies workspace membership,
  3. scopes every query to the verified workspace,
  4. returns sanitized errors (no IDs, no raw SQL, no stack traces).
- `src/lib/durable-api.ts` — typed browser client for `/api/durable/*`.
  Attaches the bearer token automatically. Never includes the
  service-role key.

### Modified
- `server-supabase.js` — extended to a complete typed CRUD surface
  that delegates to `server-supabase-repo.js`. All existing exports
  preserved for backward compatibility.
- `dashboard-server.js` — mounted the `/api/durable/*` dispatcher at
  the top of `handleRequest`. The legacy JSON-backed endpoints are
  untouched.
- `package.json` / build — no dependency changes; the build still
  passes (`tsc -b && vite build`).

### Tests
- `test/planner.test.js` — planner identity, determinism, low-risk
  outputs, fail-closed missing input.
- `test/safe-workflow.test.js` — 14 tests covering approval
  validation matrix, run+events+artifact creation chain, failure
  classification, duplicate active run, invalid task transition, and
  dispatcher policy gates.
- `test/durable-repository.test.js` — repository surface
  completeness and the truthful "not_configured" failure mode.
- `test/durable-routes.test.js` — bearer enforcement, not_configured
  guard, workflow registry metadata, plan versioning, and the
  no-public-URL artifact contract.

### Documentation
- `DURABLE_CORE_WORKFLOW_HANDOFF.md` — this document.

No new local migration was created. The verified
`20260821000001_core_schema.sql` and `20260822000001_security_hardening.sql`
already cover every domain table the durable layer touches.

---

## 3. Schema assumptions and migration status

- No new local migration was created or applied.
- The schema used by the durable layer is exactly the verified
  `public.tasks`, `public.plans`, `public.plan_steps`, `public.runs`,
  `public.run_events`, `public.approval_requests`, `public.artifacts`,
  `public.audit_events`, plus `storage.objects` in the private
  `artifacts` bucket.
- Every domain table uses RLS with the `private.has_workspace_role`
  helper. The durable repository scopes every query with
  `eq("workspace_id", workspaceId)`; RLS is the final authority.
- The `artifacts` bucket is private; the durable artifact endpoint
  only emits short-lived signed URLs.
- Workspace creation is exposed through the existing server-only
  `createWorkspaceForAuthenticatedUser` seam; no new migration
  touches the schema, the `private` schema grants, the storage
  RLS policies, or the Auth provider settings.

**Confirmed:** no remote migration, DML, fixture, Auth user, or
configuration change was applied during this milestone.

---

## 4. API, authorization, state-machine, approval binding, and limits

### Authentication and authorization
- Every `/api/durable/*` route (except the unauthenticated
  `/api/durable/workflows` metadata endpoint) calls
  `requireAuth` then `requireWorkspace` server-side. The bearer
  token is verified via `supabase.auth.getUser(token)`. Workspace
  membership is verified via `workspace_memberships`. The user
  identity and workspace are derived server-side; the browser
  cannot supply them as authority.
- A missing or invalid token returns 401. A non-member attempting
  to access another workspace's records returns 403. A missing
  Supabase configuration returns 503 with `code: "not_configured"`.
- Cross-workspace reads/writes are rejected even when the record
  ID is known (the routes verify `result.workspaceId === workspaceId`
  before returning the record).

### State machine
- `server-state-machine.js` remains the single transition authority.
  Task, plan, run, approval, and artifact transitions are all
  validated through `assertTransition`. Invalid transitions return
  HTTP 409 with `code: "invalid_transition"`.

### Plan version immutability
- Approved and superseded plan versions are never overwritten.
  When a new plan is approved, the durable repository automatically
  marks any prior approved plan for the same task as `superseded`.
- Revisions are created as a **new version** with a fresh
  `payloadHash`. The previous plan's approval is invalidated by
  the hash mismatch, and a new pending approval is created for
  the new version.
- Plan approval is bound to `(workspace, task, plan, planVersion,
  payloadHash)`. The server re-evaluates the binding at every
  decision and at run start. A changed payload, a cross-workspace
  approval, an expired approval, or a cancelled/rejected approval
  cannot authorize a run.

### Run, event, and artifact persistence
- `runs` and `run_events` are appended in the durable database.
  Events have a monotonically-increasing `sequence` per run.
- A successful safe workflow emits at minimum the events
  `run.queued`, `run.started`, `artifact.ready`, `run.succeeded`.
  Cancellation emits `run.cancelled`. Failures emit `run.failed` or
  `run.timed_out`.
- The artifact record carries provenance including `workflow`,
  `provider`, `planId`, `planVersion`, `planPayloadHash`, `taskId`,
  `runId`, and `correlationId`. The content hash is `sha256` of
  the produced Markdown.
- The artifact content is uploaded to the private `artifacts`
  bucket under `{workspace_id}/{artifact_id}/{filename}`. The
  public URL is never created; the only consumer endpoint is
  `/api/durable/artifacts/download-url` which returns a short-lived
  signed URL bound to the verified workspace.

### Correlation IDs and idempotency
- Every workflow mutation generates a server-side `correlationId`
  (8-byte hex). It is included in run events, audit events, and
  the API response.
- Inbound correlation IDs are not honored as authority; the
  server always generates its own. Outbound correlation IDs are
  safe to surface in the UI for traceability.

### Cancellation and retry
- `POST /api/durable/runs/cancel` enforces the state-machine
  transition `active|queued → cancelled`, marks the run, and
  records a `run.cancelled` event.
- `POST /api/durable/runs/retry` re-enters the safe workflow with
  the original task/plan/approval. It is only allowed when the
  prior run is `failed`, `timed_out`, or `cancelled`.

### Time and budget limits
- Default server-side timeout: 8 seconds. Task-level time limit
  (`time_limit_seconds`) caps the per-run budget. Task-level
  budget cap (`budget_limit`) is reserved for future costed
  workflows; the safe workflow records `0` for the safe-internal
  path because there is no external cost.
- Output is capped at 200KB. Bounded input is capped at 100KB.

### Failure classification
- The workflow returns a `failureClassification` from the bounded
  set: `policy_blocked`, `invalid_state`, `duplicate`,
  `internal_error`, `timeout`, `cancelled`. The HTTP status is
  derived from the classification (`403` for `policy_blocked`,
  `409` for invalid state / duplicate, `5xx` for the rest).

---

## 5. Safe internal workflow vs. deferred execution

The only execution path wired in this milestone is the bounded
**Safe workflow preview** (`safe-internal`). It:

- accepts only approved plan records;
- generates a deterministic Markdown plan brief (no LLM, no
  network, no provider);
- writes the artifact to the private `artifacts` bucket;
- is invoked through the documented `dispatch(workflowId, ctx)` seam
  in `server-workflow-dispatch.js`.

**Not wired (and not implied):** shell execution, browser automation,
web retrieval, model inference, message sending, deployment, payments,
third-party uploads, persistent worker / queue / scheduler / cron
/ multi-agent / event-driven background service. The dispatcher
rejects any unknown workflow id with `policy_blocked`.

`MARINA_ENABLE_EXEC` remains `0` and is not modified.

---

## 6. Test, typecheck, build, and CTA-link results

### Tests
```
node --test "test/*.test.js"
tests 116 | pass 116 | fail 0 | duration_ms ~7.2s
```
The 116 tests cover the state machine, approvals, RLS workspace
authorization, durable repository surface, planner determinism, safe
workflow approval validation, run/event/artifact chain, failure
classification, durable HTTP routes, and the existing RLS / Auth /
migration / CTA tests.

### Typecheck and build
```
npm run build
✓ tsc -b && vite build — built in ~470ms
```
The `src/lib/durable-api.ts` client compiles cleanly with no new
service-role references, no `application/x-executable` or `text/html`
MIME additions, and no public bucket creation.

### CTA link integrity
```
cd ../web && npm run test:links
CTA link-integrity check passed (Hub → /hub-access fallback)
```
The landing page CTA still resolves to the truthful `/hub-access`
fallback while `NEXT_PUBLIC_COMMAND_HUB_URL` is unset.

### Service-role isolation
The `service-role isolation` test in `test/auth-integration.test.js`
continues to pass: no `SUPABASE_SERVICE_ROLE_KEY` or `service_role`
references in `src/`.

---

## 7. Local verification results and known configuration limits

A live, manual authenticated click-through was not performed because
no pre-existing local staging credentials paired with a previously
authorized non-test account are confirmed available in this
environment. The "Supabase configured" gate is verified by:

- the `getSupabaseStatus()` reporting `configured: true` when
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present;
- the routes returning `code: "not_configured"` with HTTP 503 when
  the env vars are absent;
- the durable repository returning `{ ok: false, message: "Supabase
  not configured" }` for every CRUD function.

Without live local credentials the manual page-refresh path is
**blocked** but verifiable through:

- a dry-run of `/api/durable/workflows` (returns the public
  metadata for `safe-internal`),
- the state-machine tests exercising every valid/invalid task,
  plan, and run transition,
- the safe-workflow tests proving the run/event/artifact chain
  is persisted with stable sequence numbers and provenance,
- the durable-repository tests proving every CRUD function returns
  the truthful not_configured state.

The configuration limit is documented as: the safe workflow and
the durable UI only become end-to-end exercisable after the
`.env.local` is populated with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` for a workspace in which the signed-in
user already has membership.

---

## 8. Visual-preservation checklist

- No visual system changes were introduced. The card grid, dark
  surface, cyan/magenta accents, compact card rhythm, sidebar,
  three-region TaskDetail, and responsive single-column flow on
  small screens are unchanged.
- The only purposeful addition inside existing UI shapes is a
  compact "Workflow: safe-internal" badge and a one-line provider
  note that the durable plan was generated by the
  `deterministic-local-planner`. These appear in the plan
  `CardHeader` area and do not change layout, density, or theme.
- The landing page, the `/hub-access` fallback, the
  `NEXT_PUBLIC_COMMAND_HUB_URL` behavior, and the public marketing
  layout are unchanged.

---

## 9. Remote staging test scope and the confirmation sentence

A guarded remote test plan is described but **not run** by this
milestone. It targets the staging project
`sslgswhhlujryjlrnnfr` only.

**Default behavior:** read-only dry-run. The script `node
test/staging-rls-remote.test.js` with `MARINA_RUN_REMOTE_STAGING_TESTS=0`
(or unset) only prints the planned phases and exits 0.

**Exact confirmation sentence required before any staging fixture
is created:**

> I approve creating one staging workspace via the server-only
> `createWorkspaceForAuthenticatedUser` seam, one staging task, and
> one staging plan version in project `sslgswhhlujryjlrnnfr` for
> durable-workflow verification, with cleanup on test exit
> (MARINA_CLEANUP_STAGING_TESTS=1).

If the user provides that sentence and sets
`MARINA_RUN_REMOTE_STAGING_TESTS=1`, the test will:
1. Verify `SUPABASE_URL` contains the expected project ref.
2. Create a workspace via the server-only bootstrap.
3. Create a task, generate a durable plan, approve it, and start a
   safe workflow run with a captured correlation id.
4. Verify the timeline events, the private artifact, and the
   workspace scoping.
5. Clean up all created records (and the workspace) on exit.

**Do not run it now.**

---

## 10. Known limitations and next milestone

### Known limitations
- The legacy JSON `/api/tasks`, `/api/plans`, `/api/runs`,
  `/api/artifacts`, `/api/approvals`, and `/api/audit` endpoints
  remain in place for the existing UI cards. The new durable
  routes coexist with them; the durable UI uses only the durable
  endpoints.
- The legacy owner-mapping and ideas/AI-summary destination gaps
  remain deliberately blocked per the security handoff.
- The legacy "Plan v1 awaiting review" / "Plan approved" cards in
  TaskDetail read from JSON; the new durable UI shows a
  configuration-required state when Supabase is not configured
  and reads from the durable database when it is.
- `safe-internal` is synchronous and bounded; there is no
  persistent worker, no queue, no scheduler, and no event-driven
  background service.

### Next milestone
- **Durable queue/worker + registered tool dispatch**, with
  execution and external actions still approval-gated.
- Replace the synchronous safe workflow with a durable worker
  that polls a `run_queue` table and respects the existing approval
  binding. The dispatcher interface (`server-workflow-dispatch.js`)
  is intentionally narrow so the replacement is a small
  change at the call site.
- Add a registered-tool registry and a per-tool approval policy
  so high/critical external actions (model calls, payments,
  deployments, third-party uploads) remain approval-gated and
  never execute without a current, valid approval.
- Add durable cron + automations (`public.automations`) once the
  queue semantics exist.
- Migrate the remaining legacy JSON-backed UI cards (TaskDetail
  plans/runs/artifacts, dashboard cards) to the durable endpoints
  with the same visual system. The `useWorkspace()` hook,
  `useAuth()` hook, and the typed `durable-api.ts` client are
  already in place to support this migration.
