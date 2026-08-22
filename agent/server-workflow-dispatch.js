/* ============================================================
   MarinaAI — Workflow Dispatcher Interface

   Narrow documented seam that the dashboard server and the
   local queue worker use to invoke the bounded registered
   handlers. The dispatcher is now driven by the tool-registry
   so the only executable handler is the safe-internal plan-brief
   workflow. Every other id returns a `not_configured` or
   `policy_blocked` result with no side effect.

   The dispatcher does NOT touch the network, the shell, the
   browser, an LLM provider, an email/message gateway, a
   payment gateway, a deployment service, or a third-party
   upload endpoint. It does not change MARINA_ENABLE_EXEC.
   ============================================================ */

const safe = require("./server-safe-workflow");
const planner = require("./server-planner");
const registry = require("./server-tool-registry");

const REGISTERED_WORKFLOWS = {
  [safe.WORKFLOW_ID]: {
    id: safe.WORKFLOW_ID,
    label: safe.WORKFLOW_LABEL,
    availability: "available",
    riskTier: "low",
    provider: planner.PLANNER_ID,
    providerLabel: planner.PLANNER_LABEL,
    description: "Providerless, deterministic, side-effect-free inside MarinaAI. Generates a durable Markdown plan brief artifact for the active approved plan.",
  },
};

function listWorkflows() {
  return Object.values(REGISTERED_WORKFLOWS);
}

function getWorkflow(id) {
  return REGISTERED_WORKFLOWS[id] || null;
}

async function dispatch(workflowId, ctx) {
  // Defense in depth: cross-check the registry, not only the
  // workflow id. The dispatcher must never reach a handler
  // that the registry does not list as `dispatchable`.
  const toolDef = registry.getToolDefinition(workflowId);
  if (!toolDef) {
    return {
      ok: false,
      message: "Unknown workflow \"" + workflowId + "\". Only registered tools may dispatch.",
      failureClassification: "policy_blocked",
    };
  }
  if (!registry.isDispatchable(toolDef)) {
    return {
      ok: false,
      message: "Workflow \"" + workflowId + "\" is not in a dispatchable state (" + toolDef.availabilityState + ").",
      failureClassification: toolDef.availabilityState === "blocked" ? "policy_blocked" : "not_configured",
    };
  }
  if (workflowId !== safe.WORKFLOW_ID) {
    return {
      ok: false,
      message: "Workflow \"" + workflowId + "\" is registered but no handler is wired.",
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
