/* ============================================================
   MarinaAI — JSON State Migration Tool
   Reads the existing dashboard-state.json and produces a dry-run
   report of what would be migrated to Supabase tables.

   Usage:
     node migrate-json-to-supabase.js --dry-run
     node migrate-json-to-supabase.js --dry-run --state path/to/state.json

   This tool does NOT write to Supabase. It only reads the JSON
   state file and produces a report. A live migration requires
   explicit confirmation after reviewing the report.
   ============================================================ */

const fs = require("fs");
const path = require("path");

function loadState(statePath) {
  const resolved =
    statePath || path.join(__dirname, "dashboard-state.json");
  if (!fs.existsSync(resolved)) {
    console.error(`State file not found: ${resolved}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function analyzeState(state) {
  const report = {
    summary: {},
    details: {},
    warnings: [],
    counts: {},
  };

  // Count records by type
  report.counts = {
    tasks: (state.tasks || []).length,
    completedHistory: (state.completedHistory || []).length,
    brainstormIdeas: (state.brainstormIdeas || []).length,
    meetingAgenda: (state.meetingAgenda || []).length,
    aiSummaries: (state.aiSummaries || []).length,
    projectMilestones: (state.projectMilestones || []).length,
    meetingNotes: (state.meetingNotes || []).length,
    commandHubUpdates: (state.commandHubUpdates || []).length,
    approvals: (state.approvals || []).length,
    auditEvents: (state.auditEvents || []).length,
    plans: (state.plans || []).length,
    planSteps: (state.planSteps || []).length,
    runs: (state.runs || []).length,
    runEvents: (state.runEvents || []).length,
    artifacts: (state.artifacts || []).length,
    sources: (state.sources || []).length,
    toolInvocations: (state.toolInvocations || []).length,
  };

  const totalRecords = Object.values(report.counts).reduce(
    (a, b) => a + b,
    0,
  );
  report.summary.totalRecords = totalRecords;
  report.summary.statePath = path.join(__dirname, "dashboard-state.json");

  // Check for fields that need transformation
  if (state.approvals) {
    const pendingApprovals = state.approvals.filter(
      (a) => a.status === "pending",
    );
    if (pendingApprovals.length > 0) {
      report.warnings.push(
        `${pendingApprovals.length} pending approval(s) will be migrated with status 'pending'. ` +
          "Consider expiring them before migration.",
      );
    }
    const approvalsWithInstructions = state.approvals.filter(
      (a) => a.instruction,
    );
    if (approvalsWithInstructions.length > 0) {
      report.warnings.push(
        `${approvalsWithInstructions.length} approval(s) contain raw instruction payloads. ` +
          "These will be stripped during migration (only payload_hash and payload_preview are preserved).",
      );
    }
  }

  // Check for records without workspace_id
  const allRecords = [
    ...(state.tasks || []).map((r) => ({ type: "task", record: r })),
    ...(state.approvals || []).map((r) => ({ type: "approval", record: r })),
    ...(state.plans || []).map((r) => ({ type: "plan", record: r })),
    ...(state.runs || []).map((r) => ({ type: "run", record: r })),
    ...(state.artifacts || []).map((r) => ({ type: "artifact", record: r })),
    ...(state.auditEvents || []).map((r) => ({ type: "auditEvent", record: r })),
  ];

  const withoutWorkspace = allRecords.filter(
    (r) => !r.record.workspaceId,
  );
  if (withoutWorkspace.length > 0) {
    report.warnings.push(
      `${withoutWorkspace.length} record(s) lack a workspaceId. ` +
        "They will be assigned to the default workspace during migration.",
    );
  }

  // Map old fields to new schema
  report.details.fieldMappings = {
    tasks: {
      id: "id (UUID generated if not UUID format)",
      title: "title",
      owner: "creator_id (requires user lookup)",
      priority: "priority",
      status: "status",
      progress: "(dropped — not in schema; use run progress instead)",
      updatedAt: "updated_at",
    },
    approvals: {
      id: "id (UUID generated if not UUID format)",
      action: "action_type",
      riskTier: "risk_tier",
      description: "reason",
      payloadHash: "payload_hash",
      payloadPreview: "payload_preview",
      status: "status",
      instruction: "(STRIPPED — never migrated)",
      expiresAt: "expires_at",
      decidedAt: "decided_at",
      decisionNote: "decision_note",
    },
    plans: {
      id: "id (UUID generated if not UUID format)",
      taskId: "task_id",
      version: "version",
      status: "status",
      summary: "summary",
      assumptions: "assumptions (jsonb)",
      risks: "risks (jsonb)",
    },
    runs: {
      id: "id (UUID generated if not UUID format)",
      taskId: "task_id",
      planId: "plan_id",
      status: "status",
      attemptCount: "attempt_count",
      parentRunId: "parent_run_id",
    },
  };

  // Backup/checksum plan
  report.summary.backupPlan =
    "Before migration: (1) Export dashboard-state.json to a timestamped backup. " +
    "(2) Compute SHA-256 checksum of the file. " +
    "(3) Run migration in dry-run mode. " +
    "(4) Review report. " +
    "(5) On confirmation, run live migration with --apply flag. " +
    "(6) Verify record counts match. " +
    "(7) Keep backup for rollback.";

  return report;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const stateArgIdx = args.indexOf("--state");
  const statePath =
    stateArgIdx >= 0 ? args[stateArgIdx + 1] : undefined;

  if (!dryRun) {
    console.error(
      "This tool currently only supports --dry-run mode. Live migration requires explicit confirmation.",
    );
    console.error("Usage: node migrate-json-to-supabase.js --dry-run [--state path]");
    process.exit(1);
  }

  const state = loadState(statePath);
  const report = analyzeState(state);

  console.log("=== MarinaAI JSON-to-Supabase Migration Report (DRY RUN) ===\n");
  console.log(`State file: ${report.summary.statePath}`);
  console.log(`Total records: ${report.summary.totalRecords}\n`);

  console.log("Record counts by type:");
  for (const [type, count] of Object.entries(report.counts)) {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log("\n⚠ Warnings:");
    for (const w of report.warnings) {
      console.log(`  • ${w}`);
    }
  }

  console.log("\nField mappings:");
  for (const [table, mappings] of Object.entries(report.details.fieldMappings)) {
    console.log(`\n  ${table}:`);
    for (const [old, neu] of Object.entries(mappings)) {
      console.log(`    ${old} → ${neu}`);
    }
  }

  console.log("\nBackup plan:");
  console.log(`  ${report.summary.backupPlan}`);

  console.log("\n✅ Dry run complete. No data was written to Supabase.");
  console.log("To perform a live migration, review this report and confirm with the operator.");
}

main();