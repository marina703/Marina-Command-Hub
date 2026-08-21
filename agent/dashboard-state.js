const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(__dirname, "dashboard-state.json");

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
};
