const fs = require("fs");
const path = require("path");

// Overridable for tests / alternate deployments (MARINA_STATE_PATH).
const STATE_PATH =
  process.env.MARINA_STATE_PATH || path.join(__dirname, "dashboard-state.json");

const defaultState = {
  status: "online",
  mode: "autonomous",
  lastSync: "just now",
  system: {
    cpu: 0,
    ram: 0,
    disk: 0,
    npu: 0,
    network: 0,
  },
  quickStats: [
    { label: "Active Tasks", value: "0", accent: "teal" },
    { label: "AI Calls", value: "0", accent: "pink" },
    { label: "Deployments", value: "0", accent: "teal" },
    { label: "Alerts", value: "0", accent: "pink" },
  ],
  modules: [],
  services: [],
  projects: [],

  projectMilestones: [],
  systemControls: [
    "Clear temp files",
    "Restart services",
    "Optimize system",
    "Toggle high-performance mode",
  ],
  logs: [],
  tasks: [],
  completedHistory: [],
  brainstormIdeas: [],
  meetingAgenda: [],
  aiSummaries: [],
  meetingNotes: [],
  commandHubUpdates: [],
  approvals: [],
  auditEvents: [],
  // ── Phase B–C domain model ──
  plans: [],
  planSteps: [],
  runs: [],
  runEvents: [],
  artifacts: [],
  sources: [],
  toolInvocations: [],
};

function ensureState() {
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(defaultState, null, 2));
  }
}

function generateMeetingSummary(meeting = {}, state = {}) {
  const agenda =
    Array.isArray(meeting.agenda) && meeting.agenda.length
      ? meeting.agenda
      : ["Project review", "Open blockers", "Next actions"];
  const taskCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
  const ideaCount = Array.isArray(state.brainstormIdeas)
    ? state.brainstormIdeas.length
    : 0;
  const historyCount = Array.isArray(state.completedHistory)
    ? state.completedHistory.length
    : 0;

  const highlightList = agenda
    .slice(0, 3)
    .map((item) => item.trim())
    .filter(Boolean);
  const summary = [
    `Summary for ${meeting.title || "AI team sync"}:`,
    `The team reviewed ${highlightList.join(", ")}.`,
    `Current workload includes ${taskCount} active tasks, ${ideaCount} ideation streams, and ${historyCount} completed wins.`,
    "Recommended next action: prioritize the highest-impact task, keep the brainstorm pipeline moving, and close the loop on the next deployment milestone.",
  ].join(" ");

  return {
    id: `summary-${Date.now()}`,
    title: meeting.title || "AI team summary",
    summary,
    owner: meeting.owner || "AI Team",
    generatedAt: new Date().toISOString(),
  };
}

function addProjectMilestone(input = {}) {
  const state = readState();
  const milestone = {
    id: `milestone-${Date.now()}`,
    title: input.title || "New milestone",
    status: input.status || "in-progress",
    owner: input.owner || "Team",
    due: input.due || "This week",
  };

  state.projectMilestones = [
    milestone,
    ...(Array.isArray(state.projectMilestones) ? state.projectMilestones : []),
  ].slice(0, 10);
  state.logs = [
    `Milestone updated: ${milestone.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return milestone;
}

function addMeetingNote(input = {}) {
  const state = readState();
  const note = {
    id: `note-${Date.now()}`,
    title: input.title || "Meeting note",
    owner: input.owner || "AI Team",
    note:
      input.note ||
      "Key themes captured by the team and the autonomous system.",
  };

  state.meetingNotes = [
    note,
    ...(Array.isArray(state.meetingNotes) ? state.meetingNotes : []),
  ].slice(0, 10);
  state.logs = [
    `Meeting note captured: ${note.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return note;
}

function migrateState(state = {}) {
  const merged = {
    ...defaultState,
    ...state,
    system: { ...defaultState.system, ...(state.system || {}) },
    tasks: Array.isArray(state.tasks) ? state.tasks : [...defaultState.tasks],
    completedHistory: Array.isArray(state.completedHistory)
      ? state.completedHistory
      : [...defaultState.completedHistory],
    brainstormIdeas: Array.isArray(state.brainstormIdeas)
      ? state.brainstormIdeas
      : [...defaultState.brainstormIdeas],
    meetingAgenda: Array.isArray(state.meetingAgenda)
      ? state.meetingAgenda
      : [...defaultState.meetingAgenda],
    aiSummaries: Array.isArray(state.aiSummaries)
      ? state.aiSummaries
      : [...defaultState.aiSummaries],
    projectMilestones: Array.isArray(state.projectMilestones)
      ? state.projectMilestones
      : [...defaultState.projectMilestones],
    meetingNotes: Array.isArray(state.meetingNotes)
      ? state.meetingNotes
      : [...defaultState.meetingNotes],
    commandHubUpdates: Array.isArray(state.commandHubUpdates)
      ? state.commandHubUpdates
      : [...defaultState.commandHubUpdates],
    approvals: Array.isArray(state.approvals)
      ? state.approvals
      : [...defaultState.approvals],
    auditEvents: Array.isArray(state.auditEvents)
      ? state.auditEvents
      : [...defaultState.auditEvents],
    plans: Array.isArray(state.plans) ? state.plans : [...defaultState.plans],
    planSteps: Array.isArray(state.planSteps) ? state.planSteps : [...defaultState.planSteps],
    runs: Array.isArray(state.runs) ? state.runs : [...defaultState.runs],
    runEvents: Array.isArray(state.runEvents) ? state.runEvents : [...defaultState.runEvents],
    artifacts: Array.isArray(state.artifacts) ? state.artifacts : [...defaultState.artifacts],
    sources: Array.isArray(state.sources) ? state.sources : [...defaultState.sources],
    toolInvocations: Array.isArray(state.toolInvocations) ? state.toolInvocations : [...defaultState.toolInvocations],
  };

  return merged;
}

function readState() {
  ensureState();
  try {
    const fileState = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return migrateState(fileState);
  } catch (error) {
    return migrateState();
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(migrateState(state), null, 2));
}

function getDashboardState() {
  return readState();
}

/**
 * Merge live OS telemetry into the dashboard state so the Command Hub
 * always reflects real CPU / memory / disk / network / process / uptime
 * values instead of placeholder zeros. Falls back to the persisted state
 * if metrics cannot be collected.
 */
async function getLiveDashboardState() {
  const state = readState();
  try {
    const { collectSystemMetrics } = require("./system-metrics");
    const metrics = await collectSystemMetrics();
    if (metrics) {
      state.system = {
        cpu: Math.round(metrics.cpu.percent),
        ram: Math.round(metrics.memory.percent),
        disk: Math.round(metrics.disk.percent),
        npu: 0,
        network: metrics.network.downloadMbps,
        processes: metrics.processes.count,
        uptime: metrics.uptime.human,
        hostname: metrics.hostname,
        platform: metrics.platform,
      };
      state.quickStats = [
        { label: "Active Tasks", value: String((state.tasks || []).length), accent: "teal" },
        { label: "CPU", value: `${Math.round(metrics.cpu.percent)}%`, accent: "pink" },
        { label: "Memory", value: `${Math.round(metrics.memory.percent)}%`, accent: "teal" },
        { label: "Processes", value: String(metrics.processes.count), accent: "pink" },
      ];
      state.lastSync = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    /* metrics unavailable — keep persisted state */
  }
  return state;
}



function addTaskLog(type, message, details = {}) {
  const state = readState();
  const taskEntry = {
    id: Date.now() + Math.random(),
    type,
    message,
    status: "completed",
    createdAt: new Date().toISOString(),
    ...details,
  };

  state.tasks = [
    taskEntry,
    ...(Array.isArray(state.tasks) ? state.tasks : []),
  ].slice(0, 12);
  state.logs = [
    message,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return taskEntry;
}

function createTask(input = {}) {
  const state = readState();
  const task = {
    id: `task-${Date.now()}`,
    title: input.title || "New task",
    owner: input.owner || "AI Team",
    priority: input.priority || "Medium",
    progress: Number(input.progress) || 0,
    status: input.status || "queued",
    updatedAt: new Date().toISOString(),
  };

  state.tasks = [
    task,
    ...(Array.isArray(state.tasks) ? state.tasks : []),
  ].slice(0, 20);
  state.logs = [
    `Task assigned: ${task.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return task;
}

function completeTask(taskId) {
  const state = readState();
  const task = (state.tasks || []).find((item) => item.id === taskId);

  if (!task) return null;

  const completed = {
    id: `${task.id}-done`,
    title: task.title,
    owner: task.owner,
    completedAt: new Date().toISOString(),
    result: "Completed",
  };

  state.tasks = (state.tasks || []).filter((item) => item.id !== taskId);
  state.completedHistory = [
    completed,
    ...(Array.isArray(state.completedHistory) ? state.completedHistory : []),
  ].slice(0, 12);
  state.logs = [
    `Completed task: ${task.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return completed;
}

function addIdea(input = {}) {
  const state = readState();
  const idea = {
    id: `idea-${Date.now()}`,
    title: input.title || "New ideation stream",
    category: input.category || "Growth",
    owner: input.owner || "AI Team",
    description: input.description || "Potential opportunity for exploration.",
  };

  state.brainstormIdeas = [
    idea,
    ...(Array.isArray(state.brainstormIdeas) ? state.brainstormIdeas : []),
  ].slice(0, 12);
  state.logs = [
    `Brainstorm idea added: ${idea.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return idea;
}

function addMeeting(input = {}) {
  const state = readState();
  const meeting = {
    id: `meeting-${Date.now()}`,
    title: input.title || "AI team sync",
    owner: input.owner || "Coordinator",
    time: input.time || "Today • 3:00 PM",
    agenda:
      Array.isArray(input.agenda) && input.agenda.length
        ? input.agenda
        : ["Project review", "Open blockers", "Next actions"],
  };

  state.meetingAgenda = [
    meeting,
    ...(Array.isArray(state.meetingAgenda) ? state.meetingAgenda : []),
  ].slice(0, 8);
  const summary = generateMeetingSummary(meeting, state);
  state.aiSummaries = [
    summary,
    ...(Array.isArray(state.aiSummaries) ? state.aiSummaries : []),
  ].slice(0, 6);
  state.logs = [
    `Meeting scheduled: ${meeting.title}`,
    ...(Array.isArray(state.logs) ? state.logs : []),
  ].slice(0, 10);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return meeting;
}

function addCommandHubUpdate(input = {}) {
  const state = readState();
  const update = {
    id: `update-${Date.now()}`,
    type: input.type || "info",
    title: input.title || "Command Hub update",
    description: input.description || "",
    installed: input.installed || false,
    createdAt: new Date().toISOString(),
  };

  state.commandHubUpdates = [
    update,
    ...(Array.isArray(state.commandHubUpdates) ? state.commandHubUpdates : []),
  ].slice(0, 20);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return update;
}

/* ============================================================
   Approval Requests — human-control queue for high/critical actions.
   Approvals are time-limited (default 15 min), single-use, and bound
   to the exact payload hash that was requested.
   ============================================================ */

const APPROVAL_TTL_MS = 15 * 60 * 1000;

function createApprovalRequest(input = {}) {
  const state = readState();
  const now = Date.now();
  const approval = {
    id: `approval-${now}-${Math.random().toString(36).slice(2, 8)}`,
    action: input.action || "unknown",
    riskTier: input.riskTier || "high",
    description: input.description || "",
    payloadHash: input.payloadHash || "",
    payloadPreview: input.payloadPreview || {},
    reason: input.reason || "Requested by autonomous agent",
    // Raw instruction retained SERVER-SIDE ONLY so an approved action can
    // execute exactly once. Never returned by the API layer.
    instruction: input.instruction || null,
    status: "pending", // pending | approved | rejected | expired | cancelled | executed
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
    decidedAt: null,
    decisionNote: "",
    executedResult: null,
  };

  // Expire stale pending approvals opportunistically.
  state.approvals = [
    approval,
    ...(Array.isArray(state.approvals) ? state.approvals : []),
  ]
    .map((item) =>
      item.status === "pending" && new Date(item.expiresAt).getTime() < now
        ? { ...item, status: "expired" }
        : item,
    )
    .slice(0, 50);

  // Persist the approval FIRST, then append the audit event as its own
  // read-modify-write so neither write clobbers the other.
  writeState(state);
  addAuditEvent({
    actor: "system",
    action: "approval.requested",
    objectType: "approval",
    objectId: approval.id,
    metadata: { actionType: approval.action, riskTier: approval.riskTier },
  });
  return approval;
}

function listApprovals(statusFilter) {
  const state = readState();
  let items = Array.isArray(state.approvals) ? [...state.approvals] : [];
  // Opportunistic expiry so the UI never shows a stale "pending".
  const now = Date.now();
  let changed = false;
  items = items.map((item) => {
    if (
      item.status === "pending" &&
      new Date(item.expiresAt).getTime() < now
    ) {
      changed = true;
      return { ...item, status: "expired" };
    }
    return item;
  });
  if (changed) {
    state.approvals = items;
    writeState(state);
  }
  if (statusFilter && statusFilter !== "all") {
    items = items.filter((item) => item.status === statusFilter);
  }
  return items;
}

/**
 * Decide an approval. Only valid while pending and unexpired.
 * Returns { ok, approval?, message? }.
 */
function decideApproval(id, decision, note = "") {
  const state = readState();
  const approval = (state.approvals || []).find((item) => item.id === id);
  if (!approval) {
    return { ok: false, message: "Approval request not found." };
  }
  if (approval.status !== "pending") {
    return {
      ok: false,
      message: `Approval is already ${approval.status}.`,
      approval,
    };
  }
  if (new Date(approval.expiresAt).getTime() < Date.now()) {
    approval.status = "expired";
    writeState(state);
    addAuditEvent({
      actor: "system",
      action: "approval.expired",
      objectType: "approval",
      objectId: approval.id,
      metadata: {},
    });
    return { ok: false, message: "Approval request has expired.", approval };
  }
  // (expiry branch keeps original order; both writes target distinct fields)
  if (!["approved", "rejected", "cancelled"].includes(decision)) {
    return { ok: false, message: `Invalid decision: ${decision}` };
  }

  approval.status = decision;
  approval.decidedAt = new Date().toISOString();
  approval.decisionNote = String(note || "").slice(0, 500);

  writeState(state);
  addAuditEvent({
    actor: "user",
    action: `approval.${decision}`,
    objectType: "approval",
    objectId: approval.id,
    metadata: {
      actionType: approval.action,
      note: approval.decisionNote || undefined,
    },
  });
  return { ok: true, approval };
}

/** Mark an approved request as executed (single-use enforcement). */
function markApprovalExecuted(id, result) {
  const state = readState();
  const approval = (state.approvals || []).find((item) => item.id === id);
  if (!approval) return { ok: false, message: "Approval not found." };
  if (approval.status !== "approved") {
    return {
      ok: false,
      message: `Approval is ${approval.status}; only approved requests can execute.`,
    };
  }
  approval.status = "executed";
  approval.executedResult =
    typeof result === "string" ? result.slice(0, 300) : "[completed]";
  writeState(state);
  addAuditEvent({
    actor: "system",
    action: "approval.executed",
    objectType: "approval",
    objectId: approval.id,
    metadata: { actionType: approval.action },
  });
  return { ok: true, approval };
}

/* ============================================================
   Audit Events — append-only trail of consequential activity.
   Metadata must already be redacted by the caller (server-policy).
   ============================================================ */

function addAuditEvent(input = {}) {
  const state = readState();
  const event = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actor: input.actor || "system", // user | system | provider | tool
    action: input.action || "unknown",
    objectType: input.objectType || "",
    objectId: input.objectId || "",
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  };
  state.auditEvents = [
    event,
    ...(Array.isArray(state.auditEvents) ? state.auditEvents : []),
  ].slice(0, 200);
  writeState(state);
  return event;
}

function listAuditEvents(limit = 100) {
  const state = readState();
  return (Array.isArray(state.auditEvents) ? state.auditEvents : []).slice(
    0,
    Math.min(Math.max(Number(limit) || 100, 1), 200),
  );
}

function generateDashboardSummary() {
  const state = readState();
  const activeTasks = Array.isArray(state.tasks) ? state.tasks.length : 0;
  const completed = Array.isArray(state.completedHistory)
    ? state.completedHistory.length
    : 0;
  const ideas = Array.isArray(state.brainstormIdeas)
    ? state.brainstormIdeas.length
    : 0;
  const nextMeeting =
    Array.isArray(state.meetingAgenda) && state.meetingAgenda.length
      ? state.meetingAgenda[0]
      : null;

  const summary = {
    id: `summary-${Date.now()}`,
    title: "AI operations update",
    summary: `The system is running with ${activeTasks} active tasks, ${completed} completed wins, and ${ideas} ideation streams. ${nextMeeting ? `The next focus is ${nextMeeting.title}.` : "The pipeline is healthy and ready for the next cycle."}`,
    owner: "AI Team",
    generatedAt: new Date().toISOString(),
  };

  state.aiSummaries = [
    summary,
    ...(Array.isArray(state.aiSummaries) ? state.aiSummaries : []),
  ].slice(0, 6);
  state.lastSync = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  writeState(state);
  return summary;
}

/* ============================================================
   Plans — versioned task plans with steps, assumptions, risks.
   Each revision creates a new version; prior versions are
   superseded, never overwritten.
   ============================================================ */

function createPlan(input = {}) {
  const state = readState();
  const taskId = input.taskId || "";
  const existing = (state.plans || []).filter((p) => p.taskId === taskId);
  const version = existing.length > 0
    ? Math.max(...existing.map((p) => p.version || 0)) + 1
    : 1;

  const plan = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId,
    version,
    status: "draft",
    author: input.author || "system",
    summary: String(input.summary || "").slice(0, 2000),
    assumptions: Array.isArray(input.assumptions)
      ? input.assumptions.slice(0, 20)
      : [],
    risks: Array.isArray(input.risks) ? input.risks.slice(0, 20) : [],
    createdAt: new Date().toISOString(),
    approvedAt: null,
  };

  state.plans = [plan, ...(state.plans || [])].slice(0, 100);

  // Create plan steps if provided.
  if (Array.isArray(input.steps)) {
    const steps = input.steps.map((s, i) => ({
      id: `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      planId: plan.id,
      taskId,
      position: i,
      title: String(s.title || `Step ${i + 1}`).slice(0, 200),
      purpose: String(s.purpose || "").slice(0, 500),
      dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
      toolClass: String(s.toolClass || "").slice(0, 100),
      inputSummary: String(s.inputSummary || "").slice(0, 500),
      expectedOutput: String(s.expectedOutput || "").slice(0, 500),
      riskTier: ["low", "moderate", "high", "critical"].includes(s.riskTier)
        ? s.riskTier
        : "low",
      requiresApproval: Boolean(s.requiresApproval),
      status: "pending",
      estimatedDuration: Number(s.estimatedDuration) || null,
      estimatedCost: Number(s.estimatedCost) || null,
      retryPolicy: s.retryPolicy || { maxRetries: 0 },
    }));
    state.planSteps = [...steps, ...(state.planSteps || [])].slice(0, 500);
  }

  writeState(state);
  addAuditEvent({
    actor: input.author || "system",
    action: "plan.created",
    objectType: "plan",
    objectId: plan.id,
    metadata: { taskId, version },
  });
  return plan;
}

function getPlan(planId) {
  const state = readState();
  const plan = (state.plans || []).find((p) => p.id === planId);
  if (!plan) return null;
  const steps = (state.planSteps || []).filter((s) => s.planId === planId);
  return { ...plan, steps };
}

function getPlansForTask(taskId) {
  const state = readState();
  const plans = (state.plans || []).filter((p) => p.taskId === taskId);
  return plans.map((plan) => ({
    ...plan,
    steps: (state.planSteps || []).filter((s) => s.planId === plan.id),
  }));
}

function updatePlanStatus(planId, status, actor = "user") {
  const state = readState();
  const plan = (state.plans || []).find((p) => p.id === planId);
  if (!plan) return { ok: false, message: "Plan not found." };

  // Supersede prior versions when a new draft is approved.
  if (status === "approved") {
    for (const p of state.plans || []) {
      if (p.taskId === plan.taskId && p.id !== planId && p.status === "approved") {
        p.status = "superseded";
      }
    }
    plan.status = "approved";
    plan.approvedAt = new Date().toISOString();
  } else if (["draft", "rejected", "superseded"].includes(status)) {
    plan.status = status;
  } else {
    return { ok: false, message: `Invalid plan status: ${status}` };
  }

  writeState(state);
  addAuditEvent({
    actor,
    action: `plan.${status}`,
    objectType: "plan",
    objectId: plan.id,
    metadata: { taskId: plan.taskId, version: plan.version },
  });
  return { ok: true, plan };
}

/* ============================================================
   Runs — execution attempts for a task/plan.
   ============================================================ */

function createRun(input = {}) {
  const state = readState();
  const run = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: input.taskId || "",
    planId: input.planId || "",
    status: "queued",
    attemptCount: (input.attemptCount || 0) + 1,
    parentRunId: input.parentRunId || null,
    provider: input.provider || "",
    toolSummary: input.toolSummary || "",
    startedAt: null,
    endedAt: null,
    failureClassification: null,
    budgetUsed: 0,
    timeUsedMs: 0,
    createdAt: new Date().toISOString(),
  };

  state.runs = [run, ...(state.runs || [])].slice(0, 100);
  writeState(state);
  addRunEvent(run.id, run.taskId, "run.created", "Run created", "system");
  return run;
}

function updateRunStatus(runId, status, details = {}) {
  const state = readState();
  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) return { ok: false, message: "Run not found." };

  run.status = status;
  if (status === "active" && !run.startedAt) {
    run.startedAt = new Date().toISOString();
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(status)) {
    run.endedAt = new Date().toISOString();
    if (run.startedAt) {
      run.timeUsedMs = Date.now() - new Date(run.startedAt).getTime();
    }
    run.failureClassification = details.failureClassification || null;
  }

  writeState(state);
  addRunEvent(
    runId,
    run.taskId,
    `run.${status}`,
    details.summary || `Run status: ${status}`,
    details.actor || "system",
    details.metadata || {},
  );
  return { ok: true, run };
}

function getRun(runId) {
  const state = readState();
  const run = (state.runs || []).find((r) => r.id === runId);
  if (!run) return null;
  const events = (state.runEvents || []).filter((e) => e.runId === runId);
  return { ...run, events };
}

function getRunsForTask(taskId) {
  const state = readState();
  return (state.runs || []).filter((r) => r.taskId === taskId);
}

/* ============================================================
   Run Events — ordered, typed activity timeline for a run.
   ============================================================ */

function addRunEvent(runId, taskId, eventName, summary, actor = "system", metadata = {}) {
  const state = readState();
  const existing = (state.runEvents || []).filter((e) => e.runId === runId);
  const seq = existing.length > 0
    ? Math.max(...existing.map((e) => e.sequence || 0)) + 1
    : 0;

  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    runId,
    taskId,
    sequence: seq,
    event: eventName,
    summary: String(summary).slice(0, 500),
    metadata: metadata || {},
    actor,
    createdAt: new Date().toISOString(),
  };

  state.runEvents = [event, ...(state.runEvents || [])].slice(0, 500);
  writeState(state);
  return event;
}

function getRunEvents(runId) {
  const state = readState();
  return (state.runEvents || [])
    .filter((e) => e.runId === runId)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
}

/* ============================================================
   Artifacts — outputs with provenance and state tracking.
   ============================================================ */

function createArtifact(input = {}) {
  const state = readState();
  const artifact = {
    id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: input.taskId || "",
    runId: input.runId || "",
    type: String(input.type || "document").slice(0, 50),
    displayName: String(input.displayName || "Untitled artifact").slice(0, 200),
    mediaType: String(input.mediaType || "text/markdown").slice(0, 100),
    storageRef: String(input.storageRef || "").slice(0, 500),
    contentHash: String(input.contentHash || "").slice(0, 64),
    sizeBytes: Number(input.sizeBytes) || 0,
    state: "draft",
    summary: String(input.summary || "").slice(0, 1000),
    provenance: input.provenance || {},
    createdBy: input.createdBy || "system",
    createdAt: new Date().toISOString(),
  };

  state.artifacts = [artifact, ...(state.artifacts || [])].slice(0, 200);
  writeState(state);
  addAuditEvent({
    actor: input.createdBy || "system",
    action: "artifact.created",
    objectType: "artifact",
    objectId: artifact.id,
    metadata: { taskId: artifact.taskId, type: artifact.type },
  });
  return artifact;
}

function updateArtifactState(artifactId, newState, actor = "system") {
  const state = readState();
  const artifact = (state.artifacts || []).find((a) => a.id === artifactId);
  if (!artifact) return { ok: false, message: "Artifact not found." };
  if (!["draft", "ready", "archived", "deleted"].includes(newState)) {
    return { ok: false, message: `Invalid artifact state: ${newState}` };
  }
  artifact.state = newState;
  writeState(state);
  addAuditEvent({
    actor,
    action: `artifact.${newState}`,
    objectType: "artifact",
    objectId: artifact.id,
    metadata: {},
  });
  return { ok: true, artifact };
}

function getArtifacts(filter = {}) {
  const state = readState();
  let items = [...(state.artifacts || [])];
  if (filter.taskId) items = items.filter((a) => a.taskId === filter.taskId);
  if (filter.runId) items = items.filter((a) => a.runId === filter.runId);
  if (filter.type) items = items.filter((a) => a.type === filter.type);
  if (filter.state) items = items.filter((a) => a.state === filter.state);
  return items;
}

/* ============================================================
   Sources — provenance for research/fetched content.
   ============================================================ */

function addSource(input = {}) {
  const state = readState();
  const source = {
    id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: input.taskId || "",
    runId: input.runId || "",
    url: String(input.url || "").slice(0, 1000),
    fileRef: String(input.fileRef || "").slice(0, 500),
    title: String(input.title || "").slice(0, 300),
    author: String(input.author || "").slice(0, 200),
    retrievedAt: new Date().toISOString(),
    excerpt: String(input.excerpt || "").slice(0, 2000),
    trustLabel: input.trustLabel || "unverified",
    sensitivityLabel: input.sensitivityLabel || "internal",
  };
  state.sources = [source, ...(state.sources || [])].slice(0, 200);
  writeState(state);
  return source;
}

module.exports = {
  STATE_PATH,
  defaultState,
  ensureState,
  readState,
  writeState,
  getDashboardState,
  getLiveDashboardState,
  addTaskLog,

  createTask,
  completeTask,
  addIdea,
  addMeeting,
  addProjectMilestone,
  addMeetingNote,
  addCommandHubUpdate,
  generateMeetingSummary,
  generateDashboardSummary,

  APPROVAL_TTL_MS,
  createApprovalRequest,
  listApprovals,
  decideApproval,
  markApprovalExecuted,
  addAuditEvent,
  listAuditEvents,

  // Plans
  createPlan,
  getPlan,
  getPlansForTask,
  updatePlanStatus,

  // Runs
  createRun,
  updateRunStatus,
  getRun,
  getRunsForTask,

  // Run events
  addRunEvent,
  getRunEvents,

  // Artifacts
  createArtifact,
  updateArtifactState,
  getArtifacts,

  // Sources
  addSource,
};
