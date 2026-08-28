# Quarantine — Stale & Superseded Files

Moved here on **2026-08-28** during the post-Manus-layout audit.
Nothing in this folder is imported by runtime code. Safe to delete
after you confirm the app still works.

## Root files

| File | Why it was moved |
|---|---|
| `c` | One-shot patch script from Aug 19. It patched `dashboard-state.js` and the OLD `dashboard/public` UI, which no longer exists (replaced by the React SPA). Its job is done. |
| `incoming.txt` | 19-byte scratch file for the old listener pipeline. No code reads it. |
| `voice.txt` | Empty scratch file from the old voice pipeline. No code reads it. |
| `server-test-out.log` | Stale test log (Aug 22). |
| `vite.config.js` | Exact duplicate of `vite.config.ts`. Vite prefers `.js` over `.ts` when both exist, so this stale copy silently shadowed the maintained `.ts` config. Kept the `.ts` (referenced by `tsconfig.node.json` and the code-gen templates). |
| `vite.config.d.ts` | Stale type declaration for the quarantined `vite.config.js`. |
| `tsconfig.tsbuildinfo` / `tsconfig.node.tsbuildinfo` | TypeScript incremental build caches. Regenerated automatically by `tsc -b`. |

## docs/ — historical handoff records

These are completed-phase handoff documents (Durable queue, staging auth/RLS, security hardening, JSON→Supabase migration). They document decisions already implemented in the codebase. Kept for history, out of the active tree.

- `DURABLE_CORE_WORKFLOW_HANDOFF.md`
- `DURABLE_FOUNDATIONS_HANDOFF.md`
- `DURABLE_QUEUE_TOOL_DISPATCH_HANDOFF.md`
- `DURABLE_WORKFLOW_REMOTE_TEST_SCOPE_CORRECTION.md`
- `IMPLEMENTATION_REPORT.md`
- `JSON_MIGRATION_MAPPING_GAPS.md`
- `MIGRATION_DEFECT_REVIEW.md`
- `QUEUE_RUNTIME_DECISION.md`
- `SECURITY_HARDENING_HANDOFF.md`
- `STAGING_AUTH_INTEGRATION_HANDOFF.md`
- `STAGING_RLS_CLEANUP_HANDOFF.md`
- `STAGING_SCHEMA_APPLICATION_REPORT.md`

## Deliberately NOT quarantined (still live)

| File | Why it stays |
|---|---|
| `service-err.log` / `service-out.log` | Locked by the running MarinaAI background service. They are its active log files. |
| `STAGING_AUTH_SETUP_REQUIRED.md` | `LoginPage.tsx` points users to it by name when Supabase env vars are missing. |
| `STAGING_RLS_TEST_PLAN.md` | Referenced by the `staging-rls-remote.test.js` banner. |
| `server-workspace.js` | Imported by two test files (`rls-verification.test.js`, `tool-registry-workspace.test.js`). Test-only but needed by `npm test`. |
| `config.json` | Read at runtime by `agent.js`, `dashboard-server.js`, `server-code-gen.js`, `system-actions.js`. |
| `index.html` | The live Vite entry point (loads `/src/main.tsx`). |
| `.legacy-ui/`, `.legacy-public/` | Already quarantined in a previous pass (gitignored). |

## Restore

To restore anything: `move quarantine\<file> ..\` from `agent/`.
