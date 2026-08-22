# MarinaAI Command Hub — Queue Runtime Decision

> **Status:** plan only. No production runtime is selected or activated.
> **Branch:** `feature/durable-foundations`
> **Date:** 2026-08-22

This document is a planning artifact. It explains why the
local/manual harness shipped in this milestone is **not** a
durable production worker, and it presents the two viable later
runtime paths the user can select **after** the foundations and
deferred staging verification are complete.

It does **not** select or activate a production path. The
decision is for the user to make once the gated prerequisites
have passed.

---

## 1. Why the local harness is not a durable production worker

The `server-queue-worker.js` module shipped in this milestone is
intentionally a **local/manual development harness**. Its
properties are:

- It is **disabled by default**. The only way to enable it is to
  set the explicit local environment guard
  `MARINA_LOCAL_WORKER=1`. The dashboard-server does not start
  it, the dashboard UI does not start it, and no scheduler, cron,
  daemon, container, or background process starts it.
- It is **bounded**. `runLocalWorker` takes a `maxIterations`
  argument (hard cap 1000) and stops as soon as it observes
  `claimed: false`. The harness cannot become an always-on
  runtime by accident.
- It runs in a **single Node.js process**. It does not scale, it
  does not survive process restart, and it does not coordinate
  with peer workers.
- It runs **only the registered safe-internal handler** in this
  milestone. Shell, browser, web retrieval, messaging, payments,
  deployments, and external uploads are intentionally blocked.
- It is **not started by app boot**, not started by a page
  refresh, and not started by a browser tab. It is invoked
  explicitly by the local `node run-local-worker.js` helper or
  by the local-worker API routes under `/api/durable/queue/local-worker/*`.
- The `MARINA_ENABLE_EXEC=0` guard is **unchanged** in this
  milestone. No high/critical external action can dispatch.

In short: the local harness is a truthful way for a developer
or test to exercise the durable queue semantics on a single
machine, with no hidden background processes.

It is **not** suitable for:

- a private beta that needs work to continue without an open
  page or local Windows service,
- public hosting where an unattended queue must run reliably,
- scheduled automation that must fire on a wall-clock,
- multi-tenant workloads that need per-workspace isolation
  enforced by a host runtime, or
- any path that requires horizontal scale-out of the worker.

---

## 2. Lighter immediate option: keep the local harness

The local harness is already sufficient for development,
manual QA, and the deferred durable-workflow remote test
(once approved). If the user does not yet need a persistent
runtime, no new decision is required.

This option:

- Requires no new infrastructure.
- Keeps `MARINA_ENABLE_EXEC=0` unchanged.
- Lets every state transition be observed and re-attempted by
  hand, which is the right posture for an early foundations
  milestone.
- Cannot satisfy private beta, public hosting, unattended queue
  processing, or scheduled automation.

---

## 3. Later option A — Managed app runtime with a persistent worker process

| Concern | Detail |
|---|---|
| Suitable use | A production or private-beta Command Hub that needs queued work to continue without a browser or local Windows service. |
| Hosting shape | The existing dashboard-server is deployed to a managed Node.js host (or a private container platform) and runs a single persistent worker process alongside it. The worker is the same local harness promoted from a manual harness to a managed long-running process, with the same `MARINA_LOCAL_WORKER=1` guard. |
| Operations | Health checks, structured logs, deployment, secret management, controlled rollout. The host platform is responsible for restart on crash. |
| Trade-offs | Adds a managed-hosting decision. Single worker is the simplest shape, but it cannot horizontally scale without further work. The host platform must enforce log redaction and secret hygiene. |
| Cost / setup | Hosting fee + per-environment provisioning + secret setup. No new code outside the existing harness. |
| What this milestone would still need | A controlled rollout plan, an alerting story, a secret-rotation policy, and an explicit user sign-off. **None of this is done in this milestone.** |

---

## 4. Later option B — Dedicated worker runtime / service

| Concern | Detail |
|---|---|
| Suitable use | Workloads that eventually need isolated heavier tools, custom runtimes (e.g. Python or containerized tool providers), stronger worker separation, or horizontal scale-out. |
| Hosting shape | A separate worker service (or Kubernetes job runner) distinct from the dashboard web tier. The dashboard would enqueue work over the durable database; the worker service would consume it. |
| Operations | Independent scaling, independent deployment, container images, sidecar tooling, network policy, secret isolation. |
| Trade-offs | More operational surface, more security surface, more coordination. The web tier and worker tier must agree on schema, claim semantics, and redaction policy. |
| Cost / setup | Worker service infra + per-environment provisioning + secret setup + image CI + observability. Larger than Option A. |
| What this milestone would still need | A separate worker codebase (or a packaging change to the existing harness), a CI pipeline, an observability story, an explicit user sign-off, and a runbook. **None of this is done in this milestone.** |

---

## 5. Honest comparison

| Aspect | Local harness (today) | Managed app runtime (Option A) | Dedicated worker service (Option B) |
|---|---|---|---|
| Can satisfy private beta unattended | No | Yes (single instance) | Yes |
| Can satisfy public hosting unattended | No | Yes | Yes |
| Can satisfy scheduled automation | No | No (needs a scheduler) | Yes (with a job runner) |
| Horizontal scale-out | No | No (without further work) | Yes |
| Per-workspace tenant isolation | Via RLS only | Via RLS + host policy | Via RLS + worker policy + network policy |
| New code in this milestone | None (already shipped) | None (reuse harness) | Significant |
| Operational cost | $0 (local) | Host fee | Host + observability + CI |
| Decision required | No (status quo) | Yes — host + rollout | Yes — worker codebase + CI |

---

## 6. What this document does **not** decide

- It does **not** recommend a host (Vercel, Render, Fly, Railway,
  AWS, Azure, GCP, on-prem Kubernetes, or otherwise).
- It does **not** recommend a runtime (Node-only vs. Docker vs.
  Kubernetes, single-instance vs. replicated, sidecar vs. job).
- It does **not** change `MARINA_ENABLE_EXEC`. That guard stays
  at `0` until the user explicitly approves enabling
  high/critical external tool execution.
- It does **not** propose enabling shell, browser, web
  retrieval, messaging, payments, deployments, or external
  upload. Those remain blocked in the registry.
- It does **not** run or apply any migration. The
  `20260823000001_durable_queue_foundation.sql` migration is
  staged but not applied.

---

## 7. What needs to happen before any runtime is selected

1. The deferred controlled durable-workflow remote test must
   be approved (with the existing approval sentence) and
   successfully run against the staging project
   `sslgswhhlujryjlrnnfr` to verify the queue end-to-end.
2. The user must explicitly approve the production runtime
   choice (Option A or Option B) and the host/runtime details.
3. The staged migration
   `20260823000001_durable_queue_foundation.sql` must be
   reviewed and applied.
4. The user must explicitly approve the rollout plan and the
   activation of `MARINA_ENABLE_EXEC` (this milestone does
   not modify that guard).

Until each of those gates is met, the local/manual harness
remains the only available runtime.
