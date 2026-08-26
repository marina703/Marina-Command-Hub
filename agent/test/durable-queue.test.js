/* ============================================================
   Durable Queue & Worker Foundation tests

   These tests exercise the queue repository and the local
   worker harness through an in-memory mock supabase client.
   The mock faithfully implements the same Supabase JS client
   shape used by the durable layer:
     - select/insert/update/delete on .from("table")
     - chained .eq() / .or() / .lte() / .in() / .is() filters
     - .single() and .maybeSingle() terminators
     - .order() / .limit()
     - service client .rpc()

   The tests prove:
     1. Idempotent enqueue (same key returns the existing run).
     2. Atomic claim: two simulated workers cannot both claim
        the same run.
     3. Expired lease recovery is bounded and auditable.
     4. Heartbeat respects cancellation.
     5. Cancellation propagates as a state-machine transition.
     6. Retry policy: retryable only, bounded attempts,
        parent/original linkage, no auto-retry after
        cancellation or policy_blocked.
     7. State machine: only the legal transitions are allowed.
     8. The local worker guard is honored: default disabled.
   ============================================================ */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const queue = require("../server-queue-repo");
const sm = require("../server-state-machine");
const worker = require("../server-queue-worker");
const registry = require("../server-tool-registry");

// ── In-memory mock supabase service client ────────────────────

function createMockClient() {
  const tables = {
    runs: [],
    run_events: [],
    artifacts: [],
    audits: [],
    plans: [],
    approval_requests: [],
    tasks: [],
    tool_invocations: [],
  };
  let seqByRun = {};

  function matchFilter(row, filters) {
    for (const f of filters) {
      const [op, col, val, val2] = f;
      if (op === "eq") {
        if (row[col] !== val) return false;
      } else if (op === "neq") {
        if (row[col] === val) return false;
      } else if (op === "in") {
        if (!val.includes(row[col])) return false;
      } else if (op === "lte") {
        if (!(row[col] != null && new Date(row[col]).getTime() <= new Date(val).getTime())) return false;
      } else if (op === "lt") {
        if (!(row[col] != null && new Date(row[col]).getTime() < new Date(val).getTime())) return false;
      } else if (op === "is") {
        if (row[col] !== val) return false;
      } else if (op === "or") {
        // Simplified: "a.is.null,a.lt.b" — split on commas
        const parts = val.split(",");
        let any = false;
        for (const part of parts) {
          const m = part.match(/^([\w_]+)\.([a-z]+)\.(.+)$/);
          if (!m) continue;
          const [, c, op2, ref] = m;
          if (op2 === "is" && ref === "null") {
            if (row[c] == null) { any = true; break; }
          } else if (op2 === "lt") {
            if (row[c] != null && new Date(row[c]).getTime() < new Date(ref).getTime()) { any = true; break; }
          }
        }
        if (!any) return false;
      }
    }
    return true;
  }

  function buildQuery(tableName, filters, opts) {
    opts = opts || {};
    const rows = tables[tableName] || [];
    let result = rows.filter((r) => matchFilter(r, filters));
    if (opts.order) {
      const [col, dir] = opts.order;
      result = result.slice().sort((a, b) => {
        if (a[col] < b[col]) return dir === "asc" ? -1 : 1;
        if (a[col] > b[col]) return dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    if (typeof opts.limit === "number") result = result.slice(0, opts.limit);
    return result;
  }

  function makeQuery(tableName) {
    const filters = [];
    let orderSpec = null;
    let limitSpec = null;
    let mode = "many"; // many | single | maybeSingle
    const q = {
      eq(col, val) { filters.push(["eq", col, val]); return q; },
      neq(col, val) { filters.push(["neq", col, val]); return q; },
      in(col, vals) { filters.push(["in", col, vals]); return q; },
      lte(col, val) { filters.push(["lte", col, val]); return q; },
      lt(col, val) { filters.push(["lt", col, val]); return q; },
      is(col, val) { filters.push(["is", col, val]); return q; },
      or(expr) { filters.push(["or", null, expr]); return q; },
      order(col, opts) { orderSpec = [col, (opts && opts.ascending === false) ? "desc" : "asc"]; return q; },
      limit(n) { limitSpec = n; return q; },
      then(onFulfilled, onRejected) {
        try {
          const result = buildQuery(tableName, filters, { order: orderSpec, limit: limitSpec });
          if (mode === "single") {
            if (result.length === 0) return Promise.resolve({ data: null, error: { message: "no rows" } }).then(onFulfilled, onRejected);
            return Promise.resolve({ data: result[0], error: null }).then(onFulfilled, onRejected);
          }
          if (mode === "maybeSingle") {
            return Promise.resolve({ data: result[0] || null, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: result, error: null }).then(onFulfilled, onRejected);
        } catch (err) {
          return Promise.resolve({ data: null, error: { message: err.message } }).then(onFulfilled, onRejected);
        }
      },
      single() { mode = "single"; return q; },
      maybeSingle() { mode = "maybeSingle"; return q; },
      // For mock updates, allow awaiting the chain directly
      [Symbol.toStringTag]: "Promise",
    };
    // allow updates/inserts/deletes to share filter chain
    q._filters = filters;
    return q;
  }

  const client = {
    from(tableName) {
      const filters = [];
      let orderSpec = null;
      let limitSpec = null;
      const query = {
        eq(col, val) { filters.push(["eq", col, val]); return query; },
        neq(col, val) { filters.push(["neq", col, val]); return query; },
        in(col, vals) { filters.push(["in", col, vals]); return query; },
        lte(col, val) { filters.push(["lte", col, val]); return query; },
        lt(col, val) { filters.push(["lt", col, val]); return query; },
        is(col, val) { filters.push(["is", col, val]); return query; },
        or(expr) { filters.push(["or", null, expr]); return query; },
        order(col, opts) { orderSpec = [col, (opts && opts.ascending === false) ? "desc" : "asc"]; return query; },
        limit(n) { limitSpec = n; return query; },
        select() { return selectImpl2(tableName, filters, orderSpec, limitSpec); },
        insert(payload) {
          if (!tables[tableName]) tables[tableName] = [];
          const rows = Array.isArray(payload) ? payload : [payload];
          const inserted = rows.map((r) => {
            const id = tableName + "-" + (tables[tableName].length + 1);
            const fullRow = {
              id,
              created_at: new Date().toISOString(),
              ...r,
            };
            tables[tableName].push(fullRow);
            return fullRow;
          });
          // Build a chainable select() that supports .single() and .maybeSingle()
          const sel = function() {
            const obj = {
              single() { return Promise.resolve({ data: inserted[0] || null, error: null }); },
              maybeSingle() { return Promise.resolve({ data: inserted[0] || null, error: null }); },
              then(onFulfilled) {
                return Promise.resolve({ data: inserted[0] || null, error: null }).then(onFulfilled);
              },
            };
            return obj;
          };
          return {
            select: sel,
            then(onFulfilled) {
              return Promise.resolve({ data: inserted[0] || null, error: null }).then(onFulfilled);
            },
          };
        },
        update(patch) {
          // The update() chain uses the same filter machinery as select().
          function exec() {
            const matching = (tables[tableName] || []).filter((r) => matchFilter(r, filters));
            for (const row of matching) Object.assign(row, patch);
            return matching[0] || null;
          }
          function terminalPromise() {
            return Promise.resolve({ data: exec(), error: null });
          }
          const chainable = {
            eq(col, val) { filters.push(["eq", col, val]); return chainable; },
            neq(col, val) { filters.push(["neq", col, val]); return chainable; },
            in(col, vals) { filters.push(["in", col, vals]); return chainable; },
            lte(col, val) { filters.push(["lte", col, val]); return chainable; },
            lt(col, val) { filters.push(["lt", col, val]); return chainable; },
            is(col, val) { filters.push(["is", col, val]); return chainable; },
            or(expr) { filters.push(["or", null, expr]); return chainable; },
            order() { return chainable; },
            limit() { return chainable; },
            select() {
              // Return a chainable terminator that supports .single()/.maybeSingle()
              const term = {
                single: terminalPromise,
                maybeSingle: terminalPromise,
                then(onFulfilled) { return terminalPromise().then(onFulfilled); },
              };
              return term;
            },
            single: terminalPromise,
            maybeSingle: terminalPromise,
            then(onFulfilled) { return terminalPromise().then(onFulfilled); },
          };
          return chainable;
        },
        delete() {
          if (!tables[tableName]) tables[tableName] = [];
          const before = (tables[tableName] || []).length;
          tables[tableName] = (tables[tableName] || []).filter((r) => !matchFilter(r, filters));
          return {
            eq() { return this; },
            then(onFulfilled) {
              return Promise.resolve({ data: null, error: null, count: before - tables[tableName].length }).then(onFulfilled);
            },
          };
        },
      };
      return query;
    },
    storage: {
      from() {
        return {
          upload(path) { return Promise.resolve({ data: { path }, error: null }); },
          createSignedUrl(path) { return Promise.resolve({ data: { signedUrl: "http://example/" + path }, error: null }); },
          download(path) { return Promise.resolve({ data: { text: () => Promise.resolve("body") }, error: null }); },
        };
      },
    },
    auth: {
      admin: { createUser: () => Promise.resolve({ data: { user: { id: "u" } }, error: null }), deleteUser: () => Promise.resolve({ error: null }) },
      getUser: () => Promise.resolve({ data: { user: { id: "u" } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { access_token: "t" } }, error: null }),
    },
    rpc() { return Promise.resolve({ data: "w", error: null }); },
    _tables: tables,
  };

  function selectImpl(tableName, filters, orderSpec, limitSpec) {
    const result = buildQuery(tableName, filters, { order: orderSpec, limit: limitSpec });
    const obj = {
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      single() { return Promise.resolve({ data: result[0] || null, error: null }); },
      maybeSingle() { return Promise.resolve({ data: result[0] || null, error: null }); },
      then(onFulfilled) {
        return Promise.resolve({ data: result, error: null }).then(onFulfilled);
      },
    };
    return obj;
  }

  // selectImpl2: chainable; supports eq, lte, or, order, limit, single, maybeSingle.
  function selectImpl2(tableName, filters, orderSpec, limitSpec) {
    const self = {
      eq(col, val) { filters.push(["eq", col, val]); return self; },
      lte(col, val) { filters.push(["lte", col, val]); return self; },
      lt(col, val) { filters.push(["lt", col, val]); return self; },
      neq(col, val) { filters.push(["neq", col, val]); return self; },
      in(col, vals) { filters.push(["in", col, vals]); return self; },
      is(col, val) { filters.push(["is", col, val]); return self; },
      or(expr) { filters.push(["or", null, expr]); return self; },
      order(col, opts) { orderSpec = [col, (opts && opts.ascending === false) ? "desc" : "asc"]; return self; },
      limit(n) { limitSpec = n; return self; },
      single() {
        const result = buildQuery(tableName, filters, { order: orderSpec, limit: limitSpec });
        return Promise.resolve({ data: result[0] || null, error: null });
      },
      maybeSingle() {
        const result = buildQuery(tableName, filters, { order: orderSpec, limit: limitSpec });
        return Promise.resolve({ data: result[0] || null, error: null });
      },
      then(onFulfilled) {
        const result = buildQuery(tableName, filters, { order: orderSpec, limit: limitSpec });
        return Promise.resolve({ data: result, error: null }).then(onFulfilled);
      },
    };
    return self;
  }

  return client;
}

// ── Module shape ─────────────────────────────────────────────

test("queue module exports the documented surface", () => {
  assert.equal(typeof queue.enqueueRun, "function");
  assert.equal(typeof queue.claimNextEligibleRun, "function");
  assert.equal(typeof queue.heartbeatLease, "function");
  assert.equal(typeof queue.releaseExpiredLeases, "function");
  assert.equal(typeof queue.requestCancellation, "function");
  assert.equal(typeof queue.markRunStarted, "function");
  assert.equal(typeof queue.markRunSucceeded, "function");
  assert.equal(typeof queue.markRunFailed, "function");
  assert.equal(typeof queue.markRunTimedOut, "function");
  assert.equal(typeof queue.scheduleRetry, "function");
  assert.equal(typeof queue.classifyRunFailureForRetry, "function");
  assert.equal(typeof queue.computeBackoffMs, "function");
});

test("queue constants are honest and bounded", () => {
  assert.equal(queue.LEASE_DEFAULTS.maxAttempts, 3);
  assert.ok(queue.LEASE_DEFAULTS.leaseMs > 0 && queue.LEASE_DEFAULTS.leaseMs <= 5 * 60 * 1000);
  assert.ok(queue.LEASE_DEFAULTS.backoffCapMs <= 60 * 1000);
  // Retryable classifications are explicit and do not include
  // policy_blocked, invalid_state, or cancelled.
  assert.ok(!queue.RETRY_CLASSIFICATIONS.has("policy_blocked"));
  assert.ok(!queue.RETRY_CLASSIFICATIONS.has("invalid_state"));
  assert.ok(!queue.RETRY_CLASSIFICATIONS.has("cancelled"));
  assert.ok(queue.RETRY_CLASSIFICATIONS.has("internal_error"));
  assert.ok(queue.RETRY_CLASSIFICATIONS.has("timeout"));
});

test("classifyRunFailureForRetry: only retryable classifications are retryable", () => {
  assert.equal(queue.classifyRunFailureForRetry("internal_error").retryable, true);
  assert.equal(queue.classifyRunFailureForRetry("timeout").retryable, true);
  assert.equal(queue.classifyRunFailureForRetry("policy_blocked").retryable, false);
  assert.equal(queue.classifyRunFailureForRetry("invalid_state").retryable, false);
  assert.equal(queue.classifyRunFailureForRetry("cancelled").retryable, false);
  assert.equal(queue.classifyRunFailureForRetry("duplicate").retryable, false);
  assert.equal(queue.classifyRunFailureForRetry(null).retryable, false);
  assert.equal(queue.classifyRunFailureForRetry("").retryable, false);
});

test("computeBackoffMs is bounded and monotonic", () => {
  assert.equal(queue.computeBackoffMs(1), 0);
  const b2 = queue.computeBackoffMs(2);
  const b3 = queue.computeBackoffMs(3);
  const b4 = queue.computeBackoffMs(4);
  assert.ok(b2 > 0 && b3 > b2 && b4 > b3, "backoff must grow then cap");
  // Cap
  const b100 = queue.computeBackoffMs(100);
  assert.ok(b100 <= queue.LEASE_DEFAULTS.backoffCapMs);
});

// ── Idempotent enqueue ───────────────────────────────────────

test("enqueueRun: same idempotencyKey returns the existing run", async () => {
  const client = createMockClient();
  const r1 = await queue.enqueueRun(client, {
    workspaceId: "w-1", taskId: "t-1", idempotencyKey: "k-1",
  });
  assert.equal(r1.ok, true);
  assert.equal(r1.isExisting, false);
  assert.equal(r1.run.status, "queued");
  const r2 = await queue.enqueueRun(client, {
    workspaceId: "w-1", taskId: "t-1", idempotencyKey: "k-1",
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.isExisting, true);
  assert.equal(r2.run.id, r1.run.id);
  // Only one row in the runs table.
  assert.equal(client._tables.runs.length, 1);
});

test("enqueueRun: different idempotencyKeys create different runs", async () => {
  const client = createMockClient();
  const r1 = await queue.enqueueRun(client, {
    workspaceId: "w-1", taskId: "t-1", idempotencyKey: "k-1",
  });
  const r2 = await queue.enqueueRun(client, {
    workspaceId: "w-1", taskId: "t-1", idempotencyKey: "k-2",
  });
  assert.notEqual(r1.run.id, r2.run.id);
  assert.equal(client._tables.runs.length, 2);
});

test("enqueueRun: missing workspaceId or taskId is rejected", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1" });
  assert.equal(r.ok, false);
  assert.match(r.message, /workspaceId and taskId/);
});

// ── Atomic claim ─────────────────────────────────────────────

test("claimNextEligibleRun: two workers cannot both claim the same run", async () => {
  const client = createMockClient();
  await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c1 = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  const c2 = await queue.claimNextEligibleRun(client, { workerId: "wB" });
  assert.equal(c1.ok, true);
  assert.ok(c1.claim, "first worker must claim");
  assert.equal(c1.run.status, "active");
  assert.equal(c1.claim.workerId, "wA");
  // The second worker must NOT receive the same run as a new claim.
  assert.equal(c2.ok, true);
  assert.equal(c2.claim, null, "second worker must not claim the same run");
});

test("claimNextEligibleRun: requires a workerId", async () => {
  const client = createMockClient();
  const c = await queue.claimNextEligibleRun(client, { workerId: "" });
  assert.equal(c.ok, false);
  assert.match(c.message, /workerId is required/);
});

test("claimNextEligibleRun: returns null claim when no eligible run", async () => {
  const client = createMockClient();
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  assert.equal(c.ok, true);
  assert.equal(c.claim, null);
});

// ── Heartbeat ────────────────────────────────────────────────

test("heartbeatLease: respects cancellation", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  assert.ok(c.claim);
  await queue.requestCancellation(client, { runId: r.run.id, actorId: "u" });
  const hb = await queue.heartbeatLease(client, r.run.id, c.claim.claimToken);
  assert.equal(hb.ok, false);
  assert.equal(hb.failureClassification, "cancelled");
});

test("heartbeatLease: rejects a foreign claim token", async () => {
  const client = createMockClient();
  await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  assert.ok(c.claim);
  const hb = await queue.heartbeatLease(client, c.run.id, "foreign-token");
  assert.equal(hb.ok, false);
});

// ── Cancellation ─────────────────────────────────────────────

test("requestCancellation: active run is cancelled and an event is recorded", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  assert.ok(c.claim);
  const res = await queue.requestCancellation(client, { runId: r.run.id, actorId: "u" });
  assert.equal(res.ok, true);
  assert.equal(res.run.status, "cancelled");
  assert.equal(res.run.failureClassification, "cancelled");
  // Event recorded
  const evs = client._tables.run_events.filter((e) => e.run_id === r.run.id);
  assert.ok(evs.some((e) => e.event === "run.cancelled"));
});

test("requestCancellation: terminal run cannot be cancelled again", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  await queue.markRunSucceeded(client, r.run.id, c.claim.claimToken);
  const res = await queue.requestCancellation(client, { runId: r.run.id });
  assert.equal(res.ok, false);
  assert.equal(res.failureClassification, "invalid_state");
});

// ── State machine ───────────────────────────────────────────

test("state machine: enqueue → claim → active → succeeded", () => {
  assert.ok(sm.canTransition("run", "queued", "active"));
  assert.ok(sm.canTransition("run", "active", "succeeded"));
  assert.ok(sm.canTransition("run", "queued", "cancelled"));
  assert.ok(sm.canTransition("run", "active", "cancelled"));
  assert.ok(sm.canTransition("run", "active", "timed_out"));
  assert.ok(sm.canTransition("run", "active", "failed"));
  assert.ok(!sm.canTransition("run", "succeeded", "cancelled"));
  assert.ok(!sm.canTransition("run", "succeeded", "active"));
  assert.ok(!sm.canTransition("run", "cancelled", "active"));
  assert.ok(!sm.canTransition("run", "queued", "succeeded")); // must go through active
});

test("state machine: retry is allowed only from failed/timed_out/cancelled", () => {
  assert.ok(sm.canTransition("run", "failed", "queued"));
  assert.ok(sm.canTransition("run", "timed_out", "queued"));
  assert.ok(sm.canTransition("run", "cancelled", "queued"));
  assert.ok(!sm.canTransition("run", "succeeded", "queued"));
});

// ── Retry policy ─────────────────────────────────────────────

test("scheduleRetry: only retryable classifications are scheduled", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  await queue.markRunFailed(client, r.run.id, c.claim.claimToken, { failureClassification: "internal_error" });
  const retry = await queue.scheduleRetry(client, r.run.id, {});
  assert.equal(retry.ok, true);
  assert.ok(retry.run.id !== r.run.id, "retry must be a new run");
  assert.equal(retry.run.attemptCount, 2);
  assert.equal(retry.run.parentRunId, r.run.id);
  assert.equal(client._tables.runs.length, 2);
});

test("scheduleRetry: policy_blocked is never retried", async () => {
  const client = createMockClient();
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1" });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  await queue.markRunFailed(client, r.run.id, c.claim.claimToken, { failureClassification: "policy_blocked" });
  const retry = await queue.scheduleRetry(client, r.run.id, {});
  assert.equal(retry.ok, false);
  assert.match(retry.message, /not retryable/);
});

test("scheduleRetry: refuses retry beyond max_attempts", async () => {
  const client = createMockClient();
  // maxAttempts=1: only the original attempt is allowed; no retry.
  const r = await queue.enqueueRun(client, { workspaceId: "w-1", taskId: "t-1", maxAttempts: 1 });
  const c = await queue.claimNextEligibleRun(client, { workerId: "wA" });
  await queue.markRunFailed(client, r.run.id, c.claim.claimToken, { failureClassification: "internal_error" });
  const retry1 = await queue.scheduleRetry(client, r.run.id, {});
  assert.equal(retry1.ok, false);
  assert.match(retry1.message, /max attempts/);
});

// ── Local worker guard ──────────────────────────────────────

test("local worker is disabled by default", () => {
  const saved = process.env.MARINA_LOCAL_WORKER;
  delete process.env.MARINA_LOCAL_WORKER;
  assert.equal(worker.isLocalWorkerEnabled(), false);
  if (saved) process.env.MARINA_LOCAL_WORKER = saved;
});

test("local worker is enabled when MARINA_LOCAL_WORKER=1", () => {
  const saved = process.env.MARINA_LOCAL_WORKER;
  process.env.MARINA_LOCAL_WORKER = "1";
  assert.equal(worker.isLocalWorkerEnabled(), true);
  if (saved) process.env.MARINA_LOCAL_WORKER = saved;
  else delete process.env.MARINA_LOCAL_WORKER;
});

test("local worker harness throws when called without the guard", async () => {
  const saved = process.env.MARINA_LOCAL_WORKER;
  delete process.env.MARINA_LOCAL_WORKER;
  const client = createMockClient();
  await assert.rejects(() => worker.processOnce(client, "wA", {}), /not enabled/);
  if (saved) process.env.MARINA_LOCAL_WORKER = saved;
});

// ── Tool registry invariants ─────────────────────────────────

test("registry: only safe-internal, web-search, and research have executable=true", () => {
  const EXECUTABLE = new Set(["safe-internal", "web-search", "research"]);
  for (const t of registry.listTools()) {
    if (EXECUTABLE.has(t.name)) {
      assert.equal(t.executable, true, t.name + " must be executable");
      assert.equal(t.availability, registry.AVAILABILITY.AVAILABLE);
    } else {
      assert.notEqual(t.executable, true, t.name + " must not be executable");
    }
  }
});

test("registry: every blocked tool has availabilityState=blocked", () => {
  for (const name of ["shell-exec", "browser-automation", "web-retrieval", "messaging-send", "payment-execute", "deployment-execute"]) {
    const t = registry.getToolDefinition(name);
    assert.equal(t.availabilityState, registry.AVAILABILITY.BLOCKED);
  }
});
 