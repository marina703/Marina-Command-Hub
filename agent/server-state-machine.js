/* ============================================================
   Marina AI Command Hub — Task/Run/Plan/Approval State Machine

   Pure, dependency-free transition rules. The server layer calls
   assertTransition() before persisting any status change; invalid
   transitions throw a TransitionError with a user-readable message.
   Every allowed transition returns an audit-event descriptor so
   the caller can persist it.

   Valid states:
     Task      draft, planning, awaiting_plan_review, queued, running,
               awaiting_approval, paused, completed, failed, cancelled
     Plan      draft, approved, superseded, rejected
     PlanStep  pending, running, awaiting_approval, completed, failed,
               skipped, cancelled
     Run       queued, active, succeeded, failed, cancelled, timed_out
     Approval  pending, approved, rejected, expired, cancelled, executed
     Artifact  draft, ready, archived, deleted
     Automation active, paused, failing, disabled
   ============================================================ */

class TransitionError extends Error {
  constructor(entity, from, to, reason) {
    super(
      `Invalid ${entity} transition: ${from} → ${to}${reason ? ` (${reason})` : ""}`,
    );
    this.name = "TransitionError";
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

const TRANSITIONS = {
  task: {
    draft: ["planning", "cancelled"],
    planning: ["awaiting_plan_review", "cancelled"],
    awaiting_plan_review: ["queued", "planning", "cancelled"],
    queued: ["running", "cancelled"],
    running: [
      "awaiting_approval",
      "paused",
      "completed",
      "failed",
      "cancelled",
      "timed_out",
    ],
    awaiting_approval: ["running", "cancelled"],
    paused: ["queued", "cancelled"],
    completed: [],
    failed: ["queued"], // retry → new attempt
    cancelled: [],
    timed_out: ["queued"], // retry → new attempt
  },
  plan: {
    draft: ["approved", "rejected", "superseded"],
    approved: ["superseded"],
    rejected: ["draft"], // revision requested → new draft version
    superseded: [],
  },
  planStep: {
    pending: ["running", "skipped", "cancelled"],
    running: [
      "awaiting_approval",
      "completed",
      "failed",
      "cancelled",
    ],
    awaiting_approval: ["running", "cancelled", "skipped"],
    completed: [],
    failed: ["pending"], // retryable failure → re-queue step
    skipped: [],
    cancelled: [],
  },
  run: {
    queued: ["active", "cancelled"],
    active: ["succeeded", "failed", "cancelled", "timed_out"],
    succeeded: [],
    failed: ["queued"], // retry → linked new attempt
    cancelled: ["queued"], // cancelled runs may be re-queued as retries
    timed_out: ["queued"], // retry → linked new attempt
  },
  approval: {
    pending: ["approved", "rejected", "expired", "cancelled"],
    approved: ["executed", "cancelled"], // cancelled = execution failed/blocked
    rejected: [],
    expired: [],
    cancelled: [],
    executed: [],
  },
  artifact: {
    draft: ["ready", "deleted"],
    ready: ["archived", "deleted"],
    archived: ["ready", "deleted"],
    deleted: [],
  },
  automation: {
    active: ["paused", "failing", "disabled"],
    paused: ["active", "disabled"],
    failing: ["active", "paused", "disabled"],
    disabled: ["active"],
  },
};

/**
 * Whether a transition is allowed.
 * @param {keyof typeof TRANSITIONS} entity
 */
function canTransition(entity, from, to) {
  const rules = TRANSITIONS[entity];
  if (!rules) return false;
  const allowed = rules[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Assert a transition is allowed; throws TransitionError otherwise.
 * @returns {{entity: string, from: string, to: string, at: string, actor: string}}
 *   an audit-event descriptor for the caller to persist.
 */
function assertTransition(entity, from, to, actor = "system") {
  if (!TRANSITIONS[entity]) {
    throw new TransitionError(entity, from, to, "unknown entity");
  }
  if (from === to) {
    throw new TransitionError(entity, from, to, "no-op transition");
  }
  if (!canTransition(entity, from, to)) {
    throw new TransitionError(entity, from, to, "not permitted by policy");
  }
  return {
    entity,
    from,
    to,
    actor,
    at: new Date().toISOString(),
  };
}

/** All states defined for an entity (useful for UI dropdowns/validation). */
function statesFor(entity) {
  return Object.keys(TRANSITIONS[entity] || {});
}

module.exports = {
  TransitionError,
  TRANSITIONS,
  canTransition,
  assertTransition,
  statesFor,
};