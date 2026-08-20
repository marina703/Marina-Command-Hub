const fs = require("fs");
const path = require("path");
const axios = require("axios");

const permissions = require("./permissions.json");
const runCommand = require("./executor/runCommand");
const writeFile = require("./executor/writeFile");
const modifyFile = require("./executor/modifyFile");
const installDeps = require("./executor/installDeps");
const deploy = require("./executor/deploy");

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

function parseInstructions(rawText) {
  if (!rawText || !String(rawText).trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawText);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.instructions)) {
        return parsed.instructions;
      }
      return [parsed];
    }
  } catch (error) {
    // Fall through to text-based parsing.
  }

  const text = String(rawText).trim();

  const createMatch =
    text.match(
      /(?:^|\s)(?:create|make)\s+(?:file|document|note)\s+([A-Za-z0-9_./\\-]+(?:\.[A-Za-z0-9]+)?)(?:\.|$)/i,
    ) ||
    text.match(
      /(?:^|\s)createfile\s+([A-Za-z0-9_./\\-]+(?:\.[A-Za-z0-9]+)?)(?:\.|$)/i,
    ) ||
    text.match(
      /(?:^|\s)create\s+([A-Za-z0-9_./\\-]+(?:\.[A-Za-z0-9]+)?)(?:\.|$)/i,
    );
  if (createMatch) {
    const pathValue = createMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (pathValue) {
      return [
        { action: "createFile", payload: { path: pathValue, content: "" } },
      ];
    }
  }

  const runMatch =
    text.match(/(?:^|\s)run(?:\s+command)?\s+(.+?)(?:\.|$)/i) ||
    text.match(/(?:^|\s)runcommand\s+(.+?)(?:\.|$)/i);
  if (runMatch) {
    const commandValue = runMatch[1].trim().replace(/^['"]|['"]$/g, "");
    if (commandValue) {
      return [{ action: "runCommand", payload: { command: commandValue } }];
    }
  }

  return [];
}

async function processInstruction(instruction) {
  if (!instruction || !instruction.action) {
    return;
  }

  const { action, payload = {} } = instruction;

  if (action === "createFile" && permissions.allow.createFiles) {
    return writeFile(payload.path, payload.content || "");
  }

  if (action === "modifyFile" && permissions.allow.modifyFiles) {
    return modifyFile(payload.path, payload.changes || "");
  }

  if (action === "runCommand" && permissions.allow.runCommands) {
    return runCommand(payload.command);
  }

  if (
    action === "installDependencies" &&
    permissions.allow.installDependencies
  ) {
    return installDeps(payload.packageManager || "npm", payload.packages || []);
  }

  if (action === "deploy" && permissions.allow.deploy) {
    return deploy(payload.target);
  }

  console.log("Blocked action:", action);
}

// LOCAL STORAGE PERSISTENCE for dashboard state
function persistState() {
  try {
    const currentState = {
      tasks: JSON.parse(localStorage.getItem("marina-tasks")) || [],
      brainstormIdeas: JSON.parse(localStorage.getItem("marina-ideas")) || [],
      completedHistory: JSON.parse(localStorage.getItem("marina-history")) || [],
      meetingAgenda: JSON.parse(localStorage.getItem("marina-meetings")) || [],
      aiSummaries: JSON.parse(localStorage.getItem("marina-summaries")) || [],
      projectMilestones: JSON.parse(localStorage.getItem("marina-milestones")) || [],
      meetingNotes: JSON.parse(localStorage.getItem("marina-notes")) || [],
      logs: JSON.parse(localStorage.getItem("marina-logs")) || [],
    };
    // Only save if there's actual data
    const hasData =
      Object.values(currentState).some((arr) => arr && arr.length > 0);
    if (hasData) {
      localStorage.setItem("marina-state-v1", JSON.stringify(currentState));
    }
  } catch (e) {
    // localStorage not available (e.g., private browsing) - silently fail
  }
}

// Load state from localStorage on agent start
function loadPersistedState() {
  try {
    const stored = localStorage.getItem("marina-state-v1");
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log("Loaded persisted dashboard state from localStorage");
    }
  } catch (e) {
    // Silently fail if state is corrupt
  }
}

function getLLMConfig() {
  let baseConfig = {};
  try {
    baseConfig = require("./config.json");
  } catch {}

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    baseConfig.apiKey ||
    baseConfig.geminiApiKey ||
    "";

  // Default to gemini if apiKey exists, otherwise local ollama
  const defaultProvider = apiKey ? "gemini" : "ollama";

  const provider =
    process.env.LLM_PROVIDER ||
    process.env.OPENAI_API_PROVIDER ||
    process.env.GEMINI_PROVIDER ||
    baseConfig.provider ||
    defaultProvider;

  const model =
    process.env.LLM_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.GEMINI_MODEL ||
    baseConfig.model ||
    baseConfig.geminiModel ||
    (provider === "gemini" ? "gemini-2.5-flash" : "qwen2.5:3b");

  const baseUrl =
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.GEMINI_BASE_URL ||
    baseConfig.baseUrl ||
    baseConfig.openaiCompatibleBaseUrl ||
    baseConfig.geminiBaseUrl ||
    "http://localhost:11434/v1";

  return {
    provider: String(provider).toLowerCase(),
    model,
    baseUrl,
    apiKey,
    copilotApiKey:
      process.env.GITHUB_COPILOT_API_KEY || baseConfig.copilotApiKey || "",
    copilotEndpoint:
      process.env.GITHUB_COPILOT_ENDPOINT ||
      baseConfig.copilotEndpoint ||
      "https://api.githubcopilot.microsoft.com/v1/chat",
    ollamaBaseUrl:
      process.env.OLLAMA_BASE_URL ||
      baseConfig.ollamaBaseUrl ||
      "http://localhost:11434",
    geminiBaseUrl:
      process.env.GEMINI_BASE_URL ||
      baseConfig.geminiBaseUrl ||
      "https://generativelanguage.googleapis.com/v1beta",
    geminiModel:
      process.env.GEMINI_MODEL || baseConfig.geminiModel || "gemini-1.5-flash",
  };
}

function collectProjectContext(projectRoot = path.resolve(__dirname, "..")) {
  const priorityFiles = [
    path.join(projectRoot, "web", "AGENTS.md"),
    path.join(projectRoot, "web", "CLAUDE.md"),
    path.join(projectRoot, "web", "package.json"),
    path.join(projectRoot, "agent", "package.json"),
    path.join(projectRoot, "agent", "config.json"),
    path.join(projectRoot, "web", "README.md"),
  ];

  const collected = [];
  const seen = new Set();

  for (const filePath of priorityFiles) {
    if (fs.existsSync(filePath)) {
      const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
      seen.add(relPath);
      try {
        const text = fs.readFileSync(filePath, "utf8");
        const snippet = text.replace(/\s+/g, " ").trim().slice(0, 500);
        collected.push({ path: relPath, snippet });
      } catch {}
    }
  }

  function walk(dir) {
    if (!fs.existsSync(dir) || collected.length >= 8) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (collected.length >= 8) break;
      if (
        ["node_modules", ".next", ".git", "dist", "build", "tmp"].includes(
          entry.name,
        )
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (![".md", ".json", ".js", ".ts", ".tsx"].includes(ext)) {
        continue;
      }

      const relativePath = path
        .relative(projectRoot, fullPath)
        .replace(/\\/g, "/");
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);

      try {
        const text = fs.readFileSync(fullPath, "utf8");
        const snippet = text.replace(/\s+/g, " ").trim();
        if (snippet.length < 30) continue;
        collected.push({ path: relativePath, snippet: snippet.slice(0, 500) });
      } catch {}
    }
  }

  [path.join(projectRoot, "agent"), path.join(projectRoot, "web")].forEach(
    walk,
  );

  return collected
    .map((item) => `---\nFile: ${item.path}\n${item.snippet}\n`)
    .join("\n");
}

function augmentPromptWithProjectContext(message) {
  return `Workspace Context: Managed domains and projects include Marina AI Command Hub (localhost:3000), Next.js Web App (localhost:3001), ignitix.online, and pyroprep.academy.\n\nInstructions: Provide actionable, structured responses using clear bullet points (•) and numbered steps where applicable.\n\nUser request:\n${message}`;
}

async function callGemini({ apiKey, model, message }) {
  try {
    const response = await axios.post(
      `${(process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")}/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.4,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      },
    );

    const rawText =
      response?.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join("") || "";

    const instructions = parseInstructions(rawText);
    return { instructions, rawText };
  } catch (err) {
    console.warn("Gemini call error:", err.response?.data?.error?.message || err.message);
    return { instructions: [], rawText: "" };
  }
}

async function callOpenAICompatible({ baseUrl, apiKey, model, message }) {
  try {
    const response = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model,
        messages: [{ role: "user", content: message }],
        temperature: 0.4,
      },
      {
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: 120000,
      },
    );

    const rawText =
      response?.data?.choices?.[0]?.message?.content ||
      response?.data?.content ||
      response?.data?.text ||
      "";

    const instructions = parseInstructions(rawText);
    return { instructions, rawText };
  } catch (err) {
    console.warn("OpenAI-compatible call error:", err.message);
    return { instructions: [], rawText: "" };
  }
}

async function callOllama({ baseUrl, model, message, options = {} }) {
  try {
    const rawUrl = baseUrl || "http://localhost:11434";
    const cleanUrl = rawUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    const safeModel =
      model && !model.includes("gemini") && !model.includes("gpt")
        ? model
        : "qwen2.5:3b";

    // Single source of truth for local-hardware tuning: config.json -> llmTuning
    let tuning = {};
    try {
      tuning = JSON.parse(
        fs.readFileSync(path.join(__dirname, "config.json"), "utf8"),
      ).llmTuning || {};
    } catch {}

    const keepAlive = options.keepAlive ?? tuning.keepAlive ?? "30m";
    const numCtx = options.numCtx ?? tuning.numCtx ?? 4096;
    const numPredict = options.numPredict ?? tuning.numPredict ?? 1024;
    const timeoutMs = options.timeoutMs ?? tuning.timeoutMs ?? 30000;

    const response = await axios.post(
      `${cleanUrl}/api/generate`,
      {
        model: safeModel,
        prompt: message,
        stream: false,
        // Token speed optimizations for local hardware
        keep_alive: keepAlive,
        options: {
          num_ctx: numCtx,
          num_predict: numPredict,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
      },
    );

    const rawText = response?.data?.response || "";
    const instructions = parseInstructions(rawText);
    return { instructions, rawText };
  } catch (err) {
    console.warn("Ollama call error:", err.message);
    return { instructions: [], rawText: "" };
  }
}

async function askLLM(message, options = {}) {
  const config = getLLMConfig();
  const fallbackInstructions = parseInstructions(message);
  const enrichedMessage = augmentPromptWithProjectContext(message);

  let result = { instructions: [], rawText: "" };

  // 1. If Gemini is requested or configured with an API key
  if (config.provider === "gemini" || (config.apiKey && config.provider !== "ollama" && config.provider !== "copilot")) {
    if (config.apiKey) {
      result = await callGemini({
        apiKey: config.apiKey,
        model: config.geminiModel || config.model || "gemini-1.5-flash",
        message: enrichedMessage,
      });

      if (result.rawText || (result.instructions && result.instructions.length > 0)) {
        return options.includeRaw ? result : (result.instructions.length > 0 ? result.instructions : fallbackInstructions);
      }
    }
  }

  // 2. If Ollama is selected or Gemini fell back
  const ollamaModel = (config.model && !config.model.includes("gemini") && !config.model.includes("gpt")) 
    ? config.model 
    : "qwen2.5:3b";

  if (config.provider === "ollama" || !config.copilotApiKey) {
    result = await callOllama({
      baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
      model: ollamaModel,
      message: enrichedMessage,
    });

    if (result.rawText || (result.instructions && result.instructions.length > 0)) {
      return options.includeRaw ? result : (result.instructions.length > 0 ? result.instructions : fallbackInstructions);
    }
  }

  // 3. OpenAI / Compatible endpoint
  if (config.provider === "openai" || config.provider === "openai-compatible") {
    if (config.apiKey) {
      result = await callOpenAICompatible({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        message: enrichedMessage,
      });

      if (result.rawText || (result.instructions && result.instructions.length > 0)) {
        return options.includeRaw ? result : (result.instructions.length > 0 ? result.instructions : fallbackInstructions);
      }
    }
  }

  // 4. Copilot endpoint (if API key is present)
  if (config.provider === "copilot" && config.copilotApiKey) {
    try {
      const response = await axios.post(
        config.copilotEndpoint,
        {
          messages: [{ role: "user", content: enrichedMessage }],
          model: "gpt-4o-mini",
        },
        {
          headers: {
            Authorization: `Bearer ${config.copilotApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        },
      );

      const rawText = response?.data?.content || response?.data?.text || "";
      const instructions = Array.isArray(response?.data?.instructions)
        ? response.data.instructions
        : parseInstructions(rawText);

      result = { instructions, rawText };
      if (result.rawText || result.instructions.length > 0) {
        return options.includeRaw ? result : (result.instructions.length > 0 ? result.instructions : fallbackInstructions);
      }
    } catch (err) {
      console.warn("Copilot endpoint failed:", err.message);
    }
  }

  // Final fallback to Ollama if nothing else returned
  try {
    result = await callOllama({
      baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
      model: "qwen2.5:3b",
      message: enrichedMessage,
    });
    if (result.rawText || result.instructions.length > 0) {
      return options.includeRaw ? result : (result.instructions.length > 0 ? result.instructions : fallbackInstructions);
    }
  } catch {}

  return options.includeRaw ? { instructions: fallbackInstructions, rawText: "" } : fallbackInstructions;
}

const askCopilot = askLLM;

async function main() {
  ensureFile("incoming.txt");
  console.log("Autonomous Agent Running...");

  // Load any previously persisted state
  loadPersistedState();

  fs.watch("incoming.txt", async () => {
    try {
      const message = fs.readFileSync("incoming.txt", "utf8").trim();
      if (!message) return;

      const instructions = await askLLM(message);

      for (const instruction of instructions) {
        await processInstruction(instruction);
      }

      // Persist state after each instruction batch
      persistState();
    } catch (error) {
      console.error("Agent error:", error.message);
    }
  });
}

if (require.main === module) {
  main();
}

// EXPORTED FUNCTIONS
module.exports = {
  ensureFile,
  parseInstructions,
  processInstruction,
  askCopilot,
  askLLM,
  getLLMConfig,
  collectProjectContext,
  augmentPromptWithProjectContext,
  getCopilotConfig: getLLMConfig,
  main,
};