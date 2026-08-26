/* ============================================================
   MarinaAI — Workflow Dispatcher Interface

   Narrow documented seam that the dashboard server and the
   local queue worker use to invoke the bounded registered
   handlers. The dispatcher is driven by the tool-registry, so a
   handler is only reachable when the registry lists it as
   `dispatchable` (executable + available + feature-flag enabled).

   Wired handlers:
     - safe-internal   → providerless deterministic plan brief
     - web-search      → Tavily/SerpAPI/Exa web search (env-gated)
     - research        → parallel subtask research + synthesis

   The dispatcher does NOT touch the shell, the browser, an LLM
   provider, a payment/deployment gateway, or a third-party
   upload endpoint. It does not change MARINA_ENABLE_EXEC.
   ============================================================ */

const CRYPTO = require("crypto");
const safe = require("./server-safe-workflow");
const planner = require("./server-planner");
const search = require("./server-web-search");
const research = require("./server-research-planner");
const codeGen = require("./server-code-gen");
const docGen = require("./server-doc-gen");
const memory = require("./server-graph-memory");
const agentBus = require("./server-agent-bus");
const imageGen = require("./server-image-gen");
const registry = require("./server-tool-registry");

const REGISTERED_WORKFLOWS = {
  [safe.WORKFLOW_ID]: {
    id: safe.WORKFLOW_ID,
    label: safe.WORKFLOW_LABEL,
    availability: "available",
    riskTier: "low",
    provider: planner.PLANNER_ID,
    providerLabel: planner.PLANNER_LABEL,
    description: "Providerless, deterministic, side-effect-free inside MarinaAI. Generates a durable Markdown plan brief artifact for the active approved plan.",
  },
  "web-search": {
    id: "web-search",
    label: "Web Search",
    availability: "available",
    riskTier: "low",
    provider: "web-search",
    providerLabel: "Tavily/SerpAPI/Exa",
    description: "Search the web with provider fallback. Requires a configured search API key.",
  },
  research: {
    id: "research",
    label: "Wide Research",
    availability: "available",
    riskTier: "moderate",
    provider: "research",
    providerLabel: "Research Planner",
    description: "Decompose a query into parallel subtasks, search + extract, and synthesize into a structured research-report artifact.",
  },
  "code-generation": {
    id: "code-generation",
    label: "Code Generation",
    availability: "available",
    riskTier: "moderate",
    provider: "code-generation",
    providerLabel: "Template Scaffolder",
    description: "Generate a template-based project (Node CLI, React, FastAPI, Express) as a project artifact with a manifest, optionally zipped.",
  },
  "document-generation": {
    id: "document-generation",
    label: "Document Generation",
    availability: "available",
    riskTier: "low",
    provider: "document-generation",
    providerLabel: "Doc Gen",
    description: "Generate .docx, .xlsx, or .pdf deliverables from structured content. Safe, in-memory, no shell.",
  },
  memory: {
    id: "memory",
    label: "Knowledge Graph Memory",
    availability: "available",
    riskTier: "low",
    provider: "memory",
    providerLabel: "Graph Memory",
    description: "Persistent graph memory: remember entities/relations, recall by query, reason over paths.",
  },
  "agent-bus": {
    id: "agent-bus",
    label: "Agent Bus",
    availability: "available",
    riskTier: "low",
    provider: "agent-bus",
    providerLabel: "Agent Bus",
    description: "Cross-agent coordination: registry, topic message bus, and delegation.",
  },
  "image-generation": {
    id: "image-generation",
    label: "Image Generation",
    availability: "available",
    riskTier: "moderate",
    provider: "image-generation",
    providerLabel: "AI Design",
    description: "Generate images from a prompt via a configured provider (OpenAI/Stability). Fail-closed until a key is set.",
  },
};

function listWorkflows() {
  return Object.values(REGISTERED_WORKFLOWS);
}

function getWorkflow(id) {
  return REGISTERED_WORKFLOWS[id] || null;
}

/** Web search handler: search + provider fallback, no side effects. */
async function runWebSearch(ctx) {
  const query = ctx.query;
  if (!query || typeof query !== "string") {
    return { ok: false, message: "query is required", failureClassification: "invalid_input" };
  }
  const result = await search.searchWithFallback(query, {
    maxResults: ctx.maxResults,
    provider: ctx.provider,
  });
  return result;
}

/** Wide research handler: parallel subtasks → synthesis → research-report artifact. */
async function runResearch(ctx) {
  const query = ctx.query;
  if (!query || typeof query !== "string") {
    return { ok: false, message: "query is required", failureClassification: "invalid_input" };
  }

  const result = await research.executeResearch(ctx.supabase, query, {
    workspaceId: ctx.workspaceId,
    taskId: ctx.taskId,
    concurrency: ctx.concurrency,
    format: ctx.format,
  });

  // Persist a research-report artifact when we have a repo seam and a successful run.
  if (result.ok && ctx.supabase && ctx.workspaceId) {
    try {
      const content =
        typeof result.synthesis === "string"
          ? result.synthesis
          : JSON.stringify(result.synthesis, null, 2);
      const contentHash = CRYPTO.createHash("sha256").update(content).digest("hex");
      const artifact = await ctx.supabase.createArtifactInDb({
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId || null,
        runId: ctx.runId || null,
        type: "research-report",
        displayName: `Research: ${query.slice(0, 80)}`,
        mediaType: result.format === "json" ? "application/json" : "text/markdown",
        storageRef: "",
        contentHash,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        state: "draft",
        summary: `Research report for "${query.slice(0, 120)}"`,
        provenance: { workflow: "research", query, correlationId: result.correlationId },
      });
      result.artifact = artifact.ok ? artifact.artifact : null;
    } catch (err) {
      // Artifact persistence is best-effort; the research result still stands.
      result.artifact = null;
      result.artifactError = err.message;
    }
  }

  return result;
}

/** Code generation handler: template scaffold → project artifact + manifest (optionally zip).
    Accepts either an explicit template + variables, or a free-text spec that
    auto-selects the template (deterministic, providerless). */
async function runCodeGen(ctx) {
  const { template, variables, spec } = ctx;
  let project;
  let selectedTemplate = template;
  if (spec) {
    const analyzed = codeGen.analyzeSpec(spec, variables);
    selectedTemplate = analyzed.template;
    project = codeGen.generateProject(analyzed.template, analyzed.variables);
  } else {
    if (!template || !variables || !variables.name) {
      return { ok: false, message: "spec OR template + variables.name are required", failureClassification: "invalid_input" };
    }
    project = codeGen.generateProject(template, variables);
  }
  if (!project.ok) {
    return { ok: false, message: project.message, failureClassification: "invalid_input" };
  }

  // Build a manifest (file list, sizes, template, variables, provenance).
  const manifest = {
    projectName: project.projectName,
    template: project.template,
    fileCount: project.fileCount,
    files: project.files.map((f) => ({
      path: f.path,
      sizeBytes: Buffer.byteLength(f.content, "utf8"),
    })),
    variables,
    generatedAt: new Date().toISOString(),
  };

  // Optionally produce a zip and upload it to storage.
  let zip = null;
  let zipDownloadUrl = null;
  if (ctx.outputZip) {
    const zipResult = await codeGen.createProjectZip(project);
    if (zipResult.ok) {
      zip = {
        filename: zipResult.filename,
        sizeBytes: Math.round((zipResult.base64.length * 3) / 4),
      };
      if (ctx.supabase && ctx.workspaceId) {
        const stored = await storeDeliverable(ctx, {
          filename: zipResult.filename,
          base64: zipResult.base64,
          contentType: "application/zip",
        });
        if (stored.ok) zipDownloadUrl = stored.downloadUrl;
      }
    }
  }

  // Persist a project artifact with the manifest when a repo seam is present.
  let artifact = null;
  if (ctx.supabase && ctx.workspaceId) {
    try {
      const content = JSON.stringify(manifest, null, 2);
      const contentHash = CRYPTO.createHash("sha256").update(content).digest("hex");
      const artifactResult = await ctx.supabase.createArtifactInDb({
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId || null,
        runId: ctx.runId || null,
        type: "project",
        displayName: `Project: ${project.projectName}`,
        mediaType: "application/json",
        storageRef: "",
        contentHash,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        state: "draft",
        summary: `Generated ${project.fileCount} files from template "${project.template}".`,
        provenance: { workflow: "code-generation", template: selectedTemplate, variables, spec: spec || null, projectName: project.projectName },
      });
      artifact = artifactResult.ok ? artifactResult.artifact : null;
    } catch (err) {
      artifact = null;
    }
  }

  return {
    ok: true,
    project: {
      template: project.template,
      projectName: project.projectName,
      fileCount: project.fileCount,
      files: project.files,
    },
    manifest,
    zip,
    zipDownloadUrl,
    artifact,
  };
}

/** MIME type for a generated deliverable format. */
function mimeFor(format) {
  switch (format) {
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

/** Upload a generated deliverable (base64) to Supabase Storage; returns a signed URL. */
async function storeDeliverable(ctx, { filename, base64, contentType }) {
  if (!ctx.supabase || !ctx.workspaceId || !base64) return { ok: false };
  const storage = require("./server-supabase");
  const artifactId = CRYPTO.randomBytes(8).toString("hex");
  const content = Buffer.from(base64, "base64");
  const up = await storage.uploadArtifactFile(ctx.workspaceId, artifactId, filename, content, contentType, content.length);
  if (!up.ok) return { ok: false, message: up.message };
  const signed = await storage.getArtifactSignedUrl(ctx.workspaceId, artifactId, filename);
  return { ok: true, artifactId, path: up.path, downloadUrl: signed.ok ? signed.url : null };
}

/** Document generation handler: structured content → .docx/.xlsx/.pdf/.pptx (base64 + storage URL). */
async function runDocGen(ctx) {
  const { format, title, sections, rows, sheetName, slides } = ctx;
  if (!format || !title) {
    return { ok: false, message: "format and title are required", failureClassification: "invalid_input" };
  }
  const result = await docGen.generateDeliverable({ format, title, sections, rows, sheetName, slides });
  if (!result.ok) {
    return { ok: false, message: result.message, failureClassification: "invalid_input" };
  }
  // Upload to storage when a repo seam + workspace are present.
  let downloadUrl = null;
  if (ctx.supabase && ctx.workspaceId) {
    const stored = await storeDeliverable(ctx, {
      filename: result.filename,
      base64: result.base64,
      contentType: mimeFor(result.format),
    });
    if (stored.ok) downloadUrl = stored.downloadUrl;
  }
  return { ...result, downloadUrl };
}

/** Knowledge graph memory handler: remember / recall / reason / stats. */
async function runMemory(ctx) {
  const { action } = ctx;
  if (!action) return { ok: false, message: "action is required", failureClassification: "invalid_input" };
  switch (action) {
    case "remember":
      return memory.remember({ id: ctx.id, type: ctx.type, label: ctx.label, props: ctx.props, relations: ctx.relations });
    case "recall":
      return memory.recall({ query: ctx.query, depth: ctx.depth, limit: ctx.limit });
    case "reason":
      return memory.reason({ start: ctx.start, end: ctx.end, maxHops: ctx.maxHops });
    case "stats":
      return { ok: true, ...memory.stats() };
    default:
      return { ok: false, message: `Unknown memory action: ${action}`, failureClassification: "invalid_input" };
  }
}

/** Agent bus handler: register / find / list / publish / delegate / stats. */
async function runAgentBus(ctx) {
  const { action } = ctx;
  if (!action) return { ok: false, message: "action is required", failureClassification: "invalid_input" };
  switch (action) {
    case "register":
      return agentBus.registerAgent({ id: ctx.id, capabilities: ctx.capabilities });
    case "find":
      return agentBus.findAgents(ctx.capability);
    case "list":
      return agentBus.listAgents();
    case "publish":
      return agentBus.publish({ topic: ctx.topic, from: ctx.from, to: ctx.to, payload: ctx.payload });
    case "delegate":
      return agentBus.delegate({ from: ctx.from, to: ctx.to, task: ctx.task, context: ctx.context, expectedOutput: ctx.expectedOutput });
    case "messages":
      return agentBus.listMessages(ctx.topic);
    case "delegations":
      return agentBus.listDelegations();
    case "stats":
      return { ok: true, ...agentBus.stats() };
    default:
      return { ok: false, message: `Unknown agent-bus action: ${action}`, failureClassification: "invalid_input" };
  }
}

/** Image generation handler: prompt -> provider image (fail-closed). */
async function runImageGen(ctx) {
  const result = await imageGen.generateImage({ prompt: ctx.prompt, provider: ctx.provider, size: ctx.size, n: ctx.n });
  if (!result.ok) {
    return { ok: false, message: result.message, failureClassification: "not_configured" };
  }
  return result;
}

async function dispatch(workflowId, ctx) {
  // Defense in depth: cross-check the registry, not only the
  // workflow id. The dispatcher must never reach a handler
  // that the registry does not list as `dispatchable`.
  const toolDef = registry.getToolDefinition(workflowId);
  if (!toolDef) {
    return {
      ok: false,
      message: "Unknown workflow \"" + workflowId + "\". Only registered tools may dispatch.",
      failureClassification: "policy_blocked",
    };
  }
  if (!registry.isDispatchable(toolDef)) {
    return {
      ok: false,
      message: "Workflow \"" + workflowId + "\" is not in a dispatchable state (" + toolDef.availabilityState + ").",
      failureClassification: toolDef.availabilityState === "blocked" ? "policy_blocked" : "not_configured",
    };
  }

  switch (workflowId) {
    case safe.WORKFLOW_ID:
      return safe.runSafeWorkflow(ctx);
    case "web-search":
      return runWebSearch(ctx);
    case "research":
      return runResearch(ctx);
    case "code-generation":
      return runCodeGen(ctx);
    case "document-generation":
      return runDocGen(ctx);
    case "memory":
      return runMemory(ctx);
    case "agent-bus":
      return runAgentBus(ctx);
    case "image-generation":
      return runImageGen(ctx);
    default:
      return {
        ok: false,
        message: "Workflow \"" + workflowId + "\" is registered but no handler is wired.",
        failureClassification: "not_configured",
      };
  }
}

module.exports = {
  REGISTERED_WORKFLOWS,
  listWorkflows,
  getWorkflow,
  dispatch,
};
