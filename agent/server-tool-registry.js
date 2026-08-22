/* ============================================================
   Marina AI Command Hub — Tool Registry

   Allowlisted tool definitions with input/output JSON schema
   validation, risk tier, approval policy, timeout, concurrency
   limit, retry configuration, and redaction fields.

   Only tools registered here can be dispatched. Unknown actions
   are rejected as "critical" by the policy engine (fail-closed).
   ============================================================ */

/** A tool's input validation result. */
function validateToolInput(toolDef, input) {
  if (!toolDef) return { ok: false, error: "Unknown tool." };
  if (!toolDef.inputSchema) return { ok: true };

  const schema = toolDef.inputSchema;
  const errors = [];

  if (schema.required) {
    for (const field of schema.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (schema.properties) {
    for (const [key, spec] of Object.entries(schema.properties)) {
      const val = input[key];
      if (val === undefined || val === null) continue;

      if (spec.type === "string" && typeof val !== "string") {
        errors.push(`${key} must be a string`);
      } else if (spec.type === "number" && typeof val !== "number") {
        errors.push(`${key} must be a number`);
      } else if (spec.type === "boolean" && typeof val !== "boolean") {
        errors.push(`${key} must be a boolean`);
      } else if (spec.type === "array" && !Array.isArray(val)) {
        errors.push(`${key} must be an array`);
      } else if (spec.type === "object" && (typeof val !== "object" || Array.isArray(val))) {
        errors.push(`${key} must be an object`);
      }

      if (spec.type === "string" && typeof val === "string" && spec.maxLength) {
        if (val.length > spec.maxLength) {
          errors.push(`${key} exceeds max length ${spec.maxLength}`);
        }
      }

      if (spec.enum && !spec.enum.includes(val)) {
        errors.push(`${key} must be one of: ${spec.enum.join(", ")}`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, error: errors.join("; ") } : { ok: true };
}

/** Fields that must be redacted from a tool's output before persistence. */
function getRedactionFields(toolDef) {
  return toolDef?.redactionFields || [];
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
  return toolDef.availabilityState === "active";
}

/** The built-in tool registry. */
const TOOL_REGISTRY = {
  readFile: {
    name: "readFile",
    version: "1.0.0",
    purpose: "Read a file from the workspace",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    timeout: 5000,
    concurrencyLimit: 5,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    inputSchema: {
      required: ["path"],
      properties: { path: { type: "string", maxLength: 500 } },
    },
    redactionFields: [],
  },
  scanProject: {
    name: "scanProject",
    version: "1.0.0",
    purpose: "Scan the project context for files and structure",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    timeout: 10000,
    concurrencyLimit: 1,
    retryConfig: { maxRetries: 1 },
    availabilityState: "active",
    inputSchema: {},
    redactionFields: [],
  },
  generateReport: {
    name: "generateReport",
    version: "1.0.0",
    purpose: "Generate a structured Markdown report/artifact",
    riskTier: "low",
    approvalPolicy: "plan_approval",
    timeout: 30000,
    concurrencyLimit: 3,
    retryConfig: { maxRetries: 1 },
    availabilityState: "active",
    inputSchema: {
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 200 },
        content: { type: "string", maxLength: 50000 },
        format: { type: "string", enum: ["markdown", "text"] },
      },
    },
    redactionFields: [],
  },
  writeFile: {
    name: "writeFile",
    version: "1.0.0",
    purpose: "Write a file to the workspace",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    timeout: 5000,
    concurrencyLimit: 2,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    inputSchema: {
      required: ["path", "content"],
      properties: {
        path: { type: "string", maxLength: 500 },
        content: { type: "string", maxLength: 100000 },
      },
    },
    redactionFields: [],
  },
  modifyFile: {
    name: "modifyFile",
    version: "1.0.0",
    purpose: "Modify an existing file in the workspace",
    riskTier: "moderate",
    approvalPolicy: "plan_approval",
    timeout: 5000,
    concurrencyLimit: 2,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    inputSchema: {
      required: ["path"],
      properties: {
        path: { type: "string", maxLength: 500 },
        changes: { type: "string", maxLength: 100000 },
      },
    },
    redactionFields: [],
  },
  runCommand: {
    name: "runCommand",
    version: "1.0.0",
    purpose: "Execute a shell command in the workspace",
    riskTier: "high",
    approvalPolicy: "just_in_time",
    timeout: 30000,
    concurrencyLimit: 1,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    featureFlag: "MARINA_ENABLE_EXEC",
    inputSchema: {
      required: ["command"],
      properties: { command: { type: "string", maxLength: 1000 } },
    },
    redactionFields: ["token", "apiKey", "password"],
  },
  installDependencies: {
    name: "installDependencies",
    version: "1.0.0",
    purpose: "Install dependencies in the workspace",
    riskTier: "high",
    approvalPolicy: "just_in_time",
    timeout: 120000,
    concurrencyLimit: 1,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    featureFlag: "MARINA_ENABLE_EXEC",
    inputSchema: {
      required: ["packages"],
      properties: {
        packages: { type: "array" },
        packageManager: { type: "string", enum: ["npm", "yarn", "pnpm"] },
      },
    },
    redactionFields: [],
  },
  deploy: {
    name: "deploy",
    version: "1.0.0",
    purpose: "Deploy to a target environment",
    riskTier: "critical",
    approvalPolicy: "just_in_time",
    timeout: 300000,
    concurrencyLimit: 1,
    retryConfig: { maxRetries: 0 },
    availabilityState: "active",
    featureFlag: "MARINA_ENABLE_EXEC",
    inputSchema: {
      required: ["target"],
      properties: { target: { type: "string", maxLength: 200 } },
    },
    redactionFields: ["token", "apiKey", "password", "secret"],
  },
};

/** Look up a tool definition by action name. */
function getToolDefinition(action) {
  if (!action) return null;
  // Try exact match first, then case-insensitive match.
  if (TOOL_REGISTRY[action]) return TOOL_REGISTRY[action];
  const lower = action.toLowerCase();
  for (const [key, val] of Object.entries(TOOL_REGISTRY)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

/** List all registered tools (for the Integrations/Tools UI). */
function listTools() {
  return Object.values(TOOL_REGISTRY).map((t) => ({
    name: t.name,
    version: t.version,
    purpose: t.purpose,
    riskTier: t.riskTier,
    approvalPolicy: t.approvalPolicy,
    available: isToolAvailable(t),
    availabilityState: t.availabilityState,
    featureFlag: t.featureFlag || null,
  }));
}

module.exports = {
  TOOL_REGISTRY,
  validateToolInput,
  getRedactionFields,
  requiresApproval,
  isToolAvailable,
  getToolDefinition,
  listTools,
};