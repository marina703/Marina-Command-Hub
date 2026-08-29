# MarinaAI Command Hub — Durable Foundations Handoff

## Git Branch and Status

- **Branch**: `feature/durable-foundations` (created from `main`)
- **Remote**: `origin: https://github.com/marina703/Marina-Command-Hub.git`
- **Default branch**: `main` (not modified)
- **PR/deployment**: **Not created** — intentionally. No merge to `main`, no PR opened, no Vercel deployment triggered. All changes are local on the feature branch pending your review.
- **Working-tree status**: Modified files (existing) + new untracked files (durable foundation additions). No commits have been made yet — changes are staged for your review before committing.

### Files created on this branch
| File | Purpose |
|---|---|
| `supabase/migrations/20260821000001_core_schema.sql` | Core schema: 17 tables, RLS policies, private storage bucket, triggers |
| `agent/server-supabase.js` | Server-side Supabase repository layer (service-role, never browser) |
| `agent/migrate-json-to-supabase.js` | JSON-state migration tool (dry-run only) |
| `agent/.env.example` | Environment variable names only (no real values) |
| `agent/test/rls-verification.test.js` | RLS and workspace isolation verification tests |

### Files modified on this branch (from prior implementation phase)
| File | Changes |
|---|---|
| `agent/dashboard-state.js` | Extended with plans, runs, artifacts, sources, run events |
| `agent/dashboard-server.js` | Added API routes for plans, runs, artifacts, tools |
| `agent/server-workspace.js` | Workspace authorization module |
| `agent/server-tool-registry.js` | Tool registry with schema validation |
| `agent/src/lib/api.ts` | Typed API client for new endpoints |
| `agent/src/components/dashboard/TaskDetail.tsx` | Three-region task workspace |
| `agent/src/components/dashboard/IntegrationsPanel.tsx` | Tool registry UI |
| `agent/src/components/dashboard/Sidebar.tsx` | New nav items |
| `agent/src/App.tsx` | Integrations + Automations views |
| `agent/IMPLEMENTATION_REPORT.md` | Full audit report |

---

## Supabase Project

- **Project ID**: `MarinaAI` (from `supabase/config.toml`)
- **Project reference**: Identified via the connected Supabase MCP service. The project is the intended development/staging project.
- **Migrations prepared**: 1 migration file (`20260821000001_core_schema.sql`) — **not yet applied** to the remote Supabase project.
- **Migration impact summary**:
  - Creates 17 tables: `profiles`, `workspaces`, `workspace_memberships`, `projects`, `tasks`, `task_context_items`, `plans`, `plan_steps`, `runs`, `run_events`, `approval_requests`, `artifacts`, `sources`, `audit_events`, `tool_invocations`, `integration_connections`, `automations`
  - Creates 3 helper functions: `has_workspace_role()`, `user_can_access_workspace()`, `handle_new_user()`
  - Creates 1 bootstrap function: `create_workspace_with_owner()` (SECURITY DEFINER, authenticated-only, idempotent)
  - Creates 1 private storage bucket: `artifacts` (public = false, 50MB limit, MIME-type allowlist)
  - Creates RLS policies on all tables (viewer/member/admin/owner hierarchy)
  - Creates storage RLS policies (workspace-scoped read/write/delete)
  - Creates `updated_at` triggers on 6 tables
  - Creates auto-profile trigger on `auth.users` insert
  - **Ordering corrected (2026-08-22)**: Extensions → base tables → domain tables → helper functions → bootstrap function → RLS enable + policies → storage → triggers. See `MIGRATION_DEFECT_REVIEW.md` for details.
- **RLS verification result**: Workspace isolation tests pass locally (54/54 tests). Cross-workspace access correctly throws `AuthorizationError`. RLS policies are defined in the migration but have not been tested against the live remote database yet (migration not applied).
- **Live JSON migration**: **Pending confirmation**. The dry-run report shows 16 records (12 tasks, 2 ideas, 2 summaries) that would be migrated. 12 records lack a `workspaceId` and would be assigned to the default workspace. No live migration has been performed.

### Migration application — requires your explicit confirmation
Before I apply the schema migration to the connected remote Supabase project, I need you to confirm:
1. Apply `20260821000001_core_schema.sql` to the remote Supabase project?
2. After schema is applied, run the RLS verification suite against the live database?
3. After RLS passes, perform the live JSON-to-Supabase data migration (16 records)?

---

## Vercel Project/Configuration Status

- **Connected Vercel project**: Identified via the connected Vercel MCP service.
- **Production deployment**: **Not changed**. No deployment triggered.
- **Environment variables**: **Not changed**. No `NEXT_PUBLIC_COMMAND_HUB_URL` set. No production variables altered.
- **Public Hub URL**: Remains in the truthful `/hub-access` fallback state. The public landing page CTAs resolve to `/hub-access` (request-access page).
- **Confirmation**: No public Hub URL or production deployment/configuration was changed during this task.

### Environment variable checklist (for future configuration — NOT set now)
| Variable | Scope | Server-only? | Status |
|---|---|---|---|
| `SUPABASE_URL` | Server | Yes | Not set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | **Yes — never browser** | Not set |
| `SUPABASE_ANON_KEY` | Client+Server | No (safe for browser) | Not set |
| `NEXT_PUBLIC_SUPABASE_URL` | Client | No | Not set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | No | Not set |
| `NEXT_PUBLIC_COMMAND_HUB_URL` | Client (web/) | No | Not set (fallback to /hub-access) |
| `MARINA_ENABLE_EXEC` | Server | Yes | Not set (defaults to disabled) |

---

## Exact Manual Confirmations Still Required

1. **Commit the changes**: Should I commit the durable-foundation files to the `feature/durable-foundations` branch? (No merge to `main`.)
2. **Apply Supabase migration**: Should I apply `20260821000001_core_schema.sql` to the connected remote Supabase project?
3. **Run RLS verification against live DB**: After migration, should I run the verification suite?
4. **Live JSON migration**: Should I perform the live data migration (16 records from `dashboard-state.json` to Supabase)?
5. **Install `@supabase/supabase-js` in `agent/`**: The server-side repository layer requires this package. Should I run `npm install @supabase/supabase-js` in the `agent/` directory?
6. **Preview deployment**: Would you like a preview deployment after local tests pass? (Would deploy the agent/ SPA to Vercel preview, accessible only to authenticated operators, with `NEXT_PUBLIC_COMMAND_HUB_URL` pointing to the preview URL.)

---

## Test/Build Results

### Tests (57/57 pass — 3 new ordering/bootstrap tests)
```
npm test
ℹ tests 57
ℹ pass 57
ℹ fail 0
ℹ duration_ms 3676.4598
```

### Build
```
npm run build
✓ 1903 modules transformed.
✓ built in 813ms
```

### CTA Link-Integrity
```
npm run test:links (in web/)
CTA link-integrity check passed (Hub → /hub-access fallback)
```

### Migration Dry-Run
```
node migrate-json-to-supabase.js --dry-run
Total records: 16
✅ Dry run complete. No data was written to Supabase.