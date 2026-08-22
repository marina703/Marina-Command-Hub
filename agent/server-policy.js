/* ============================================================
   Marina AI Command Hub — Server-side Policy Engine

   Central risk classification + redaction for every agent/tool
   action BEFORE dispatch and again at execution time. Model
   output is treated strictly as data: nothing executes without
   passing through this module.

   Risk tiers (minimum controls):
     low       read-only local operations            → allowed after audit
     moderate  project-local writes/draft patches    → allowed when permission flag on; audited
     high      shell commands, dependency installs   → approval required (just-in-time)
     critical  deploys, payments, account changes    → approval required; manual handoff default

   Redaction: sensitive-looking keys are masked before anything is
   persisted to logs, approvals, or audit events.
   ============================================================ */

const crypto = require("crypto");

const RISK_TIERS = ["low", "moderate", "high", "critical"];

/** Risk classification per known executor action.
 *  Keys are lowercase because classifyRisk() normalizes input. */
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

/** Unknown actions are treated as critical — fail closed. */
const DEFAULT_RISK = "critical";

/** Keys whose values must never be persisted in plaintext. */
const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key)/i;

/** Commands that are always blocked regardless of tier/approval. */
const BLOCKED_COMMAND_PATTERN =
  /(rm\s+-rf\s+[\/~]|format\s+[a-z]:|del\s+\/[sf]|shutdown|reboot|mkfs|dd\s+if=|:\(\)\{.*\};:|chmod\s+-R\s+777\s+\/)/i;

/**
 * Classify an instruction/action into its risk tier.
 * @param {string} action
 * @returns {"low"|"moderate"|"high"|"critical"}
 */
function classifyRisk(action) {
  if (!action || typeof action !== "string") return DEFAULT_RISK;
  return ACTION_RISK[action.toLowerCase()] || DEFAULT_RISK;
}

/**
 * Redact a payload for safe persistence/display.
 * Returns a shallow-cloned object with sensitive values masked.
 * Bounded: strings are truncated, depth limited to 2 levels.
 */
function redactPayload(payload, maxStringLength = 300) {
  function mask(value, depth) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      return value.length > maxStringLength
        ? `${value.slice(0, maxStringLength)}… [truncated]`
        : value;
    }
    if (typeof value !== "object") return value;
    if (depth >= 2) return "[deep object omitted]";
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => mask(item, depth + 1));
    }
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[redacted]"
        : mask(val, depth + 1);
    }
    return out;
  }
  return mask(payload || {}, 0);
}

/**
 * Stable hash of a payload for approval binding (approve-the-exact-action).
 */
function payloadHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Human-readable one-line preview of an action for approval cards.
 * Never includes raw secret material (already redacted).
 */
function describeInstruction(instruction) {
  const { action, payload = {} } = instruction || {};
  switch ((action || "").toLowerCase()) {
    case "runcommand":
      return `Run shell command: ${String(payload.command || "").slice(0, 160)}`;
    case "installdependencies":
      return `Install dependencies (${payload.packageManager || "npm"}): ${Array.isArray(
        payload.packages,
      )
        ? payload.packages.join(", ").slice(0, 160)
        : String(payload.packages || "").slice(0, 160)}`;
    case "deploy":
      return `Deploy to target: ${String(payload.target || "unspecified").slice(0, 120)}`;
    case "writefile":
    case "createfile":
      return `Write file: ${String(payload.path || "").slice(0, 160)} (${
        String(payload.content || "").length
      } chars)`;
    case "modifyfile":
      return `Modify file: ${String(payload.path || "").slice(0, 160)}`;
    default:
      return `${action || "unknown action"} ${JSON.stringify(
        redactPayload(payload),
      ).slice(0, 200)}`;
  }
}

/**
 * Hard policy veto — checked before dispatch AND again at execution.
 * Returns null when allowed, or a rejection reason string.
 */
function policyVeto(instruction) {
  const action = String(instruction?.action || "").toLowerCase();
  if (action === "runcommand") {
    const command = String(instruction?.payload?.command || "");
    if (BLOCKED_COMMAND_PATTERN.test(command)) {
      return "Command matches a destructive-pattern blocklist.";
    }
  }
  if (action === "deletefolder" || action === "deletefolders") {
    return "Folder deletion is blocked by workspace policy.";
  }
  return null;
}

module.exports = {
  RISK_TIERS,
  ACTION_RISK,
  classifyRisk,
  redactPayload,
  payloadHash,
  describeInstruction,
  policyVeto,
};