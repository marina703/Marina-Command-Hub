/**
 * MarinaAI Autopilot CLI
 *
 * Runs one bounded autopilot cycle against the configured Supabase project.
 * Usage: MARINA_AUTOPILOT=1 node run-autopilot.js --workspace <workspaceId> [--maxTasks 3]
 *
 * Requires: MARINA_AUTOPILOT=1 environment variable
 * Optional: --workspace <id> (defaults to first workspace in config), --maxTasks <n> (default 3)
 */

const autopilot = require("./server-autopilot");
const { getServiceClient } = require("./server-supabase");

async function main() {
  const args = process.argv.slice(2);

  // Parse args
  let workspaceId = null;
  let maxTasks = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workspace" && i + 1 < args.length) {
      workspaceId = args[i + 1];
      i++;
    } else if (args[i] === "--maxTasks" && i + 1 < args.length) {
      maxTasks = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
MarinaAI Autopilot CLI
======================

Usage: MARINA_AUTOPILOT=1 node run-autopilot.js [options]

Options:
  --workspace <id>    Workspace ID to run autopilot on (required)
  --maxTasks <n>      Maximum tasks to act on per cycle (default: 3, max: 10)
  --help, -h          Show this help

Environment:
  MARINA_AUTOPILOT=1  Must be set to enable autopilot (safety guard)
  SUPABASE_URL        Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  Service role key for server operations

Examples:
  MARINA_AUTOPILOT=1 node run-autopilot.js --workspace ws-abc123 --maxTasks 5
      `);
      process.exit(0);
    }
  }

  if (!workspaceId) {
    console.error("Error: --workspace is required");
    process.exit(1);
  }

  if (!autopilot.isAutopilotEnabled()) {
    console.error(
      "Error: Autopilot is disabled. Set MARINA_AUTOPILOT=1 to enable.",
    );
    console.error(
      "This is a safety guard - autopilot runs bounded cycles on demand only.",
    );
    process.exit(1);
  }

  const service = getServiceClient();
  if (!service) {
    console.error(
      "Error: Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const maxTasksCap = Math.max(1, Math.min(maxTasks, 10));

  console.log(`Starting autopilot cycle...`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Max tasks: ${maxTasksCap}`);
  console.log(`Actor: autopilot`);

  const startTime = Date.now();
  const result = await autopilot.runAutopilotCycle(service, {
    workspaceId,
    actorId: "autopilot",
    maxTasks: maxTasksCap,
  });

  const duration = Date.now() - startTime;

  console.log(`\nCycle completed in ${duration}ms`);
  console.log(`Examined tasks: ${result.examined}`);
  console.log(`Outcomes:`);

  const counts = result.counts || {};
  for (const [action, count] of Object.entries(counts)) {
    console.log(`  ${action}: ${count}`);
  }

  if (result.outcomes && result.outcomes.length) {
    console.log(`\nDetails:`);
    for (const outcome of result.outcomes) {
      console.log(
        `  Task ${outcome.taskId}: ${outcome.action}${outcome.reason ? ` (${outcome.reason})` : ""}`,
      );
      if (outcome.planId)
        console.log(`    Plan: ${outcome.planId} (v${outcome.planVersion})`);
      if (outcome.runId) console.log(`    Run: ${outcome.runId}`);
    }
  }

  if (!result.ok) {
    console.error(`\nError: ${result.message}`);
    process.exit(1);
  }

  console.log(`\nCycle completed successfully.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
