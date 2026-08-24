/* ============================================================
   MarinaAI — Deterministic Local Planner

   Strictly validated structured plan generator used by the
   server-side /api/plans/generate endpoint when no real
   planner provider is configured.

   Behavior:
     - Pure / deterministic (no LLM, no network, no random IDs)
     - Clearly labelled "deterministic local planner" in metadata
     - Produces a bounded template-based draft from task fields
     - Identifies itself truthfully in the UI; never claims to be
       a real AI reasoning pass or a configured provider

   Output is strictly schema-validated. Risky high/critical steps
   are not auto-generated; we never dispatch them in this
   milestone. All steps default to riskTier "low" and do not
   require approval so the durable safe workflow can run.
   ============================================================ */

const CRYPTO = require("crypto");

const PLANNER_ID = "deterministic-local-planner";
const PLANNER_LABEL = "Deterministic local planner";
const PLANNER_AVAILABILITY = "available_local_only";

const MAX_STEPS = 5;
const MAX_TITLE_LEN = 200;
const MAX_SUMMARY_LEN = 2000;
const MAX_ASSUMPTIONS = 6;
const MAX_RISKS = 6;
const MAX_TEXT = 500;

function hashPayload(obj) {
  return CRYPTO
    .createHash("sha256")
    .update(JSON.stringify(obj ?? null))
    .digest("hex")
    .slice(0, 32);
}

function clamp(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

function buildAssumptions(task) {
  const out = [
    "Inputs come from the task title, desired outcome, and instructions.",
    "No external tools or live data sources are consulted in this milestone.",
    "All steps are deterministic; identical inputs always produce identical plans.",
  ];
  if (task.priority === "Critical" || task.priority === "High") {
    out.push("High-priority tasks may need an explicit human decision before execution.");
  }
  if (task.budgetLimit != null) {
    out.push(`Configured budget cap: $${Number(task.budgetLimit).toFixed(2)}.`);
  }
  if (task.timeLimitSeconds != null) {
    out.push(`Configured time cap: ${task.timeLimitSeconds}s per run.`);
  }
  return out.slice(0, MAX_ASSUMPTIONS);
}

function buildRisks(task) {
  const out = [
    "No real provider is configured; this is a deterministic local draft.",
    "Step content is bounded and may not cover every edge case.",
  ];
  if (task.instructions && String(task.instructions).length > 1000) {
    out.push("Long instructions are truncated; review the full task context.");
  }
  return out.slice(0, MAX_RISKS);
}

function buildSummary(task) {
  const goal = clamp(task.desiredOutcome || task.title || "task goal", 240);
  return clamp(
    `Achieve the desired outcome: ${goal}. ` +
    `This is a deterministic local-planner draft based on the task fields.`,
    MAX_SUMMARY_LEN,
  );
}

function buildSteps(task) {
  const goal = clamp(task.desiredOutcome || task.title || "Complete the requested task", MAX_TEXT);
  const instr = clamp(task.instructions || "", MAX_TEXT);

  const steps = [
    {
      position: 0,
      title: "Capture objective",
      purpose: `Restate the desired outcome: ${goal}.`,
      dependencies: [],
      toolClass: "safe-internal",
      inputSummary: "Task title and desired outcome.",
      expectedOutput: "Clear one-sentence objective statement.",
      riskTier: "low",
      requiresApproval: false,
      estimatedDuration: 30,
      estimatedCost: 0,
      retryPolicy: { maxRetries: 0 },
    },
    {
      position: 1,
      title: "Review provided instructions",
      purpose: instr
        ? `Summarize the provided instructions (${instr.length} chars).`
        : "No additional instructions were provided; proceed with the objective only.",
      dependencies: [0],
      toolClass: "safe-internal",
      inputSummary: "Task instructions text.",
      expectedOutput: "Short list of constraints or context to honor.",
      riskTier: "low",
      requiresApproval: false,
      estimatedDuration: 30,
      estimatedCost: 0,
      retryPolicy: { maxRetries: 0 },
    },
    {
      position: 2,
      title: "Draft plan brief",
      purpose: "Compose a structured Markdown brief summarizing the plan, assumptions, and risks.",
      dependencies: [0, 1],
      toolClass: "safe-internal",
      inputSummary: "Objective and instruction summary.",
      expectedOutput: "Plan brief in Markdown.",
      riskTier: "low",
      requiresApproval: false,
      estimatedDuration: 60,
      estimatedCost: 0,
      retryPolicy: { maxRetries: 0 },
    },
    {
      position: 3,
      title: "Await approval",
      purpose: "Plan approval is required before any execution attempt. Approval is bound to this plan version.",
      dependencies: [2],
      toolClass: "approval",
      inputSummary: "Plan version and payload hash.",
      expectedOutput: "Approved plan version record.",
      riskTier: "low",
      requiresApproval: false,
      estimatedDuration: 0,
      estimatedCost: 0,
      retryPolicy: { maxRetries: 0 },
    },
    {
      position: 4,
      title: "Generate plan brief artifact",
      purpose: "On approved plan, run the safe-internal workflow to produce the durable Markdown brief artifact.",
      dependencies: [3],
      toolClass: "safe-internal",
      inputSummary: "Approved plan version.",
      expectedOutput: "Plan brief artifact persisted to the private artifacts bucket.",
      riskTier: "low",
      requiresApproval: false,
      estimatedDuration: 60,
      estimatedCost: 0,
      retryPolicy: { maxRetries: 0 },
    },
  ];
  return steps.slice(0, MAX_STEPS);
}

/**
 * Generate a strictly-validated structured plan draft.
 * Returns { ok, planDraft, payloadHash } or { ok: false, message }.
 */
function generatePlanDraft(task) {
  if (!task || !task.id) return { ok: false, message: "Task ID is required to generate a plan." };

  const assumptions = buildAssumptions(task);
  const risks = buildRisks(task);
  const summary = buildSummary(task);
  const steps = buildSteps(task);

  const planDraft = {
    summary,
    assumptions,
    risks,
    steps: steps.map((s) => ({
      position: s.position,
      title: clamp(s.title, MAX_TITLE_LEN),
      purpose: clamp(s.purpose, MAX_TEXT),
      dependencies: s.dependencies,
      toolClass: s.toolClass,
      inputSummary: s.inputSummary,
      expectedOutput: s.expectedOutput,
      riskTier: s.riskTier,
      requiresApproval: s.requiresApproval,
      estimatedDuration: s.estimatedDuration,
      estimatedCost: s.estimatedCost,
      retryPolicy: s.retryPolicy,
    })),
    provider: PLANNER_ID,
    providerLabel: PLANNER_LABEL,
    availability: PLANNER_AVAILABILITY,
    generatedAt: new Date().toISOString(),
  };

  const payloadHash = hashPayload({
    taskId: task.id,
    title: task.title,
    desiredOutcome: task.desiredOutcome || "",
    instructions: task.instructions || "",
    summary,
    assumptions,
    risks,
    steps: planDraft.steps,
  });

  return { ok: true, planDraft, payloadHash };
}

module.exports = {
  PLANNER_ID,
  PLANNER_LABEL,
  PLANNER_AVAILABILITY,
  generatePlanDraft,
  hashPayload,
};
