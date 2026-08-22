const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  processInstruction,
  askLLM,
  getLLMConfig,
  collectProjectContext,
} = require("./agent");
const {
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

  createApprovalRequest,
  listApprovals,
  decideApproval,
  markApprovalExecuted,
  addAuditEvent,
  listAuditEvents,
} = require("./dashboard-state");
const {
  startScheduler,
  generateStandupBrief,
  runAutonomousLoop,
} = require("./scheduler");
const { handleVoiceInput, startVoiceWatcher } = require("./listener");
const {
  runIdeaToExecutionPlaybook,
  runSiteAuditPlaybook,
  runFastSOPPlaybook,
  runPlaybookById,
} = require("./playbooks");
const { collectSystemMetrics } = require("./system-metrics");
const systemActions = require("./system-actions");
const {
  classifyRisk,
  redactPayload,
  payloadHash,
  describeInstruction,
  policyVeto,
} = require("./server-policy");
const { effectivePermission } = require("./agent");



const PORT = process.env.PORT || 3000;
const forcedPublicDir = path.join(__dirname, "dashboard", "public");
const publicDir = fs.existsSync(forcedPublicDir) ? forcedPublicDir : __dirname;

// Vite build output. When present, it takes precedence over the legacy
// static files so the modern React dashboard is served. Falls back to the
// static dirs below if the build has not been produced yet.
const distDir = path.join(__dirname, "dist");
const hasDist = fs.existsSync(path.join(distDir, "index.html"));


const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  // Guard against double-send. If the response has already been written
  // (e.g. a slow async callback resolving after a timeout or a duplicate
  // handler invocation), writing again throws ERR_HTTP_HEADERS_SENT and
  // crashes the whole server. Silently ignore instead.
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

// Live Ollama backend status: version, loaded model, and compute processor
// (GPU vs CPU). Used by /api/health and /api/ollama/status.
function getOllamaStatus() {
  return new Promise((resolve) => {
    const config = getLLMConfig();
    const base = (config.ollamaBaseUrl || "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    let parsed;
    try {
      parsed = new URL(base);
    } catch {
      return resolve({ ok: false, error: "invalid base url" });
    }

    const versionReq = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || 11434,
        path: "/api/version",
        timeout: 3000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          let version = "unknown";
          try {
            version = JSON.parse(data).version || version;
          } catch {}

          // Check which models are currently loaded and on what processor
          const psReq = http.get(
            {
              hostname: parsed.hostname,
              port: parsed.port || 11434,
              path: "/api/ps",
              timeout: 3000,
            },
            (res2) => {
              let data2 = "";
              res2.on("data", (c) => {
                data2 += c;
              });
              res2.on("end", () => {
                let models = [];
                let active = null;
                try {
                  models = (JSON.parse(data2).models || []).map((m) => ({
                    name: m.name,
                    sizeGB: m.size ? Math.round(m.size / 1024) : null,
                    processor: m.processor || "unknown",
                    context: m.context || null,
                  }));
                } catch {
                  models = [];
                }
                if (models.length > 0) {
                  const first = models[0];
                  active = {
                    name: first.name,
                    processor: first.processor,
                    context: first.context,
                  };
                }
                resolve({
                  ok: true,
                  version,
                  model: config.model,
                  activeModel: active,
                  models,
                  gpu: models.some((m) =>
                    String(m.processor || "").includes("GPU"),
                  ),
                });
              });
            },
          );
          psReq.on("error", () => {
            resolve({
              ok: true,
              version,
              model: config.model,
              activeModel: null,
              models: [],
              gpu: false,
            });
          });
          psReq.setTimeout(3000, () => {
            psReq.destroy();
            resolve({
              ok: true,
              version,
              model: config.model,
              activeModel: null,
              models: [],
              gpu: false,
            });
          });
        });
      },
    );
    versionReq.on("error", () => {
      resolve({ ok: false, error: "unreachable" });
    });
    versionReq.setTimeout(3000, () => {
      versionReq.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function serveStaticFile(req, res) {
  // Prefer the Vite build output (dist/) when it exists; otherwise fall back
  // to the legacy static files so the app still works pre-build.
  const rootDir = hasDist ? distDir : publicDir;

  const defaultPath = fs.existsSync(path.join(rootDir, "index.html"))
    ? "/index.html"
    : "/ui/index.html";
  const requestPath = req.url === "/" ? defaultPath : req.url;
  const safePath = path.normalize(requestPath).replace(/^\/+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: for the Vite build, unknown paths (client-side routes)
      // should return index.html so React Router / view state can handle them.
      if (hasDist && requestPath !== "/ui/index.html") {
        fs.readFile(path.join(distDir, "index.html"), (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(indexData);
        });
        return;
      }

      if (requestPath === "/ui/index.html" || requestPath === "/") {
        fs.readFile(
          path.join(publicDir, "ui", "index.html"),
          (indexErr, indexData) => {
            if (indexErr) {
              res.writeHead(404, {
                "Content-Type": "text/plain; charset=utf-8",
              });
              res.end("Not found");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(indexData);
          },
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}


async function handleExecution(req, res) {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const task = payload.task || payload;

      if (!task || !task.action) {
        return sendJson(res, 400, {
          ok: false,
          message: "Task action is required.",
        });
      }

      const result = await processInstruction(task);
      addTaskLog(task.action, `Executed ${task.action}`, {
        payload: task.payload || {},
      });
      return sendJson(res, 200, {
        ok: true,
        message: "Task executed successfully.",
        task,
        result,
      });
    } catch (error) {
      addTaskLog("error", `Failed: ${error.message || "Execution failed."}`, {
        payload: body || {},
      });
      return sendJson(res, 500, {
        ok: false,
        message: error.message || "Execution failed.",
      });
    }
  });
}

async function handleDashboardMutation(req, res) {
  try {
    const payload = await readJsonBody(req);
    const action = payload.action || "";

    if (action === "createTask") {
      const task = createTask(payload.task || payload);
      return sendJson(res, 200, { ok: true, task });
    }

    if (action === "completeTask") {
      const completed = completeTask(payload.taskId || payload.id);
      return sendJson(res, 200, { ok: !!completed, completed });
    }

    if (action === "addIdea") {
      const idea = addIdea(payload.idea || payload);
      return sendJson(res, 200, { ok: true, idea });
    }

    if (action === "addMeeting") {
      const meeting = addMeeting(payload.meeting || payload);
      return sendJson(res, 200, { ok: true, meeting });
    }

    return sendJson(res, 400, {
      ok: false,
      message:
        "Supported actions: createTask, completeTask, addIdea, addMeeting.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      message: error.message || "Mutation failed.",
    });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    // Top-level safety net: never let an uncaught error (e.g. a malformed
    // JSON body rejecting readJsonBody) crash the whole server. Return a
    // clean 400/500 instead.
    try {
      if (!res.headersSent) {
        sendJson(res, 400, {
          ok: false,
          message: err.message || "Bad request.",
        });
      }
    } catch {
      // Response already sent or connection closed; nothing more to do.
    }
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/dashboard" && req.method === "POST") {
    return handleDashboardMutation(req, res);
  }

  if (url.pathname === "/api/dashboard") {
    const liveState = await getLiveDashboardState();
    return sendJson(res, 200, liveState);
  }


  if (url.pathname === "/api/tasks" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const task = createTask(payload);
    return sendJson(res, 200, { ok: true, task });
  }

  if (url.pathname === "/api/tasks/complete" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const completed = completeTask(payload.taskId || payload.id);
    return sendJson(res, 200, { ok: !!completed, completed });
  }

  if (url.pathname === "/api/ideas" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const idea = addIdea(payload);
    return sendJson(res, 200, { ok: true, idea });
  }

  if (url.pathname === "/api/meetings" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const meeting = addMeeting(payload);
    return sendJson(res, 200, { ok: true, meeting });
  }

  if (url.pathname === "/api/meetings/summary" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const state = getDashboardState();
    const summary = generateMeetingSummary(payload, state);
    return sendJson(res, 200, { ok: true, summary });
  }

  if (url.pathname === "/api/projects" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const milestone = addProjectMilestone(payload);
    return sendJson(res, 200, { ok: true, milestone });
  }

  if (url.pathname === "/api/notes" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const note = addMeetingNote(payload);
    return sendJson(res, 200, { ok: true, note });
  }

  if (url.pathname === "/api/summary" && req.method === "POST") {
    const summary = generateDashboardSummary();
    return sendJson(res, 200, { ok: true, summary });
  }

  if (url.pathname === "/api/ollama/status") {
    const ollama = await getOllamaStatus();
    return sendJson(res, 200, { ok: true, ollama });
  }

  if (url.pathname === "/api/health") {
    const state = getDashboardState();
    const config = getLLMConfig();
    const ollama = await getOllamaStatus();
    return sendJson(res, 200, {
      status: state.status,
      mode: state.mode,
      service: "Marina AI Command Hub",
      timestamp: new Date().toISOString(),
      system: state.system,
      llm: {
        provider: config.provider,
        model: config.model,
        ollama,
      },
    });
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    const config = getLLMConfig();
    return sendJson(res, 200, {
      provider: config.provider,
      model: config.model,
      geminiModel: config.geminiModel,
      baseUrl: config.baseUrl,
      ollamaBaseUrl: config.ollamaBaseUrl,
      hasGeminiKey: Boolean(config.apiKey),
    });
  }

  if (url.pathname === "/api/config" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const configPath = path.join(__dirname, "config.json");
    let currentConfig = {};
    try {
      currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
    const updated = { ...currentConfig, ...payload };
    if (payload.apiKey !== undefined) {
      updated.apiKey = payload.apiKey;
      updated.geminiApiKey = payload.apiKey;
    }
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
    addTaskLog(
      "config",
      `Active LLM set to ${updated.provider} (${updated.model || updated.geminiModel || "default"})`,
    );
    return sendJson(res, 200, { ok: true, config: updated });
  }

  if (url.pathname === "/api/project/scan" && req.method === "GET") {
    const context = collectProjectContext();
    const count = (context.match(/File:/g) || []).length;
    addTaskLog(
      "scan",
      `Workspace scan complete: ${count} context files indexed`,
    );
    return sendJson(res, 200, { ok: true, context, count });
  }

  if (url.pathname === "/api/gemini/sync" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const chats = payload.chats || payload.history || [];
    const state = getDashboardState();
    if (Array.isArray(chats) && chats.length > 0) {
      for (const item of chats) {
        if (item.type === "idea" || item.category) {
          addIdea({
            title: item.title || item.text || "Gemini Chat Insight",
            category: item.category || "Growth",
            owner: "Gemini Sync",
            description:
              item.description ||
              item.snippet ||
              "Imported from Gemini chat history.",
          });
        } else {
          createTask({
            title: item.title || item.text || "Gemini Action Item",
            owner: "Gemini Sync",
            priority: item.priority || "High",
            status: "queued",
            progress: 10,
          });
        }
      }
      addTaskLog(
        "sync",
        `Synced ${chats.length} prompt/chat items from Gemini history`,
      );
      return sendJson(res, 200, { ok: true, count: chats.length });
    }
    return sendJson(res, 400, {
      ok: false,
      message: "No chat items provided.",
    });
  }

  if (url.pathname === "/api/site/monitor" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const site = payload.site || "ignitix.online";
    addTaskLog("site", `Site health check triggered for ${site}`);

    // Actual health check with timeout
    const checkSite = (url) => {
      return new Promise((resolve) => {
        const http = require("http");
        let parsed;
        try {
          parsed = new URL(
            /^https?:\/\//i.test(url) ? url : `http://${url}`,
          );
        } catch {
          return resolve({
            status: "unreachable",
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
          });
        }
        const options = {
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: parsed.pathname || "/",
          timeout: 5000,
        };
        const request = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            resolve({
              status: res.statusCode === 200 ? "healthy" : "degraded",
              latencyMs: 0,
              checkedAt: new Date().toISOString(),
            });
          });
        });
        request.on("error", (err) => {
          resolve({
            status: "unreachable",
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
          });
        });
        request.setTimeout(5000, () => {
          request.destroy();
          resolve({
            status: "timed_out",
            latencyMs: 5000,
            checkedAt: new Date().toISOString(),
          });
        });
        request.end();
      });
    };




    // Await the health check so the handler does NOT fall through to the
    // static-file fallback (which would send the SPA HTML instead of JSON).
    // The sendJson guard + try/catch below keep a slow/failed check from
    // ever crashing the server.
    try {
      const result = await checkSite(site);
      return sendJson(res, 200, {
        ok: true,
        site,
        status: result.status,
        latencyMs: result.latencyMs,
        checkedAt: result.checkedAt,
      });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        message: err.message || "Site health check failed.",
      });
    }
  }

  if (url.pathname === "/api/playbooks/run" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const playbookType = payload.playbook || "idea-to-roadmap";
    const promptValue = payload.prompt || payload.idea || "";

    try {
      const result = await runPlaybookById(playbookType, promptValue);
      // Respect the dispatch guard: if the playbook id was unknown the
      // dispatcher returns statusCode: 400 so the client gets a real
      // HTTP error instead of a silent 200.
      const status = result && result.statusCode ? result.statusCode : 200;
      return sendJson(res, status, result);
    } catch (err) {
      return sendJson(res, 500, { ok: false, message: err.message });
    }

  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const message = payload.message || "";
    const autonomous = payload.autonomous !== false;
    if (!message.trim()) {
      return sendJson(res, 400, { ok: false, message: "Prompt is required." });
    }

    try {
      const { instructions, rawText } = await askLLM(message, { includeRaw: true });
      const executed = [];
      const pendingApprovals = [];
      const blocked = [];

      // Policy gate: model output is DATA. Every parsed instruction is
      // classified, veto-checked, and either executed (low/moderate),
      // queued for human approval (high/critical), or blocked.
      if (autonomous && Array.isArray(instructions)) {
        for (const inst of instructions) {
          const veto = policyVeto(inst);
          if (veto) {
            blocked.push({ instruction: describeInstruction(inst), reason: veto });
            addAuditEvent({
              actor: "system",
              action: "instruction.blocked",
              objectType: "instruction",
              objectId: String(inst.action || "unknown"),
              metadata: { reason: veto },
            });
            continue;
          }

          const risk = classifyRisk(inst.action);

          if (risk === "low" || risk === "moderate") {
            const resExec = await processInstruction(inst);
            executed.push({ instruction: inst, result: resExec });
            addAuditEvent({
              actor: "tool",
              action: "instruction.executed",
              objectType: "instruction",
              objectId: String(inst.action || "unknown"),
              metadata: { riskTier: risk, preview: redactPayload(inst.payload) },
            });
            addTaskLog(
              inst.action,
              `Autonomous action (${risk} risk): ${inst.action}`,
              { payload: redactPayload(inst.payload) },
            );
          } else {
            // high/critical → just-in-time human approval required.
            const approval = createApprovalRequest({
              action: inst.action,
              riskTier: risk,
              description: describeInstruction(inst),
              payloadHash: payloadHash(inst.payload),
              payloadPreview: redactPayload(inst.payload),
              reason: "High/critical action requested by autonomous agent",
              instruction: inst,
            });
            // Strip the server-only raw instruction before it leaves the API.
            pendingApprovals.push({ ...approval, instruction: undefined });
            addTaskLog(
              "approval",
              `Approval required (${risk}): ${describeInstruction(inst)}`,
            );
          }
        }
      }

      let reply = "";
      if (rawText && rawText.trim()) {
        reply = rawText.trim();
      } else if (executed.length > 0) {
        reply = `Autonomous Agent executed ${executed.length} action(s): ${executed.map((e) => e.instruction.action).join(", ")}`;
      } else if (pendingApprovals.length > 0) {
        reply = `${pendingApprovals.length} action(s) need your approval before they can run. Open the Approvals queue to review.`;
      } else {
        reply = `Analysis complete. Zero blockers found in current workspace context.`;
      }
      if (blocked.length > 0) {
        reply += `\n\n${blocked.length} requested action(s) were blocked by policy.`;
      }

      return sendJson(res, 200, {
        ok: true,
        message,
        instructions,
        executed,
        pendingApprovals,
        blocked,
        reply,
      });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        message: err.message || "Failed to process chat.",
      });
    }
  }

  /* ── Approvals: centralized human-control queue ── */
  if (url.pathname === "/api/approvals" && req.method === "GET") {
    const status = url.searchParams.get("status") || "all";
    const items = listApprovals(status).map((item) => ({
      ...item,
      // Never expose the raw instruction payload over the API.
      instruction: undefined,
    }));
    return sendJson(res, 200, { ok: true, approvals: items });
  }

  if (url.pathname === "/api/approvals/decision" && req.method === "POST") {
    const body = await readJsonBody(req);
    const id = body.id || body.approvalId;
    const decision = body.decision; // approve | reject | cancel
    const note = body.note || "";

    if (!id || !decision) {
      return sendJson(res, 400, {
        ok: false,
        message: "Approval id and decision are required.",
      });
    }

    // Map client-facing verbs to stored approval states.
    const DECISION_MAP = { approve: "approved", reject: "rejected", cancel: "cancelled" };
    const mappedDecision = DECISION_MAP[decision];
    if (!mappedDecision) {
      return sendJson(res, 400, {
        ok: false,
        message: `Invalid decision "${decision}". Use approve, reject, or cancel.`,
      });
    }

    const decisionResult = decideApproval(id, mappedDecision, note);
    if (!decisionResult.ok) {
      return sendJson(res, 409, decisionResult);
    }

    // On approval: re-run the hard policy veto at execution time, then
    // execute once via the permission-bypassed path (approval IS the
    // authorization), then mark single-use consumed.
    if (mappedDecision === "approved") {
      const state = getDashboardState();
      const record = (state.approvals || []).find((item) => item.id === id);
      const stored = record && record.instruction;

      if (!stored) {
        return sendJson(res, 200, {
          ok: true,
          approval: decisionResult.approval,
          message:
            "Approved. The original action payload was not retained — re-run the request to execute it.",
        });
      }

      const veto = policyVeto(stored);
      if (veto) {
        decideApproval(id, "cancelled", `Blocked at execution time: ${veto}`);
        return sendJson(res, 403, { ok: false, message: veto });
      }

      try {
        const result = await processInstruction(stored, {
          skipPermissionCheck: true,
        });
        const executed = markApprovalExecuted(id, "completed");
        return sendJson(res, 200, {
          ok: true,
          approval: executed.approval,
          message: "Approved action executed once.",
          result: redactPayload(result ?? null),
        });
      } catch (err) {
        decideApproval(id, "cancelled", `Execution failed: ${err.message}`);
        return sendJson(res, 500, {
          ok: false,
          message: `Approved but execution failed: ${err.message}`,
        });
      }
    }

    return sendJson(res, 200, {
      ok: true,
      approval: decisionResult.approval,
      message: `Decision recorded: ${mappedDecision}.`,
    });
  }

  /* ── Audit trail (redacted metadata only) ── */
  if (url.pathname === "/api/audit" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 100;
    return sendJson(res, 200, { ok: true, events: listAuditEvents(limit) });
  }

  if (url.pathname === "/api/voice" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const text = payload.text || payload.message || "";
    if (!text) {
      return sendJson(res, 400, {
        ok: false,
        message: "Voice text is required.",
      });
    }
    await handleVoiceInput(text);
    return sendJson(res, 200, { ok: true, message: "Voice input processed." });
  }

  if (url.pathname === "/api/automation/standup" && req.method === "POST") {
    const brief = await generateStandupBrief();
    return sendJson(res, 200, { ok: true, brief });
  }

  if (url.pathname === "/api/automation/loop" && req.method === "POST") {
    await runAutonomousLoop();
    return sendJson(res, 200, {
      ok: true,
      message: "Autonomous cycle executed.",
    });
  }

  if (url.pathname === "/api/agent/execute" && req.method === "POST") {
    return handleExecution(req, res);
  }

  /* ── Command Hub Auto-Update: check for available updates ── */
  if (url.pathname === "/api/ui/updates" && req.method === "GET") {
    const state = getDashboardState();
    const installed = state.commandHubUpdates || [];
    return sendJson(res, 200, { ok: true, installed });
  }

  /* ── Command Hub Auto-Update: install a new tool/card/widget ── */
  if (url.pathname === "/api/ui/install-card" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const update = addCommandHubUpdate({
      type: payload.type || "tool",
      title: payload.title || "New Command Hub component",
      description: payload.description || "",
      installed: true,
    });
    addTaskLog("ui", `Command Hub installed: ${update.title}`);
    return sendJson(res, 200, { ok: true, update });
  }

  /* ── Real system actions: truthful Operations/System panel backends ── */
  if (url.pathname === "/api/system/state" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      tempReports: systemActions.tempReportStats(),
      scheduler: systemActions.getSchedulerStatus(),
      performanceMode: systemActions.getPerformanceMode(),
      effectivePermissions: {
        createFiles: effectivePermission("createFiles"),
        modifyFiles: effectivePermission("modifyFiles"),
        runCommands: effectivePermission("runCommands"),
        installDependencies: effectivePermission("installDependencies"),
        deploy: effectivePermission("deploy"),
      },
    });
  }

  if (url.pathname === "/api/system/clear-temp" && req.method === "POST") {
    const result = systemActions.clearTempReports();
    addTaskLog(
      "maintenance",
      `Cleared ${result.removed} generated report(s) from tmp/ (${(result.bytesFreed / 1024).toFixed(1)} KB freed)`,
    );
    return sendJson(res, 200, { ok: true, ...result });
  }

  if (
    url.pathname === "/api/system/restart-scheduler" &&
    req.method === "POST"
  ) {
    const result = systemActions.restartScheduler();
    addTaskLog(
      "maintenance",
      `Automation loop restarted (in-process scheduler, every ${result.intervalMs / 1000}s)`,
    );
    return sendJson(res, 200, {
      ok: true,
      restarted: true,
      scheduler: systemActions.getSchedulerStatus(),
    });
  }

  if (url.pathname === "/api/system/optimize" && req.method === "POST") {
    const result = systemActions.optimizeSystem();
    addTaskLog(
      "maintenance",
      `Optimized workspace: ${result.reportsRemoved} report(s) removed, ${(result.reportsBytesFreed / 1024).toFixed(1)} KB + ${(result.stateBytesSaved / 1024).toFixed(1)} KB state compacted`,
    );
    return sendJson(res, 200, { ok: true, ...result });
  }

  if (url.pathname === "/api/system/high-perf" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const enabled = Boolean(payload.enabled);
    const result = systemActions.setHighPerformance(enabled);
    addTaskLog(
      "config",
      `High-performance mode ${enabled ? "enabled" : "disabled"} (numCtx=${result.numCtx}, numPredict=${result.numPredict})`,
    );
    return sendJson(res, 200, { ok: true, ...result });
  }

  /* ── Live System Metrics: real OS telemetry ── */
  if (url.pathname === "/api/system-metrics" && req.method === "GET") {
    try {
      const metrics = await collectSystemMetrics();
      return sendJson(res, 200, { ok: true, metrics });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        message: err.message || "Failed to collect system metrics.",
      });
    }
  }

  /* ── Tool Registry: list available tools and their availability ── */
  if (url.pathname === "/api/tools" && req.method === "GET") {
    const { listTools } = require("./server-tool-registry");
    return sendJson(res, 200, { ok: true, tools: listTools() });
  }

  /* ── Plans: create, list, get, approve/reject/revise ── */
  if (url.pathname === "/api/plans" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const { createPlan, getPlan } = require("./dashboard-state");
    const plan = createPlan({
      taskId: payload.taskId,
      summary: payload.summary,
      assumptions: payload.assumptions,
      risks: payload.risks,
      steps: payload.steps,
      author: "user",
    });
    const fullPlan = getPlan(plan.id);
    return sendJson(res, 200, { ok: true, plan: fullPlan });
  }

  if (url.pathname === "/api/plans" && req.method === "GET") {
    const taskId = url.searchParams.get("taskId");
    const { getPlansForTask } = require("./dashboard-state");
    const plans = taskId ? getPlansForTask(taskId) : [];
    return sendJson(res, 200, { ok: true, plans });
  }

  if (url.pathname.startsWith("/api/plans/") && req.method === "GET") {
    const planId = path.basename(url.pathname.replace(/^\/api\/plans\//, ""));
    const { getPlan } = require("./dashboard-state");
    const plan = getPlan(planId);
    if (!plan) return sendJson(res, 404, { ok: false, message: "Plan not found." });
    return sendJson(res, 200, { ok: true, plan });
  }

  if (url.pathname === "/api/plans/decision" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const { updatePlanStatus } = require("./dashboard-state");
    const { assertTransition } = require("./server-state-machine");
    const planId = payload.planId || payload.id;
    const decision = payload.decision; // approve | reject | revise
    if (!planId || !decision) {
      return sendJson(res, 400, { ok: false, message: "planId and decision are required." });
    }
    const DECISION_MAP = { approve: "approved", reject: "rejected", revise: "draft" };
    const mapped = DECISION_MAP[decision];
    if (!mapped) {
      return sendJson(res, 400, { ok: false, message: `Invalid decision: ${decision}` });
    }
    const { getPlan } = require("./dashboard-state");
    const existing = getPlan(planId);
    if (!existing) return sendJson(res, 404, { ok: false, message: "Plan not found." });
    try {
      assertTransition("plan", existing.status, mapped, "user");
    } catch (err) {
      return sendJson(res, 409, { ok: false, message: err.message });
    }
    const result = updatePlanStatus(planId, mapped, "user");
    return sendJson(res, 200, result);
  }

  /* ── Runs: create, get, cancel, retry ── */
  if (url.pathname === "/api/runs" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const { createRun } = require("./dashboard-state");
    const run = createRun({
      taskId: payload.taskId,
      planId: payload.planId,
      provider: payload.provider,
      toolSummary: payload.toolSummary,
    });
    return sendJson(res, 200, { ok: true, run });
  }

  if (url.pathname.startsWith("/api/runs/") && req.method === "GET") {
    const runId = path.basename(url.pathname.replace(/^\/api\/runs\//, ""));
    if (url.pathname.endsWith("/events")) {
      const cleanRunId = runId.replace(/\/events$/, "");
      const { getRunEvents } = require("./dashboard-state");
      return sendJson(res, 200, { ok: true, events: getRunEvents(cleanRunId) });
    }
    const { getRun } = require("./dashboard-state");
    const run = getRun(runId);
    if (!run) return sendJson(res, 404, { ok: false, message: "Run not found." });
    return sendJson(res, 200, { ok: true, run });
  }

  if (url.pathname === "/api/runs/cancel" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const { updateRunStatus, getRun } = require("./dashboard-state");
    const { assertTransition } = require("./server-state-machine");
    const runId = payload.runId || payload.id;
    const run = getRun(runId);
    if (!run) return sendJson(res, 404, { ok: false, message: "Run not found." });
    try {
      assertTransition("run", run.status, "cancelled", "user");
    } catch (err) {
      return sendJson(res, 409, { ok: false, message: err.message });
    }
    const result = updateRunStatus(runId, "cancelled", {
      summary: "Run cancelled by user",
      actor: "user",
    });
    return sendJson(res, 200, result);
  }

  if (url.pathname === "/api/runs/retry" && req.method === "POST") {
    const payload = await readJsonBody(req);
    const { getRun, createRun, updateRunStatus } = require("./dashboard-state");
    const { assertTransition } = require("./server-state-machine");
    const runId = payload.runId || payload.id;
    const run = getRun(runId);
    if (!run) return sendJson(res, 404, { ok: false, message: "Run not found." });
    // Only retryable failures: failed or timed_out
    if (!["failed", "timed_out"].includes(run.status)) {
      return sendJson(res, 409, {
        ok: false,
        message: `Run is ${run.status}; only failed or timed_out runs can be retried.`,
      });
    }
    try {
      assertTransition("run", run.status, "queued", "user");
    } catch (err) {
      return sendJson(res, 409, { ok: false, message: err.message });
    }
    const newRun = createRun({
      taskId: run.taskId,
      planId: run.planId,
      provider: run.provider,
      toolSummary: run.toolSummary,
      attemptCount: run.attemptCount,
      parentRunId: run.id,
    });
    return sendJson(res, 200, { ok: true, run: newRun });
  }

  /* ── Artifacts: list, get ── */
  if (url.pathname === "/api/artifacts" && req.method === "GET") {
    const { getArtifacts } = require("./dashboard-state");
    const filter = {};
    const taskId = url.searchParams.get("taskId");
    const runId = url.searchParams.get("runId");
    const type = url.searchParams.get("type");
    const state = url.searchParams.get("state");
    if (taskId) filter.taskId = taskId;
    if (runId) filter.runId = runId;
    if (type) filter.type = type;
    if (state) filter.state = state;
    return sendJson(res, 200, { ok: true, artifacts: getArtifacts(filter) });
  }

  /* ── Serve generated report files (markdown) for "View Report" ── */
  if (url.pathname.startsWith("/api/reports/") && req.method === "GET") {
    const fileName = path.basename(url.pathname.replace(/^\/api\/reports\//, ""));
    if (!fileName) {
      return sendJson(res, 400, { ok: false, message: "Report name required." });
    }
    const reportPath = path.join(__dirname, "tmp", fileName);
    if (!reportPath.startsWith(path.join(__dirname, "tmp"))) {
      return sendJson(res, 403, { ok: false, message: "Forbidden." });
    }
    fs.readFile(reportPath, "utf8", (err, data) => {
      if (err) {
        return sendJson(res, 404, { ok: false, message: "Report not found." });
      }
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileName}"`,
      });
      res.end(data);
    });
    return;
  }

  return serveStaticFile(req, res);
}


// Export the request handler for reuse by Vercel serverless functions
// (api/index.js) and for testing, without starting the HTTP server.
module.exports = {
  handleRequest,
  sendJson,
  readJsonBody,
  serveStaticFile,
  MIME_TYPES,
};

// Only start the standalone HTTP server + background schedules when this
// file is executed directly (node dashboard-server.js). When imported by
// the Vercel serverless function (api/index.js) the module loads without
// binding a port or spawning background timers.
if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`MarinaAI dashboard running at http://localhost:${PORT}`);
    startScheduler(60000);
    startVoiceWatcher();
  });
}
