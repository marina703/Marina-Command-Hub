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

  // Optionally produce a zip.
  let zip = null;
  if (ctx.outputZip) {
    const zipResult = await codeGen.createProjectZip(project);
    if (zipResult.ok) {
      zip = {
        filename: zipResult.filename,
        sizeBytes: Math.round((zipResult.base64.length * 3) / 4),
      };
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
    artifact,
  };
}

/** Document generation handler: structured content → .docx/.xlsx/.pdf (base64). */
async function runDocGen(ctx) {
  const { format, title, sections, rows, sheetName } = ctx;
  if (!format || !title) {
    return { ok: false, message: "format and title are required", failureClassification: "invalid_input" };
  }
  const result = await docGen.generateDeliverable({ format, title, sections, rows, sheetName });
  if (!result.ok) {
    return { ok: false, message: result.message, failureClassification: "invalid_input" };
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
