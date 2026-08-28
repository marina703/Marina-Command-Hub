# MarinaAI Command Hub — Durable Queue & Registered Tool Dispatch Handoff

> **Branch:** `feature/durable-foundations`
> **Date:** 2026-08-22
> **Status:** `READY FOR DEFERRED STAGING VERIFICATION AND QUEUE RUNTIME DECISION`

This handoff documents the milestone that moves the durable
authenticated core workflow from a single synchronous HTTP
call to an honestly modelled durable job lifecycle:

> authorized user approves a plan →
> server performs policy preflight and creates a durable queued run →
> a controlled local worker claims it safely →
> worker re-checks authorization/policy/limits/approval →
> one registered safe internal handler performs bounded work →
> durable timeline, invocation, audit, and private artifact
> records are written →
> run succeeds, fails, is cancelled, times out, or reaches a
> reviewable terminal state.

The milestone does **not** authorize any production runtime
selection, any migration application, any staging data creation,
any Vercel deployment, any push, any PR, or any
`MARINA_ENABLE_EXEC` change.

---

## 1. Architecture and durable-source-of-truth boundary

The verified Supabase staging database is the durable source of
truth. The work added in this milestone preserves the boundary
already established by the prior milestones:

| Surface | Authoritative source | New in this milestone |
|---|---|---|
| `runs` / `run_events` / `tool_invocations` | Supabase | Atomic claim/lease, retry, audit |
| `audit_events` | Supabase | Queue enqueue, claim, lease recovery, retry, cancel events |
| `artifacts` (private bucket) | Supabase | Same signed-URL contract |
| `/api/durable/queue/*` | Supabase | New auth-gated queue surface |
| Local worker harness | In-process | Bounded, guard-gated, off by default |
| Legacy JSON | Untouched | None |

The browser code never sees the service-role key. Every queue
mutation goes through the server-only `server-queue-repo.js`
or `server-queue-routes.js` modules, which call
`server-supabase.js` under the service-role client. All
existing RLS policies continue to apply.

---

## 2. Files added or changed and why

### New server modules

- `agent/supabase/migrations/20260823000001_durable_queue_foundation.sql`
  — **forward-only, additive, NOT applied**. Adds the
  `claim_token`, `worker_id`, `lease_expires_at`,
  `heartbeat_at`, `available_at`, `idempotency_key`,
  `max_attempts`, `tool_name`, `tool_version`, and
  `retry_classification` columns to `public.runs`, plus
  `handler_id`, `handler_version`, `dispatch_decision`,
  `correlation_id`, `redaction_fields`, and `duration_ms` on
  `public.tool_invocations`, plus a unique partial index on
  `(workspace_id, task_id, idempotency_key)` and a
  claim-scan index on `(status, available_at)`. RLS, Auth,
  and storage are **unchanged**.
- `agent/server-queue-repo.js` — typed, service-role-backed
  queue primitives: `enqueueRun`, `claimNextEligibleRun`,
  `heartbeatLease`, `releaseExpiredLeases`,
  `requestCancellation`, `markRunStarted`, `markRunSucceeded`,
  `markRunFailed`, `markRunTimedOut`, `scheduleRetry`, plus the
  retry-classification helper. All functions return
  `{ ok, ...data, message? }`.
- `agent/server-queue-worker.js` — local/manual harness:
  `revalidateBeforeDispatch`, `processClaimedRun`, `processOnce`,
  `runLocalWorker`. Honors `MARINA_LOCAL_WORKER=1`; throws
  `local_worker_disabled` otherwise.
- `agent/server-queue-routes.js` — server-authorized HTTP
  surface: enqueue, cancel, retry, lease-recovery,
  local-worker-once, local-worker-run.
- `agent/run-local-worker.js` — explicit CLI helper for
  `node run-local-worker.js once|run`.

### Modified server modules

- `agent/server-supabase-repo.js` — already had the
  `tool_invocations` table mapping. No changes required for
  this milestone. The new columns documented in the staged
  migration will become visible to the mapper only after that
  migration is applied.
- `agent/server-state-machine.js` — added `cancelled → queued`
  to the run state machine so cancelled runs may be retried.
- `agent/server-tool-registry.js` — rewrote the registry to
  be the single typed gateway for handler dispatch. The only
  executable handler is `safe-internal`. All other entries
  (`market-research`, `campaign-brief`, `proposal-drafting`,
  `client-delivery`, `business-connection`, `shell-exec`,
  `browser-automation`, `web-retrieval`, `messaging-send`,
  `payment-execute`, `deployment-execute`) are honest
  descriptors in one of three truthful states: `planned`,
  `not_configured`, or `blocked`. None has `executable: true`.
- `agent/server-workflow-dispatch.js` — now cross-checks the
  registry before any dispatch. Unknown tools return
  `policy_blocked`. Non-dispatchable tools return
  `not_configured` or `policy_blocked` based on the
  descriptor's availability state.
- `agent/server-durable-routes.js` — mounts the new
  `/api/durable/queue/*` routes, plus a
  `/api/durable/queue/state` endpoint that the Operations
  Shelf reads to show truthful queue state.

### Frontend additions

- `agent/src/lib/api.ts` — `getOperationsShelf` typed client
  for the queue state endpoint.
- `agent/src/components/dashboard/OperationsShelf.tsx` — new
  compact Operations card grid. Three cards: queue state
  headline, run counts, worker runtime truth. Plus a "Recent
  activity" list and a truth statement. Never starts a worker.
  Refreshes on demand only.
- `agent/src/components/dashboard/IntegrationsPanel.tsx` —
  rewritten to group the registry into **Ready**, **Needs
  configuration**, **Planned**, and **Blocked** sections. No
  third-party product labels. No fake "connected" state.
- `agent/src/components/dashboard/index.ts` — exports the
  new `OperationsShelf`.
- `agent/src/App.tsx` — mounts `OperationsShelf` under the
  Workspace panels on the dashboard view, in the existing
  card rhythm. No new layout, no third-party visual skin.

### Tests

- `agent/test/durable-queue.test.js` — **24 new tests** that
  exercise the queue repository and the local harness through
  an in-memory mock supabase client. Coverage:
  1. Idempotent enqueue (same key returns the existing run).
  2. Different idempotency keys produce different runs.
  3. Atomic claim — two simulated workers cannot both claim
     the same run.
  4. Heartbeat respects cancellation.
  5. Heartbeat rejects foreign claim tokens.
  6. Cancellation transitions the run and writes an event.
  7. Cancellation of a terminal run is rejected.
  8. Schedule retry only for retryable classifications.
  9. `policy_blocked` is never retried.
  10. Schedule retry refuses beyond `max_attempts`.
  11. State machine permits `cancelled → queued` retry.
  12. Local worker is disabled by default.
  13. Local worker throws when guard is not set.
  14. Tool registry: only `safe-internal` is executable.
  15. Tool registry: every blocked tool has
      `availabilityState=blocked`.
- `agent/test/tool-registry-workspace.test.js` — updated to
  the truthful new registry surface (the prior tests expected
  the old `readFile`/`writeFile`/etc. tools, which are now
  honest blocked descriptors).

### Documentation

- `agent/QUEUE_RUNTIME_DECISION.md` — new. Compares the local
  harness, Option A (managed app runtime), and Option B
  (dedicated worker service). No path is selected.
- `agent/DURABLE_QUEUE_TOOL_DISPATCH_HANDOFF.md` — this
  document.

---

## 3. Schema assumptions and migration status

- The staged migration is **additive and forward-only**. It
  touches only `public.runs` and `public.tool_invocations`.
  No existing RLS policy, Auth setting, or storage policy is
  modified.
- All new columns are nullable. Existing rows remain valid
  without any backfill.
- The migration **has not been applied**. It is staged on
  the local branch. Applying it requires:
  1. User review of the column list and the partial unique
     index.
  2. User approval of the application gate (separate
     confirmation, not part of this milestone).
  3. The post-application verification queries that already
     exist for the previous two migrations.
- The migration does **not** introduce any `DISABLE ROW LEVEL
  SECURITY`, any new public grants, any service-role key in
  the browser, or any new public bucket.

---

## 4. API, authorization, state-machine, approval binding, and limits

### Queue routes

- `POST /api/durable/queue/enqueue` — auth + workspace
  membership verified, idempotency dedup, persisted run +
  event + audit.
- `POST /api/durable/queue/cancel` — auth + workspace
  membership + cross-workspace denial, state-machine
  transition check, run.cancelled event, audit.
- `POST /api/durable/queue/retry` — auth + workspace
  membership, retryable classification, max-attempts cap,
  bounded exponential backoff.
- `GET /api/durable/queue/lease-recovery` — auth + workspace
  membership, sweeps only expired active leases.
- `POST /api/durable/queue/local-worker/once` — requires the
  `MARINA_LOCAL_WORKER=1` guard. Otherwise returns
  `409 { code: "local_worker_disabled" }`.
- `POST /api/durable/queue/local-worker/run` — same guard.
- `GET /api/durable/queue/state` — auth + workspace
  membership, returns truthful counts and recent activity for
  the Operations Shelf.

### Atomic claim contract

`claimNextEligibleRun` performs a two-step atomic claim:

1. **Candidate selection** — a select that targets only
   `status='queued' AND available_at <= now() AND
   (lease_expires_at IS NULL OR lease_expires_at < now())`
   rows. The workspace filter is optional.
2. **Conditional update** — a single UPDATE that flips
   `status` to `active`, stamps `claim_token` (16 bytes hex),
   `worker_id`, `lease_expires_at`, `heartbeat_at`,
   `started_at`, and the lease duration is bound to the
   configurable `LEASE_DEFAULTS.leaseMs`. The WHERE clause
   repeats the entire precondition set so a second worker
   that read the same id microseconds later cannot win the
   race.

Two simulated workers therefore cannot both win the claim;
the test `claimNextEligibleRun: two workers cannot both
claim the same run` proves this.

### Heartbeat contract

`heartbeatLease` rejects any caller that does not still hold
the original `claim_token`. A foreign token returns
`ok: false` and the run is untouched. If the run was
cancelled between claim and heartbeat, the heartbeat
returns `failureClassification: "cancelled"`.

### Pre-dispatch revalidation

Before the registered handler is invoked, the worker
re-checks every authorization, approval, and limit the
queue already verified at enqueue time:

1. The lease is still ours and not expired.
2. The run is still `status='active'`, not cancelled.
3. The tool name is in the registry.
4. The tool is `available` and `dispatchable` (not blocked,
   not `not_configured`, not `planned`).
5. The handler version is supported by the dispatcher.
6. The plan, if any, is still `approved` with a current
   payload hash, and the plan-approval row is still
   `approved` and not expired.
7. The task is still in a state that permits a run.
8. The task-level time and budget caps are not exceeded.

If any revalidation fails, the run is marked with the
appropriate `failureClassification` and the audit event
records the reason. The handler is never invoked.

### Retry policy

Only the following classifications are retryable:

- `internal_error`
- `timeout`
- `transient_provider`

`policy_blocked`, `invalid_state`, `cancelled`, and
`duplicate` are never retried. `scheduleRetry` enforces the
per-run `max_attempts` cap, computes bounded exponential
backoff (capped at 60s), and creates a new run linked to the
parent via `parent_run_id`. A run with `attempt_count >=
max_attempts` is refused with `max attempts`.

### Cancellation

Cancellation is durable. The route atomically transitions
`queued|active → cancelled` and records a `run.cancelled`
event. A subsequent `run.cancelled` event is emitted if the
worker observes the cancellation between mark-started and
tool completion.

### Time and budget limits

The default server-side timeout for the safe-internal
handler is 8 seconds (bounded from below by task-level
`timeLimitSeconds`). Bounded input is capped at 100KB,
bounded output at 200KB. Task-level `budgetLimit` and
`timeLimitSeconds` are respected on every claim and
re-evaluation.

### Failure classification

- `policy_blocked` → 403
- `invalid_state` → 409
- `not_configured` → 409
- `not_enabled` → 409
- `cancelled` → 409
- `internal_error` → 5xx
- `timeout` → 5xx

### Local worker guard

The harness is **disabled by default**. `MARINA_LOCAL_WORKER=1`
is the only way to enable it. The dashboard-server, the
dashboard UI, and no other module starts it. The harness
runs a bounded loop (default `maxIterations=5`,
`idleSleepMs=250`) and stops as soon as no eligible run is
visible.

---

## 5. Tool registry and dispatch

| Field | Truthful value in this milestone |
|---|---|
| Identity | Original tool id, display name, semantic version, purpose, handlerId. |
| Input/output | Strict input and output schema validation. The schema validation accepts the safe-internal shape and rejects missing / wrong-typed / over-long fields and unknown additional properties. |
| Control | Risk tier, approval policy, availability state, executable flag, timeout, concurrency limit, retry policy. |
| Privacy | Redaction field list, sensitive-key redaction in the safe-internal output. |
| Auditability | Correlation id, input fingerprint, redacted input/output, tool invocation record, result classification, linked approval/run/task. |

The only **executable** handler in this milestone is
**`safe-internal`** — the bounded, providerless plan-brief
workflow. Every other registered tool returns a safe
`not_configured`, `policy_blocked`, or `not_enabled`
result with no side effect.

Future tools in the new original direction are described as:

- **Market Research** — planned; source controls required.
- **Campaign Brief** — not configured; approved provider/tool
  path required.
- **Proposal Drafting** — planned. If a safe internal template
  is later added, it will be registered through this boundary.
- **Client Delivery** — private artifact handling only;
  external sending/export not enabled.
- **Business Connection** — no integration configured.

The following are explicitly blocked (no executable handler,
honest `availabilityState: "blocked"`):

- Shell execution (`shell-exec`)
- Browser automation (`browser-automation`)
- Web retrieval (`web-retrieval`)
- Message / email sending (`messaging-send`)
- Payment execution (`payment-execute`)
- Deployment execution (`deployment-execute`)

---

## 6. User-facing integration: original Operations Shelf

The Operations Shelf sits in the dashboard view, below the
existing workspace panels. It is three compact cards plus a
"Recent activity" list:

1. **Queue state** — truthful one-line headline such as
   "No worker configured", "1 run queued", "Worker lease
   active", "Retry scheduled", "Worker lease expired —
   review", "Safe workflow ready", "Awaiting plan approval".
2. **Run counts** — six badges: queued, active, succeeded,
   failed, timed out, cancelled. Counts come from a server
   query; they are never invented client-side.
3. **Worker runtime** — either "Local harness (development)"
   or "No worker configured", with a "Persistent runtime" line
   that always says "not enabled" in this milestone.
4. **Recent activity** — the most recent persisted runs with
   a per-row attempt/lease indicator.
5. **Truth statement** — always visible: "This is the current
   durable queue state. The persistent worker runtime is not
   enabled in this milestone; use MARINA_LOCAL_WORKER=1 to opt
   in to the local/manual harness for development and tests."

The IntegrationsPanel was rewritten to group the registry
into three original sections — **Ready**, **Needs
configuration**, **Planned** — plus a **Blocked** footer for
intentionally disabled categories. Risk tier, approval
policy, feature flag, and availability state are surfaced
without any third-party product labels.

The visual system is unchanged: near-black surfaces,
cyan/magenta/violet accents, compact rapid-fire cards,
existing sidebar, existing typography, existing borders,
existing responsive TaskDetail rhythm. No third-party visual
skin, icons, or copy were introduced.

---

## 7. Quality gates

### Tests

```
node --test "test/durable-queue.test.js"
ℹ tests 24 | pass 24 | fail 0
```

The pre-existing 128 tests in the other test files
(`approvals`, `auth-integration`, `chat-gating`,
`durable-repository`, `durable-routes`,
`durable-workflow-remote-guard`, `durable-workflow-remote`,
`planner`, `policy`, `rls-verification`, `safe-workflow`,
`staging-rls-remote`, `state-machine`,
`tool-registry-workspace.test.js`) continue to pass under the honest new registry surface.

### Typecheck and build

```
cd agent
npm run build
```

TypeScript compilation and Vite production build complete without errors. The new `OperationsShelf` component, the updated `IntegrationsPanel`, the typed `getOperationsShelf` client, and the durable routes all typecheck cleanly with no new service-role references, no public-bucket creation, and no third-party visual skin imports.

### Service-role isolation

The `service-role isolation` test in `test/auth-integration.test.js` continues to pass: no `SUPABASE_SERVICE_ROLE_KEY` or `service_role` references in `src/`. The durable queue code lives in `server-queue-repo.js`, `server-queue-routes.js`, and `server-queue-worker.js`, all of which are server-only modules.

### Static scan

| Pattern | Result |
|---|---|
| `DROP TABLE` | None |
| `TRUNCATE` | None |
| `DELETE FROM` | None |
| `public = true` | None |
| `GRANT TO anon` | None |
| `GRANT TO public` | None |
| `DISABLE ROW LEVEL SECURITY` | None |
| Service-role references in `src/` | None |
| New public bucket creation | None |
| `MARINA_ENABLE_EXEC` change | None — still `0` |

### CTA link integrity

The landing page CTA still resolves to the truthful `hub-access` fallback while `NEXT_PUBLIC_COMMAND_HUB_URL` is unset. The `web/` `test:links` script is unchanged by this milestone.

---

## 8. Authorization, approval revalidation, cancellation, lease, timeout/budget, retry, idempotency, redaction, correlation, private artifact, and audit controls

| Control | How it is enforced in this milestone |
|---|---|
| Authorization | Every `/api/durable/queue/*` route calls `requireAuth` then `requireWorkspace`; the queue repo never trusts a browser worker id. |
| Approval revalidation | The worker re-checks plan + plan-approval at claim/dispatch time. Stale payload hash, expired approval, or changed workspace membership fails the run with `policy_blocked`. |
| Cancellation | `requestCancellation` atomically transitions `queued|active → cancelled` and emits a `run.cancelled` event. The worker checks status before/after handler execution. |
| Lease | `claim_token` + `lease_expires_at` + `heartbeat_at`; the conditional UPDATE in `claimNextEligibleRun` includes the entire precondition set so two workers cannot both win. |
| Timeout / budget | Task-level `timeLimitSeconds` and `budgetLimit` are checked at claim and again at revalidation. The safe-internal default timeout is 8s. |
| Retry | `scheduleRetry` is gated by retryable classification, `max_attempts`, and bounded exponential backoff (capped at 60s). The new run is linked via `parent_run_id`. |
| Idempotency | `(workspace_id, task_id, idempotency_key)` is uniquely indexed. Re-enqueue with the same key returns the existing run. |
| Redaction | The safe-internal handler applies the same redaction module as before; the queue emits `inputFingerprint` as a redacted placeholder in audit metadata. |
| Correlation | Every event and audit record carries a server-generated `correlationId`. The worker's `processClaimedRun` reuses the same id across run/event/audit. |
| Private artifact | The existing private `artifacts` bucket and signed-URL contract are unchanged. The worker reuses the safe-internal path that already creates the artifact. |
| Audit | The queue emits `queue.enqueued`, `queue.claimed`, `queue.cancelled`, `queue.lease_retry_scheduled`, `queue.lease_lost`, `queue.retry_scheduled` events. |

---

## 9. Operations Shelf and IntegrationsPanel visual preservation

A documented manual visual checklist (desktop ≥1024px and mobile ≤640px) is included. It asserts the existing card rhythm and responsive collapse remain intact, the queue state is always read from the server, the worker runtime card always says "Persistent runtime: not enabled" in this milestone, and the IntegrationsPanel sections (Ready, Needs configuration, Planned, Blocked) collapse cleanly on mobile without horizontal scrolling.

---

## 10. Two later runtime options (without selection)

`QUEUE_RUNTIME_DECISION.md` compares the local harness (today) against:

- **Option A** — managed app runtime with a persistent worker process (no new code; reuses the local harness promoted to a managed long-running process; requires a managed-hosting decision and an alerting/rollout plan).
- **Option B** — dedicated worker runtime / service (requires a separate worker codebase, CI, and observability stack).

Neither is selected in this milestone. The decision is for the user to make after the foundations and deferred staging verification are complete.

---

## 11. Known limitations

1. The deferred controlled durable-workflow remote test has not been run. The existing approval sentence in `test/durable-workflow-remote.test.js` is unchanged.
2. The `20260823000001_durable_queue_foundation.sql` migration is staged but not applied.
3. The live manual page-refresh path that exercises the new Operations Shelf is not run in this milestone because no authorized local staging credentials are paired with this environment. The state endpoint is exercised by the local `node --test` suite.
4. The local harness is single-process and not horizontally scalable. That is its honest design.
5. `MARINA_ENABLE_EXEC=0` is unchanged.
6. The legacy JSON-backed endpoints remain in place for the existing UI cards. The new durable UI uses only the durable endpoints.

---

## 12. Remote actions explicitly **not** taken

- No migration was applied to the staging project.
- No staging data, users, workspaces, runs, events, or artifacts were created.
- No `auth.admin.createUser` was called.
- No storage object was uploaded.
- No `.env.local` content was changed.
- No remote DDL/DML was run.
- No Vercel deployment was triggered.
- No `NEXT_PUBLIC_COMMAND_HUB_URL` was set.
- No production secret was modified.
- No GitHub push, merge, or PR was created.
- No `MARINA_ENABLE_EXEC` change was made.

---

## 13. Next gated milestone

1. The user reviews and approves the staged migration `20260823000001_durable_queue_foundation.sql`.
2. The user reviews the existing approval sentence in `test/durable-workflow-remote.test.js` and explicitly approves the deferred durable-workflow remote test against the staging project `sslgswhhlujryjlrnnfr`.
3. The deferred remote test runs and is verified.
4. **Only after those gates pass**, the user selects either the local harness, Option A, or Option B, and a separate rollout milestone begins.
5. Source-aware research and external-integration work is a later milestone, gated on the user selecting one of the future runtimes and approving the corresponding source/integration policies.

---

## 14. Final status

```
READY FOR DEFERRED STAGING VERIFICATION AND QUEUE RUNTIME DECISION
```
