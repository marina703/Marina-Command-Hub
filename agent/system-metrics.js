const os = require("os");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");


/**
 * Live System Metrics Collector
 * Pulls real telemetry from the OS via Node's built-in `os` module (no
 * external dependencies). Returns CPU, memory, disk, network, process,
 * uptime, and (when available) temperature readings.
 */

// Track the previous CPU tick counts to compute a real utilization delta.
let prevCpuTimes = os.cpus().map((c) => c.times);

function computeCpuUsage() {
  const cpus = os.cpus();
  const current = cpus.map((c) => c.times);
  let idleDelta = 0;
  let totalDelta = 0;

  for (let i = 0; i < cpus.length; i++) {
    const prev = prevCpuTimes[i] || { idle: 0, user: 0, nice: 0, sys: 0, irq: 0 };
    const now = current[i];
    const prevTotal =
      prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const nowTotal = now.user + now.nice + now.sys + now.idle + now.irq;
    idleDelta += now.idle - prev.idle;
    totalDelta += nowTotal - prevTotal;
  }

  prevCpuTimes = current;

  if (totalDelta <= 0) return 0;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.round(usage * 10) / 10;
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = total > 0 ? (used / total) * 100 : 0;
  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    percent: Math.round(percent * 10) / 10,
  };
}

function getDiskUsage() {
  // Best-effort disk utilization. On Windows we read the root volume free
  // space via fs.statfs (Node 18.15+). Fall back to a conservative estimate.
  try {
    const stats = fs.statfsSync(path.parse(process.cwd()).root);
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    const percent = total > 0 ? (used / total) * 100 : 0;
    return {
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      percent: Math.round(percent * 10) / 10,
    };
  } catch {
    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      percent: 0,
    };
  }
}

function getNetworkThroughput() {
  // os.networkInterfaces() gives addresses, not throughput. We report the
  // number of active network interfaces and a live "link" indicator. For a
  // real throughput number we'd need a sampling counter; here we expose the
  // interface count and a synthetic 0 baseline that the UI can animate.
  const ifaces = os.networkInterfaces();
  let active = 0;
  for (const key of Object.keys(ifaces)) {
    const list = ifaces[key] || [];
    if (list.some((i) => i.family === "IPv4" && !i.internal)) active++;
  }
  return {
    activeInterfaces: active,
    uploadMbps: 0,
    downloadMbps: 0,
  };
}

function getTemperature() {
  // Node has no cross-platform temperature API. On Linux we could read
  // /sys/class/thermal, but on Windows this is unavailable. Return null so
  // the UI can hide the card gracefully.
  try {
    if (process.platform === "linux") {
      const raw = fs.readFileSync(
        "/sys/class/thermal/thermal_zone0/temp",
        "utf8",
      );
      const millideg = parseInt(raw, 10);
      if (!Number.isNaN(millideg)) {
        return { celsius: Math.round((millideg / 1000) * 10) / 10 };
      }
    }
  } catch {
    /* temperature unavailable */
  }
  return null;
}

/** Best-effort count of running processes (async, non-blocking). */
function countProcesses() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile(
        "tasklist",
        ["/FO", "CSV", "/NH"],
        { timeout: 3000 },
        (err, stdout) => {
          if (err) return resolve(0);
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
          resolve(lines.length);
        },
      );
    } else {
      execFile("ps", ["-e", "--no-headers"], { timeout: 3000 }, (err, stdout) => {
        if (err) return resolve(0);
        resolve(stdout.split(/\r?\n/).filter((l) => l.trim()).length);
      });
    }
  });
}

/**
 * Collect a full snapshot of live system metrics.
 * @returns {Promise<object>} structured telemetry payload
 */
async function collectSystemMetrics() {
  const cpu = computeCpuUsage();
  const mem = getMemoryUsage();
  const disk = getDiskUsage();
  const net = getNetworkThroughput();
  const temp = getTemperature();
  const processCount = await countProcesses();

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: {
      percent: cpu,
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || "unknown",
      loadAvg: os.loadavg(),
    },
    memory: {
      percent: mem.percent,
      usedBytes: mem.usedBytes,
      totalBytes: mem.totalBytes,
      freeBytes: mem.freeBytes,
    },
    disk: {
      percent: disk.percent,
      usedBytes: disk.usedBytes,
      totalBytes: disk.totalBytes,
      freeBytes: disk.freeBytes,
    },
    network: {
      activeInterfaces: net.activeInterfaces,
      uploadMbps: net.uploadMbps,
      downloadMbps: net.downloadMbps,
    },
    processes: {
      count: processCount,
    },
    uptime: {
      seconds: Math.floor(os.uptime()),
      human: formatUptime(os.uptime()),
    },
    temperature: temp,
  };
}


function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

module.exports = { collectSystemMetrics };
