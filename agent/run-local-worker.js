#!/usr/bin/env node
/* ============================================================
   MarinaAI — Local Worker CLI Harness

   Explicit, manual, bounded helper that lets a developer
   process a single queued run or a small batch in local
   development. It is enabled only when MARINA_LOCAL_WORKER=1
   is set in the environment. It is NOT a production
   worker runtime. It does not start a daemon, a service,
   a cron, or any always-on background process.

   Usage:
     MARINA_LOCAL_WORKER=1 node run-local-worker.js once
     MARINA_LOCAL_WORKER=1 node run-local-worker.js run --max 5
   ============================================================ */
const path = require("node:path");
try { require("dotenv").config({ path: ".env.local" }); } catch {}

const worker = require("./server-queue-worker");
const supabaseRepo = require("./server-supabase");

if (!worker.isLocalWorkerEnabled()) {
  console.error("Local worker harness is not enabled.");
  console.error("Set MARINA_LOCAL_WORKER=1 to use it.");
  console.error("This is a deliberate guard: there is no durable production worker in this milestone.");
  process.exit(2);
}

const cmd = process.argv[2] || "once";
const flagValue = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
};

(async () => {
  try {
    if (cmd === "once") {
      const workerId = flagValue("--worker") || "local-worker-cli";
      const out = await worker.processOnce(supabaseRepo, workerId, {});
      console.log(JSON.stringify(out, null, 2));
      process.exit(out && out.claimed ? 0 : 1);
    } else if (cmd === "run") {
      const maxIterations = Number(flagValue("--max")) || 5;
      const idleSleepMs = Number(flagValue("--sleep")) || 250;
      const out = await worker.runLocalWorker(supabaseRepo, { maxIterations, idleSleepMs });
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    } else {
      console.error("Unknown command:", cmd, "(expected 'once' or 'run')");
      process.exit(2);
    }
  } catch (err) {
    console.error("Local worker run failed:", err && err.message);
    process.exit(1);
  }
})();
