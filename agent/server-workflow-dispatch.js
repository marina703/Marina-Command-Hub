/* ============================================================
   MarinaAI — Workflow Dispatcher Interface

   Narrow documented seam that the dashboard server uses to
   invoke the bounded safe internal workflow. The interface
   exists so a future durable queue/worker can replace the
   synchronous path without changes to call sites.

   This is the ONLY supported execution path in this milestone.
   It does not dispatch shell, browser, web, model, message,
   deployment, or third-party actions. It does not change
   MARINA_ENABLE_EXEC.
   ============================================================ */

const safe = require("./server-safe-workflow");
const planner = require("./server-planner");

const REGISTERED_WORKFLOWS = {
  [safe.WORKFLOW_ID]: {
    id: safe.WORKFLOW_ID,
    label: safe.WORKFLOW_LABEL,
    availability: "available",
    riskTier: "low",
    provider: planner.PLANNER_ID,
    providerLabel: planner.PLANNER_LABEL,
    description:
      "Providerless, deterministic, side-effect-free inside MarinaAI. Generates a durable Markdown plan brief artifact for the active approved plan.",
  },
};

function listWorkflows() {
  return Object.values(REGISTERED_WORKFLOWS);
}

function getWorkflow(id) {
  return REGISTERED_WORKFLOWS[id] || null;
}

/**
 * Dispatch the named workflow. Currently only the safe internal
 * preview is wired. Any other id returns a policy_blocked result.
 */
async function dispatch(workflowId, ctx) {
  const wf = getWorkflow(workflowId);
  if (!wf) {
    return {
      ok: false,
      message: `Unknown workflow "${workflowId}". Only the safe internal workflow is available in this milestone.`,
      failureClassification: "policy_blocked",
    };
  }
  if (workflowId !== safe.WORKFLOW_ID) {
    return {
      ok: false,
      message: `Workflow "${workflowId}" is registered but not yet wired.`,
      failureClassification: "not_configured",
    };
  }
  return safe.runSafeWorkflow(ctx);
}

module.exports = {
  REGISTERED_WORKFLOWS,
  listWorkflows,
  getWorkflow,
  dispatch,
};
