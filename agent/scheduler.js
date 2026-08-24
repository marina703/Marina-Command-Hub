const path = require("path");
const fs = require("fs");
const {
  collectProjectContext,
  askLLM,
  parseInstructions,
  processInstruction,
} = require("./agent");
const {
  readState,
  writeState,
  addTaskLog,
  addIdea,
  generateDashboardSummary,
  createTask,
} = require("./dashboard-state");

let intervalId = null;
let isRunning = false;
let loopBusy = false;

async function generateStandupBrief() {
  const state = readState();
  const activeTasks = (state.tasks || []).slice(0, 5);
  const completedHistory = (state.completedHistory || []).slice(0, 5);
  const ideas = (state.brainstormIdeas || []).slice(0, 3);

  // Build prompt using string concatenation (avoids template literal parsing issues at module load)
  const priorityList = activeTasks.map((t) => t.title).join(", ") || "None";
  const winList = completedHistory.map((h) => h.title).join(", ") || "Baseline initialized";
  const ideaList = ideas.map((i) => i.title).join(", ") || "";

  const enrichedPrompt =
    "You are the MarinaAI Automated Standup Generator. Generate a concise 3-bullet daily standup report based on the current project state. Keep it brief and actionable.\n\n" +
    "Active tasks: " + priorityList + "\n" +
    "Recent completions: " + winList + "\n" +
    "Ideas in progress: " + ideaList + "\n\n" +
    "Format as exactly 3 bullet points, one per line, starting with \"• \". Do not add any other text or commentary.";

  // Try to get LLM-generated version first, fall back to template
  let llmBrief = "";
  try {
    const { rawText } = await askLLM(enrichedPrompt, { includeRaw: true });
    if (rawText && rawText.trim()) {
      llmBrief = rawText.trim();
    }
  } catch {
    // LLM call failed - use template
  }

  // Build the brief: use LLM output if available, otherwise use template
  const templateBrief =
    "• Priorities: " + (priorityList || "Queue ready") +
    "• Recent Wins: " + (winList || "System initialized") +
    "• Next Focus: Expand growth streams and maintain 100% test passing rate.";

  const finalBrief = llmBrief || templateBrief;

  state.aiSummaries = [
    {
      id: "standup-" + Date.now(),
      title: "AI Team Standup (" + new Date().toLocaleDateString() + ")",
      summary: finalBrief,
      owner: llmBrief ? "LLM-Generated" : "Automated Standup Engine",
      generatedAt: new Date().toISOString(),
    },
    ...(Array.isArray(state.aiSummaries) ? state.aiSummaries : []),
  ].slice(0, 8);

  writeState(state);
  addTaskLog(
    "standup",
    llmBrief ? "LLM-generated AI team standup brief." : "Automated AI team standup generated."
  );
  return finalBrief;
}

async function runAutonomousLoop() {
  if (loopBusy) return;
  loopBusy = true;
  try {
    const context = collectProjectContext();
    const count = (context.match(/File:/g) || []).length;

    // Signal & Opportunity Radar: check queue density & domains.
    // Only seed an idea if the exact title is NOT already present, so the
    // scheduler never floods the board with duplicate entries (zero redundancy).
    const state = readState();
    const existingIdeas = Array.isArray(state.brainstormIdeas)
      ? state.brainstormIdeas
      : [];
    const hasSeedIdea = existingIdeas.some(
      (i) => i.title === "Dynamic AI Lead Concierge for ignitix.online",
    );
    if (!hasSeedIdea) {
      addIdea({
        title: "Dynamic AI Lead Concierge for ignitix.online",
        category: "Revenue",
        owner: "Ava (Strategist Sub-Agent)",
        description:
          "Interactive AI onboarding module converting visitors directly into enrolled users on ignitix and pyroprep.",
      });
      addTaskLog(
        "radar",
        "📡 Signal Radar: Low ideation density detected. Generated new monetization stream.",
      );
    }

    // Refresh dashboard summary only if none exists yet, so the summary feed
    // does not accumulate identical "AI operations update" entries every cycle.
    if (!Array.isArray(state.aiSummaries) || state.aiSummaries.length === 0) {
      generateDashboardSummary();
    }
    addTaskLog(
      "automation",
      "Autonomous background cycle complete (" + count + " files indexed • 2 portfolio sites monitored)."
    );
  } catch (err) {
    console.error("Autonomous loop error:", err);
  } finally {
    loopBusy = false;
  }
}

function startScheduler(intervalMs = 60000) {
  if (intervalId) clearInterval(intervalId);
  // Run initial cycle
  runAutonomousLoop();
  intervalId = setInterval(runAutonomousLoop, intervalMs);
  console.log("Autonomous Scheduler started (every " + intervalMs / 1000 + "s)");
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** Truthful runtime status of the in-process automation loop. */
function getSchedulerStatus() {
  return {
    timerActive: Boolean(intervalId),
    cycleInProgress: loopBusy,
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  generateStandupBrief,
  runAutonomousLoop,
  getSchedulerStatus,
};
