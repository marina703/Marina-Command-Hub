/* ============================================================
   MarinaAI — Email-to-Agent (Mail Manus)

   Converts an inbound email into a structured task + plan, so
   users can forward/CC an email and get a working task with a
   plan. Deterministic, providerless, safe — no shell, no network
   egress beyond the caller's own Supabase repo.
   ============================================================ */

const planner = require("./server-planner");
const repo = require("./server-supabase-repo");

/** Extract task fields from an email. */
function parseEmail({ from, subject, body }) {
  const subj = String(subject || "").trim() || "New task from email";
  const text = String(body || "").trim();
  let priority = "Medium";
  const lower = (subj + " " + text).toLowerCase();
  if (/not urgent|nothing urgent|no rush|whenever|low priority|someday|not a priority/.test(lower)) priority = "Low";
  else if (/urgent|asap|critical|high priority|immediately|as soon as possible/.test(lower)) priority = "High";

  const firstLine = text.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
  return {
    title: subj.slice(0, 200),
    outcome: firstLine.slice(0, 500),
    instructions: text.slice(0, 2000),
    priority,
    from: String(from || ""),
  };
}

/** Create a task + plan from an email. `client` is the Supabase service client. */
async function processEmail(client, { workspaceId, from, subject, body, actorId }) {
  if (!client) return { ok: false, message: "Supabase not configured" };
  const parsed = parseEmail({ from, subject, body });

  // 1. Create the task.
  const taskRes = await repo.createTask(client, {
    workspaceId,
    title: parsed.title,
    desiredOutcome: parsed.outcome,
    instructions: parsed.instructions,
    status: "draft",
    priority: parsed.priority,
    creatorId: actorId || null,
  });
  if (!taskRes.ok) return { ok: false, message: "Task creation failed: " + taskRes.message };
  const task = taskRes.task;

  // 2. Generate a deterministic plan.
  const draft = planner.generatePlanDraft(task);
  const versionRes = await repo.nextPlanVersion(client, workspaceId, task.id);
  const version = versionRes.ok ? versionRes.version : 1;
  const planRes = await repo.createPlan(client, {
    workspaceId,
    taskId: task.id,
    version,
    author: "email-agent",
    summary: draft.planDraft.summary,
    assumptions: draft.planDraft.assumptions,
    risks: draft.planDraft.risks,
  });
  if (!planRes.ok) return { ok: false, task, message: "Plan creation failed: " + planRes.message };
  const plan = planRes.plan;

  // 3. Persist plan steps.
  const stepRows = draft.planDraft.steps.map((s, i) => ({
    ...s,
    workspaceId,
    planId: plan.id,
    taskId: task.id,
    position: i,
  }));
  await repo.createPlanSteps(client, stepRows);

  return { ok: true, task, plan, parsed };
}

module.exports = { parseEmail, processEmail };
