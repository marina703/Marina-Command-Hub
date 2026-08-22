# MarinaAI Command Hub — Implementation Sequence

Companion to `FEATURE_GAP_REGISTER.md` (gap #refs below point there). Ordering principle: **durable foundations → core loop hardening → controlled expansion → advanced gated capabilities**. Public multi-user access and powerful external tools come only after auth/storage and the queue layer are reliable. Every stage preserves the existing visual system (near-black surfaces, rapid-fire card grid, Panel/Button primitives).

## Stage 0 — Release hygiene (no new capability; do first)

| Step | Gap ref | Why first | Release gate |
|---|---|---|---|
| 0.1 Administrator service restart | — | Loads already-validated code into the local service | `/api/system/state` returns JSON with `effectivePermissions`; all high-risk flags `false` |
| 0.2 Timestamped state backups + retention pruner | #22 | Protects every collection built so far; trivial cost | Backup/restore round-trip test passes; pruner removes items older than policy |
| 0.3 Enforce state machine at API boundary | #5 | Rules exist and are tested; wiring them now prevents legacy free-form statuses from calcifying | Invalid status via API → readable error + audit event; existing 23 tests stay green |

## Stage 1 — Durable foundations (before ANY multi-user or external tool work)

| Step | Gap ref | Depends on | Work | Release gate |
|---|---|---|---|---|
| 1.1 Storage adapter | #1 | — | `server/store.js`: typed collections (tasks/plans/runs/runEvents/approvals/artifacts/sources/audit) over SQLite/Postgres/Supabase; JSON file becomes a dev fallback adapter; migrate existing data | Migration lossless (fixture diff); all existing tests green against both adapters |
| 1.2 Auth + workspaces + roles | #1 | 1.1 | Supabase Auth (client scaffold exists) or equivalent; User/Workspace/WorkspaceMembership; server-side scope check helper applied to EVERY endpoint; approver identity recorded | Unauthenticated → 401; cross-workspace ID guessing denied (test suite); roles enforced server-side |
| 1.3 Correlation IDs + structured logs | #14 | 1.1 | Request-ID middleware; JSON-line request logs; audit events carry correlationId | One user action → all its audit/log lines share one correlationId |
| 1.4 Hosted provider configuration | #6 | — | Vercel env vars for provider keys; health endpoint reflects hosted availability; keep Ollama default locally | `/api/health` truthful in both environments; no secret in any response |

**Stage gate:** two-workspace isolation test suite passes end-to-end; no endpoint reads/writes without an authorization check.

## Stage 2 — Core task loop hardening (the product promise, completed)

| Step | Gap ref | Depends on | Work | Release gate |
|---|---|---|---|---|
| 2.1 New Task composer + task detail | #2 | Stage 1 | Compact composer in existing card rhythm (project/outcome/instructions/context/priority/caps); server validation; audit-on-create; detail view with three-region layout on desktop | Composer e2e: create→validate→audit→navigate; invalid input rejected client+server |
| 2.2 Schema-validated plan generation | #3 | 2.1 | Planner interface over provider adapter; strict JSON schema (summary/assumptions/steps/deps/risk/approval flags); deterministic dev planner for tests; honest not-configured state | Malformed provider output rejected by schema test; not-configured returns explicit state |
| 2.3 Plan versioning + review UI | #4 | 2.2 | Persist versions; edit→new draft; request-revision keeps history; approve records actor/time; approve gates queued execution | Version immutability test; revision chain test; approval recorded |
| 2.4 Run events timeline | #8 | 2.1 | runEvents collection (seq, type, redacted summary); polling endpoint; timeline panel in task detail | Ordered-events test; redaction-in-stream test |
| 2.5 Job queue + worker | #7 | 1.1 | jobs table + in-process worker loop (durable-ready); bounded outputs; usage accounting where provider reports it | Jobs survive restart (test with kill mid-run); output size caps enforced |
| 2.6 Cancellation + retry runtime | #9 | 2.5 | Cancellation token checked between steps; retry creates linked attempt only for failed/timed_out; denials never auto-retried | Mid-run cancel integration test; retry-linkage test |
| 2.7 Tool registry | #15 | 2.5 | Registry module (schema/risk/limits/flags per tool); migrate playbooks + system actions onto it; unknown IDs rejected | Registry schema tests; per-tool concurrency limit test |

**Stage gate:** full journey e2e — create task → generate plan → review/edit version → approve → run with live timeline → cancel/retry → artifact produced; all under auth with audit trail.

## Stage 3 — Controlled expansion

| Step | Gap ref | Depends on | Work | Release gate |
|---|---|---|---|---|
| 3.1 Artifacts + provenance | #10 | 2.5 | Register artifacts at creation (hash/size/type/state/lineage); Artifacts view listing real files; authorized download only | Hash-integrity test; cross-workspace download denied |
| 3.2 Sources / research fetcher | #11 | 2.7 | Allowlisted-host fetch tool → Source records (URL/time/excerpt/trust label); fetched content treated as data | Non-allowlisted host rejected; content never reaches executor paths |
| 3.3 Integrations + encrypted secrets | #16 | 1.1 | Connection entities (provider/scopes/state/last-used/revoke); credentials moved out of plaintext config.json behind server-only accessor; Integrations view | Secret-nonexposure tests (API/logs/client bundle); revoke stops usage immediately |
| 3.4 Mobile / accessibility pass | #21 | — | Mobile drawer nav; prefers-reduced-motion; 320px overflow audit; keyboard-nav tests | No horizontal scroll at 320px; reduced-motion honored; keyboard-only walkthrough passes |

**Stage gate:** research produces cited sources attached to runs; artifacts downloadable only within workspace; secrets invisible outside server process.

## Stage 4 — Advanced capabilities (explicitly gated)

| Step | Gap ref | Depends on | Work | Release gate |
|---|---|---|---|---|
| 4.1 Durable automations | #17 | 2.5, 1.1 | Automation entities + scheduler reading due jobs from store; idempotency keys; bounded retries; failing→review state; pause/resume; per-workspace concurrency | Schedule survives restart; missed-run catch-up idempotent; concurrent-run cap enforced |
| 4.2 Isolated code/browser runners | #18 | 2.7, 3.3 | **Requires infrastructure decision** (container runner vs remain disabled). If built: containerized execution, egress policy, JIT approval for sensitive web actions, feature-flag default-off | No execution outside isolation boundary; approval required for sensitive actions; flag off by default |
| 4.3 Multi-agent orchestration | #19 | 4.1, 4.2 | Planner→executor→reviewer chains with evaluation gates; per-step approvals inherited | Eval gate can reject before completion; each step auditable |

## Top three next implementation tasks (recommended order)

1. **Durable storage + auth/workspaces/roles (Steps 1.1–1.2).**
   Why first: every remaining capability (plans, runs, artifacts, automations, multi-user) needs persistent typed storage and a real authorization boundary; the current single JSON file cannot support tenants, durability, or concurrent access. It also converts today's single-operator trust model into enforceable server-side checks.
   **Release gate:** lossless data migration fixture; cross-workspace denial test suite passes; all 23 existing tests green against the new store; unauthenticated requests rejected with 401.

2. **Core task-loop completion: composer → schema-validated plans → versioning/review → run timeline (Steps 2.1–2.4).**
   Why second: this completes the product promise ("give an outcome, inspect/edit the plan, receive traceable results") on top of the new foundation, using the already-proven policy/approval layer. It is user-visible value with no external-tool risk.
   **Release gate:** end-to-end lifecycle test (create→plan v1→edit→v2→approve→run→timeline→artifact); malformed provider output rejected by schema; prior plan versions immutable; every transition emits audit with correlation ID.

3. **Durable job queue with cancellation/retry + tool registry (Steps 2.5–2.7).**
   Why third: it removes the synchronous-HTTP execution ceiling (Vercel 60s), makes cancellation real rather than theoretical, and gives every future tool (research, integrations, automation, runners) a single registered, policy-checked dispatch path. Powerful external tools must wait until this exists.
   **Release gate:** job survives process restart mid-run; cancel honored between steps with event recorded; retry links attempts only for failed/timed_out; unregistered tool IDs rejected; registry-declared limits enforced.