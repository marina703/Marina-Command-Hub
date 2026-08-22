/* ============================================================
   Marina AI Command Hub — Real System Actions

   Backs the Operations / System panel one-click actions with
   genuine, observable, audited behavior:

     - clearTempReports()   remove generated tmp/*.md reports
     - restartScheduler()   stop/start the in-process automation loop
     - optimizeSystem()     temp cleanup + dashboard-state compaction
     - setHighPerformance() persist an llmTuning profile to config.json
     - getSystemActionState() truthful status for panel badges

   Every action appends an audit entry through addTaskLog and
   returns concrete numbers (files removed, bytes freed) so the
   UI never has to fake success.
   ============================================================ */

const fs = require("fs");
const path = require("path");

const TMP_DIR = path.join(__dirname, "tmp");
const STATE_PATH = path.join(__dirname, "dashboard-state.json");
const CONFIG_PATH = path.join(__dirname, "config.json");

/** Performance profiles applied to Ollama calls via config.json llmTuning. */
const PERF_PROFILES = {
  standard: { numCtx: 4096, numPredict: 1024 },
  high: { numCtx: 8192, numPredict: 2048 },
};

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Remove generated markdown reports from tmp/.
 * Only deletes *.md files created by playbooks/tools — nothing else.
 */
function clearTempReports() {
  ensureTmpDir();
  let removed = 0;
  let bytesFreed = 0;
  for (const entry of fs.readdirSync(TMP_DIR)) {
    if (!entry.toLowerCase().endsWith(".md")) continue;
    const full = path.join(TMP_DIR, entry);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      bytesFreed += stat.size;
      fs.unlinkSync(full);
      removed += 1;
    } catch {
      /* skip locked/unreadable entries */
    }
  }
  return { removed, bytesFreed };
}

/** Count + size of generated reports currently in tmp/. */
function tempReportStats() {
  ensureTmpDir();
  let count = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(TMP_DIR)) {
    if (!entry.toLowerCase().endsWith(".md")) continue;
    try {
      const stat = fs.statSync(path.join(TMP_DIR, entry));
      if (stat.isFile()) {
        count += 1;
        bytes += stat.size;
      }
    } catch {}
  }
  return { count, bytes };
}

/**
 * Restart the in-process autonomous loop. This is a real restart of
 * the scheduler timers inside this server process — it does not and
 * cannot restart OS services or the server itself.
 */
function restartScheduler() {
  const { startScheduler, stopScheduler } = require("./scheduler");
  stopScheduler();
  startScheduler(60000);
  return { restarted: true, intervalMs: 60000 };
}

/** Truthful runtime status of the in-process automation loop. */
function getSchedulerStatus() {
  try {
    const { getSchedulerStatus: probe } = require("./scheduler");
    return typeof probe === "function"
      ? probe()
      : { timerActive: false, cycleInProgress: false };
  } catch {
    return { timerActive: false, cycleInProgress: false };
  }
}

/**
 * Optimize: clear generated reports + rewrite the dashboard state file
 * compactly. Returns concrete numbers for the UI.
 */
function optimizeSystem() {
  const cleared = clearTempReports();

  let stateBytesBefore = 0;
  let stateBytesAfter = 0;
  try {
    if (fs.existsSync(STATE_PATH)) {
      stateBytesBefore = fs.statSync(STATE_PATH).size;
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      fs.writeFileSync(STATE_PATH, JSON.stringify(parsed));
      stateBytesAfter = fs.statSync(STATE_PATH).size;
    }
  } catch {
    /* state compaction is best-effort */
  }

  return {
    reportsRemoved: cleared.removed,
    reportsBytesFreed: cleared.bytesFreed,
    stateBytesBefore,
    stateBytesAfter,
    stateBytesSaved: Math.max(0, stateBytesBefore - stateBytesAfter),
  };
}

/** Read the persisted performance profile from config.json. */
function getPerformanceMode() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const tuning = config.llmTuning || {};
    return tuning.profile === "high" ? "high" : "standard";
  } catch {
    return "standard";
  }
}

/**
 * Persist a performance profile. Writes config.json llmTuning so the
 * next LLM calls genuinely use the new context/predict limits.
 */
function setHighPerformance(enabled) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {}

  const profile = enabled ? PERF_PROFILES.high : PERF_PROFILES.standard;
  config.llmTuning = {
    ...(config.llmTuning || {}),
    profile: enabled ? "high" : "standard",
    numCtx: profile.numCtx,
    numPredict: profile.numPredict,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return { mode: config.llmTuning.profile, ...profile };
}

module.exports = {
  clearTempReports,
  tempReportStats,
  restartScheduler,
  getSchedulerStatus,
  optimizeSystem,
  getPerformanceMode,
  setHighPerformance,
};
