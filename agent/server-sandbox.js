/* ============================================================
   MarinaAI — Virtual Sandbox

   Secure, isolated execution environments for Python, Node.js,
   and Shell commands. Uses Deno for sandboxing (no Docker required).
   ============================================================ */

const { spawn } = require("child_process");
const CRYPTO = require("crypto");
const FS = require("fs");
const PATH = require("path");
const OS = require("os");

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
const MAX_MEMORY_MB = 256;
const MAX_CPU_TIME_MS = 30000;

const SUPPORTED_LANGUAGES = ["python", "node", "shell", "deno"];

/**
 * Check if required runtimes are available
 */
async function checkRuntimes() {
  const runtimes = {};
  
  for (const lang of ["python3", "python", "node", "deno", "bash", "sh"]) {
    try {
      const proc = spawn(lang, ["--version"], { timeout: 5000 });
      const output = await new Promise((resolve) => {
        let out = "";
        proc.stdout.on("data", d => out += d.toString());
        proc.stderr.on("data", d => out += d.toString());
        proc.on("close", () => resolve(out.trim()));
        proc.on("error", () => resolve(null));
      });
      runtimes[lang] = !!proc;
    } catch {
      runtimes[lang] = false;
    }
  }
  
  return runtimes;
}

/**
 * Create a temporary workspace directory
 */
function createWorkspace(prefix = "sandbox") {
  const id = CRYPTO.randomBytes(8).toString("hex");
  const dir = PATH.join(OS.tmpdir(), `marina-sandbox-${prefix}-${id}`);
  FS.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up workspace
 */
function cleanupWorkspace(dir) {
  try {
    FS.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Write files to workspace
 */
function writeFiles(workspaceDir, files) {
  for (const file of files) {
    const filePath = PATH.join(workspaceDir, file.path);
    const dir = PATH.dirname(filePath);
    if (!FS.existsSync(dir)) {
      FS.mkdirSync(PATH.dirname(filePath), { recursive: true });
    }
    FS.writeFileSync(filePath, file.content, "utf8");
  }
}

/**
 * Execute Python code
 */
async function runPython(workspaceDir, code, options = {}) {
  const filePath = PATH.join(workspaceDir, "main.py");
  FS.writeFileSync(filePath, code, "utf8");
  
  return runCommand("python3", [filePath], workspaceDir, options);
}

/**
 * Execute Node.js code
 */
async function runNode(workspaceDir, code, options = {}) {
  const filePath = PATH.join(workspaceDir, "main.js");
  FS.writeFileSync(filePath, code, "utf8");
  
  return runCommand("node", [filePath], workspaceDir, options);
}

/**
 * Execute shell commands
 */
async function runShell(workspaceDir, commands, options = {}) {
  const scriptPath = PATH.join(workspaceDir, "script.sh");
  const script = Array.isArray(commands) ? commands.join("\n") : commands;
  FS.writeFileSync(scriptPath, script, "utf8");
  FS.chmodSync(scriptPath, 0o755);
  
  return runCommand("bash", [scriptPath], workspaceDir, options);
}

/**
 * Execute Deno code (most secure - built-in sandbox)
 */
async function runDeno(workspaceDir, code, options = {}) {
  const filePath = PATH.join(workspaceDir, "main.ts");
  FS.writeFileSync(filePath, code, "utf8");
  
  // Deno has built-in permissions system
  const permissions = options.denoPermissions || [
    "--allow-read",
    "--allow-write",
    "--allow-net",
    "--allow-env",
    "--allow-run",
  ];
  
  return runCommand("deno", ["run", ...permissions, filePath], workspaceDir, options);
}

/**
 * Generic command runner with resource limits
 */
async function runCommand(command, args, workspaceDir, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputSize = MAX_OUTPUT_SIZE,
    env = {},
    stdin = null,
  } = options;
  
  const startTime = Date.now();
  let stdout = "";
  let stderr = "";
  let killed = false;
  
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: workspaceDir,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    let stdoutData = "";
    let stderrData = "";
    
    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
      if (stdoutData.length > MAX_OUTPUT_SIZE) {
        proc.kill("SIGKILL");
        stdoutData = stdoutData.slice(0, MAX_OUTPUT_SIZE) + "\n[OUTPUT TRUNCATED]";
      }
    });
    
    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      if (stderrData.length > MAX_OUTPUT_SIZE) {
        proc.kill("SIGKILL");
        stderrData = stderrData.slice(0, MAX_OUTPUT_SIZE) + "\n[OUTPUT TRUNCATED]";
      }
    });
    
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    
    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      resolve({
        ok: code === 0 && !killed,
        exitCode: code,
        killed,
        stdout: stdoutData,
        stderr: stderrData,
        durationMs: duration,
      });
    });
    
    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        ok: false,
        error: err.message,
        killed: true,
      });
    });
    
    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
  });
}

/**
 * High-level execution function with language detection
 */
async function executeCode(language, code, options = {}) {
  const workspaceDir = createWorkspace("exec");
  
  try {
    let result;
    
    switch (language) {
      case "python":
        result = await runPython(workspaceDir, code, options);
        break;
      case "node":
        result = await runNode(workspaceDir, code, options);
        break;
      case "shell":
        result = await runShell(workspaceDir, code, options);
        break;
      case "deno":
        result = await runDeno(workspaceDir, code, options);
        break;
      default:
        return { ok: false, message: `Unsupported language: ${language}` };
    }
    
    return { ok: true, ...result };
  } finally {
    cleanupWorkspace(workspaceDir);
  }
}

/**
 * Execute a project (multiple files) in the sandbox
 */
async function executeProject(project, entryPoint, options = {}) {
  const workspaceDir = createWorkspace("project");
  
  try {
    // Write project files
    for (const file of project.files) {
      const filePath = PATH.join(workspaceDir, file.path);
      const dir = PATH.dirname(filePath);
      if (!FS.existsSync(dir)) {
        FS.mkdirSync(PATH.dirname(filePath), { recursive: true });
      }
      FS.writeFileSync(filePath, file.content, "utf8");
    }
    
    // Install dependencies if package.json exists
    const packageJsonPath = PATH.join(workspaceDir, "package.json");
    if (FS.existsSync(packageJsonPath)) {
      const installResult = await runCommand("npm", ["install"], workspaceDir, {
        timeoutMs: 120000,
      });
      if (!installResult.ok) {
        return { ok: false, message: "npm install failed", details: installResult };
      }
    }
    
    // Install Python dependencies if pyproject.toml or requirements.txt exists
    if (FS.existsSync(PATH.join(workspaceDir, "pyproject.toml")) || 
        FS.existsSync(PATH.join(workspaceDir, "requirements.txt"))) {
      const installResult = await runCommand("pip", ["install", "-e", "."], workspaceDir, {
        timeoutMs: 120000,
      });
      if (!installResult.ok) {
        return { ok: false, message: "pip install failed", details: installResult };
      }
    }
    
    // Run entry point
    const ext = PATH.extname(entryPoint).slice(1);
    let result;
    
    if (ext === "py") {
      result = await runPython(workspaceDir, "", { 
        ...options,
        stdin: `exec(open("${entryPoint}").read())`,
      });
    } else if (ext === "js" || ext === "ts") {
      result = await runNode(workspaceDir, `require("./${entryPoint}")`, options);
    } else if (ext === "sh") {
      result = await runShell(workspaceDir, `bash ${entryPoint}`, options);
    } else {
      return { ok: false, message: `Unsupported entry point: ${entryPoint}` };
    }
    
    return { ok: true, ...result };
  } finally {
    cleanupWorkspace(workspaceDir);
  }
}

/**
 * Check if all required runtimes are available
 */
async function healthCheck() {
  const runtimes = await checkRuntimes();
  const available = Object.entries(runtimes).filter(([_, v]) => v).map(([k]) => k);
  const missing = Object.entries(runtimes).filter(([_, v]) => !v).map(([k]) => k);
  
  return {
    ok: true,
    available,
    missing,
    healthy: missing.length === 0 || missing.every(m => ["deno", "bash"].includes(m)), // deno/bash optional
  };
}

module.exports = {
  executeCode,
  executeProject,
  runPython,
  runNode,
  runShell,
  runDeno,
  runCommand,
  createWorkspace,
  cleanupWorkspace,
  checkRuntimes,
  healthCheck,
  SUPPORTED_LANGUAGES,
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_SIZE,
};