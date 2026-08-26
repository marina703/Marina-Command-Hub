/* ============================================================
   Marina AI Command Hub — Tool Registry & Dispatch Boundary

   The only gateway for tool/handler dispatch. The agent
   routes, the React components, and the queue worker all
   route through `getToolDefinition()` and `listTools()`.
   Unknown actions are rejected as "not_configured" or
   "policy_blocked" (fail-closed).

   In this milestone exactly ONE handler is wired for
   execution:

     - safe-internal: the bounded, providerless plan-brief
       workflow. It is the only entry that returns ok=true
       from `dispatch()`.

   All other "business-oriented" tools are honest descriptors
   in one of three truthful states:

     - available (ready to dispatch right now)
     - not_configured (no provider/integration; safe to display)
     - planned (intentional roadmap item; not implemented)
     - blocked (intentionally disabled; never returns a side effect)

   No shell, no browser, no web retrieval, no message/email
   sending, no payment, no deployment, no third-party upload,
   no external CRM/CMS modification, and no credential
   operation is registered as executable.
   ============================================================ */

const AVAILABILITY = {
  AVAILABLE: "available",
  NOT_CONFIGURED: "not_configured",
  PLANNED: "planned",
  BLOCKED: "blocked",
  DISABLED: "disabled",
};

/** Risk classification per known executor action. */
const ACTION_RISK = {
  readfile: "low",
  scanproject: "low",
  generatereport: "low",
  writefile: "moderate",
  modifyfile: "moderate",
  createfile: "moderate",
  runcommand: "high",
  installdependencies: "high",
  deploy: "critical",
};

/** Blocked categories. Listed individually so the UI and the
 *  worker can show truthful "blocked" state. */
const BLOCKED_CATEGORIES = new Set([
  "shell",
  "browserAutomation",
  "webRetrieval",
  "messaging",
  "publishing",
  "payment",
  "deployment",
  "thirdPartyUpload",
  "externalCrm",
  "externalCms",
  "credentials",
  "modelInference",
]);

/** Validate a tool's input payload against its declared schema. */
function validateToolInput(toolDef, input) {
  if (!toolDef) return { ok: false, error: "Unknown tool." };
  if (!toolDef.inputSchema) return { ok: true };
  const schema = toolDef.inputSchema;
  const errors = [];
  if (schema.required) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push("Missing required field: " + field);
      }
    }
  }
  if (schema.properties) {
    for (const [key, spec] of Object.entries(schema.properties)) {
      const val = input[key];
      if (val === undefined || val === null) continue;
      if (spec.type === "string" && typeof val !== "string") {
        errors.push(key + " must be a string");
      } else if (spec.type === "number" && typeof val !== "number") {
        errors.push(key + " must be a number");
      } else if (spec.type === "boolean" && typeof val !== "boolean") {
        errors.push(key + " must be a boolean");
      } else if (spec.type === "array" && !Array.isArray(val)) {
        errors.push(key + " must be an array");
      } else if (spec.type === "object" && (typeof val !== "object" || Array.isArray(val))) {
        errors.push(key + " must be an object");
      }
      if (spec.type === "string" && typeof val === "string" && spec.maxLength) {
        if (val.length > spec.maxLength) {
          errors.push(key + " exceeds max length " + spec.maxLength);
        }
      }
      if (spec.enum && !spec.enum.includes(val)) {
        errors.push(key + " must be one of: " + spec.enum.join(", "));
      }
    }
  }
  if (schema.additionalProperties === false && input) {
    for (const k of Object.keys(input)) {
      if (!schema.properties || !schema.properties[k]) {
        errors.push("Unexpected field: " + k);
      }
    }
  }
  return errors.length > 0 ? { ok: false, error: errors.join("; ") } : { ok: true };
}

/** Fields that must be redacted from a tool's output before persistence. */
function getRedactionFields(toolDef) {
  return (toolDef && toolDef.redactionFields) || [];
}

/** Whether a tool requires just-in-time approval at execution time. */
function requiresApproval(toolDef) {
  if (!toolDef) return true;
  return toolDef.approvalPolicy === "just_in_time";
}

/** Whether a tool is currently available (feature flag / config check). */
function isToolAvailable(toolDef) {
  if (!toolDef) return false;
  if (toolDef.featureFlag && !process.env[toolDef.featureFlag]) return false;
  return toolDef.availabilityState === AVAILABILITY.AVAILABLE;
}

/** Whether a tool is in a "ready-to-dispatch" state at all. */
function isDispatchable(toolDef) {
  if (!toolDef) return false;
  return toolDef.executable === true && isToolAvailable(toolDef);
}

/** Map a tool descriptor to the public UI shape used by IntegrationsPanel. */
function toPublicShape(toolDef) {
  return {
    name: toolDef.name,
    version: toolDef.version,
    purpose: toolDef.purpose,
    riskTier: toolDef.riskTier,
    approvalPolicy: toolDef.approvalPolicy,
    availability: toolDef.availability,
    availabilityState: toolDef.availabilityState,
    featureFlag: toolDef.featureFlag || null,
    executable: toolDef.executable === true,
    dispatchable: isDispatchable(toolDef),
    timeoutMs: toolDef.timeout || null,
    concurrencyLimit: toolDef.concurrencyLimit || null,
    retryClassifications: toolDef.retryClassifications || null,
  };
}

/** The single registered tool registry. */
const TOOL_REGISTRY = {
  // ── The only enabled executable handler in this milestone ──
  "safe-internal": {
    name: "safe-internal",
    version: "1.0.0",
    handlerId: "safe-internal",
    purpose: "Generate a private Markdown plan brief from an approved plan. Providerless, deterministic, side-effect-free inside MarinaAI.",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    executable: true,
    timeout: 8000,
    concurrencyLimit: 1,
    retryConfig: { maxRetries: 1, retryClassifications: ["internal_error", "timeout"] },
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["workspaceId", "taskId", "planId"],
      additionalProperties: false,
      properties: {
        workspaceId: { type: "string", maxLength: 100 },
        taskId: { type: "string", maxLength: 100 },
        planId: { type: "string", maxLength: 100 },
        idempotencyKey: { type: "string", maxLength: 200 },
      },
    },
  },
  // ── Phase 4A: Research + Coding Tools (planned/not_configured) ──
  "web-search": {
    name: "web-search",
    version: "1.0.0",
    handlerId: "web-search",
    purpose: "Search the web via Tavily/SerpAPI/Exa with provider fallback. Requires API key configuration.",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "WEB_SEARCH_ENABLED",
    executable: true,
    redactionFields: ["apiKey"],
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 500 },
        maxResults: { type: "number", minimum: 1, maximum: 20 },
        provider: { type: "string", enum: ["tavily", "serpapi", "exa"] },
      },
    },
  },
  "research": {
    name: "research",
    version: "1.0.0",
    handlerId: "research",
    purpose: "Deep research with parallel subtask decomposition, web search, and structured synthesis. Requires web-search to be configured.",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "RESEARCH_ENABLED",
    executable: true,
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 1000 },
        maxSubtasks: { type: "number", minimum: 1, maximum: 16 },
        depth: { type: "string", enum: ["quick", "standard", "deep"] },
        format: { type: "string", enum: ["markdown", "json"] },
        concurrency: { type: "number", minimum: 1, maximum: 5 },
      },
    },
  },
  "code-generation": {
    name: "code-generation",
    version: "1.0.0",
    handlerId: "code-generation",
    purpose: "Template-based code/project generation (Node CLI, React, FastAPI, Express). Requires template configuration.",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "CODE_GEN_ENABLED",
    executable: true,
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["template", "variables"],
      additionalProperties: false,
      properties: {
        template: { type: "string", enum: ["node-cli", "react-app", "python-fastapi", "express-api"] },
        variables: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", pattern: "^[a-z0-9-]+$" },
            description: { type: "string" },
          },
        },
      },
    },
  },
  "document-generation": {
    name: "document-generation",
    version: "1.0.0",
    handlerId: "document-generation",
    purpose: "Generate .docx, .xlsx, or .pdf deliverables from structured content. Safe, in-memory, no shell.",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "DOC_GEN_ENABLED",
    executable: true,
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["format", "title"],
      additionalProperties: false,
      properties: {
        format: { type: "string", enum: ["docx", "xlsx", "pdf", "pptx"] },
        title: { type: "string", maxLength: 200 },
        sheetName: { type: "string", maxLength: 80 },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
            },
          },
        },
        rows: { type: "array", items: { type: "array" } },
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
  "memory": {
    name: "memory",
    version: "1.0.0",
    handlerId: "memory",
    purpose: "Persistent knowledge-graph memory: remember entities/relations, recall by query, reason over paths. Self-improving agent memory.",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "MEMORY_ENABLED",
    executable: true,
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["action"],
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["remember", "recall", "reason", "stats"] },
        id: { type: "string", maxLength: 100 },
        type: { type: "string", maxLength: 50 },
        label: { type: "string", maxLength: 200 },
        props: { type: "object" },
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              to: { type: "string" },
              relation: { type: "string" },
              weight: { type: "number" },
            },
          },
        },
        query: { type: "string", maxLength: 300 },
        depth: { type: "number", minimum: 0, maximum: 6 },
        limit: { type: "number", minimum: 1, maximum: 50 },
        start: { type: "string" },
        end: { type: "string" },
        maxHops: { type: "number", minimum: 1, maximum: 10 },
      },
    },
  },
  "agent-bus": {
    name: "agent-bus",
    version: "1.0.0",
    handlerId: "agent-bus",
    purpose: "Cross-agent coordination: register agents, publish/subscribe topic messages, and delegate tasks between agents.",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.AVAILABLE,
    availabilityState: AVAILABILITY.AVAILABLE,
    featureFlag: "AGENT_BUS_ENABLED",
    executable: true,
    redactionFields: [],
    inputSchema: {
      type: "object",
      required: ["action"],
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["register", "find", "list", "publish", "delegate", "messages", "delegations", "stats"] },
        id: { type: "string", maxLength: 100 },
        capabilities: { type: "array", items: { type: "string" } },
        capability: { type: "string", maxLength: 100 },
        topic: { type: "string", maxLength: 100 },
        from: { type: "string", maxLength: 100 },
        to: { type: "string", maxLength: 100 },
        payload: { type: "object" },
        task: { type: "string", maxLength: 500 },
        context: { type: "object" },
        expectedOutput: { type: "string", maxLength: 500 },
      },
    },
  },
  "sandbox": {
    name: "sandbox",
    version: "1.0.0",
    handlerId: "sandbox",
    purpose: "Secure sandboxed execution for Python, Node.js, Shell, and Deno. Requires runtime availability.",
    riskTier: "high",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.PLANNED,
    availabilityState: AVAILABILITY.PLANNED,
    featureFlag: "SANDBOX_ENABLED",
    executable: false,
    redactionFields: ["stdin"],
    inputSchema: {
      type: "object",
      required: ["language", "code"],
      additionalProperties: false,
      properties: {
        language: { type: "string", enum: ["python", "node", "shell", "deno"] },
        code: { type: "string", maxLength: 50000 },
        timeoutMs: { type: "number", minimum: 1000, maximum: 300000 },
        env: { type: "object" },
      },
    },
  },
  // ── Existing "planned" descriptors — never executable ──
  "market-research": {
    name: "market-research",
    version: "0.0.0",
    handlerId: null,
    purpose: "Planned: source-controlled research. Requires an approved research provider path and a policy-approved data license.",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.PLANNED,
    availabilityState: AVAILABILITY.PLANNED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "campaign-brief": {
    name: "campaign-brief",
    version: "0.0.0",
    handlerId: null,
    purpose: "Not configured. Approved provider/tool path required before any campaign brief automation is enabled.",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.NOT_CONFIGURED,
    availabilityState: AVAILABILITY.NOT_CONFIGURED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "proposal-drafting": {
    name: "proposal-drafting",
    version: "0.0.0",
    handlerId: null,
    purpose: "Planned. If a safe internal template is later added it will be registered through this boundary; today only safe-internal is wired.",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    availability: AVAILABILITY.PLANNED,
    availabilityState: AVAILABILITY.PLANNED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "client-delivery": {
    name: "client-delivery",
    version: "0.0.0",
    handlerId: null,
    purpose: "Private artifact handling only. External sending/export is not enabled in this milestone.",
    riskTier: "high",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "business-connection": {
    name: "business-connection",
    version: "0.0.0",
    handlerId: null,
    purpose: "No integration configured. Adding a CRM/email/calendar integration requires an explicit per-workspace approval and a separate audit pass.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.NOT_CONFIGURED,
    availabilityState: AVAILABILITY.NOT_CONFIGURED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  // ── Honest "blocked" descriptors — never executable ──
  "shell-exec": {
    name: "shell-exec",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Shell execution is intentionally disabled.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "browser-automation": {
    name: "browser-automation",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Browser automation is intentionally disabled.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "web-retrieval": {
    name: "web-retrieval",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Web retrieval is intentionally disabled in this milestone.",
    riskTier: "high",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "messaging-send": {
    name: "messaging-send",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Message/email sending is intentionally disabled.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "payment-execute": {
    name: "payment-execute",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Payment execution is intentionally disabled.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  "deployment-execute": {
    name: "deployment-execute",
    version: "0.0.0",
    handlerId: null,
    purpose: "Blocked. Deployment execution is intentionally disabled.",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    availability: AVAILABILITY.BLOCKED,
    availabilityState: AVAILABILITY.BLOCKED,
    executable: false,
    redactionFields: [],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
};

function getToolDefinition(action) {
  if (!action) return null;
  if (TOOL_REGISTRY[action]) return TOOL_REGISTRY[action];
  const lower = action.toLowerCase();
  for (const [key, val] of Object.entries(TOOL_REGISTRY)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

function listTools() {
  return Object.values(TOOL_REGISTRY).map(toPublicShape);
}

function listDispatchableTools() {
  return Object.values(TOOL_REGISTRY).filter(isDispatchable).map(toPublicShape);
}

function listExecutables() {
  return Object.values(TOOL_REGISTRY).filter((t) => t.executable === true).map(toPublicShape);
}

module.exports = {
  AVAILABILITY,
  ACTION_RISK,
  BLOCKED_CATEGORIES,
  TOOL_REGISTRY,
  validateToolInput,
  getRedactionFields,
  requiresApproval,
  isToolAvailable,
  isDispatchable,
  toPublicShape,
  getToolDefinition,
  listTools,
  listDispatchableTools,
  listExecutables,
};
