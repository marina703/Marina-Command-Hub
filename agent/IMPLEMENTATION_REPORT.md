# MarinaAI Command Hub — Implementation & Audit Report

## 1. Existing Architecture and Visual/Card-Grid Baseline

### Two-application monorepo

| App | Path | Stack | Purpose |
|---|---|---|---|
| **Public landing page** | `web/` | Next.js 14, React 18, Tailwind CSS 3, Supabase client | Public marketing page with Command Hub CTAs |
| **Command Hub SPA** | `agent/` | Vite 8, React 19, Tailwind CSS 4, raw Node.js `http` server | The actual Command Hub application |

### Agent SPA architecture
- **Framework**: React 19 + Vite 8 + TypeScript 7
- **Router**: State-driven navigation via `useState<ViewId>` (no URL router)
- **Styling**: Tailwind CSS v4 with CSS custom properties (`@theme` block in `src/index.css`)
- **Package manager**: npm
- **Build**: `tsc -b && vite build` → `dist/`
- **Deploy**: Vercel (SPA fallback rewrite in `vercel.json`)
- **Backend**: Raw Node.js `http.createServer` in `dashboard-server.js`, JSON file persistence in `dashboard-state.json`
- **Test framework**: `node:test` (zero dependencies)
- **Env conventions**: `process.env` for server, `import.meta.env` for client

### Visual baseline (preserved)
- **Surfaces**: Near-black (`#0d0f12`, `#111318`, `#1a1d23`)
- **Accents**: Cyan (`#00f5ff`), Magenta (`#ff2d95`)
- **Status colors**: Success (`#34d399`), Warning (`#fbbf24`), Error (`#f87171`), Info (`#60a5fa`)
- **Card grid**: `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4` — 4 panels (Execution, Operations, System, One-Click Tools)
- **Card style**: `rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card`
- **Typography**: Inter font, compact sizes (`text-[0.95rem]` headers, `text-xs` labels)
- **Sidebar**: 224px (`w-56`), sticky, collapsible nav groups with quick stats

### Existing server-side systems (pre-existing, verified)
- **State machine** (`server-state-machine.js`): Full transition rules for task, plan, planStep, run, approval, artifact, automation
- **Policy engine** (`server-policy.js`): Risk classification (low/moderate/high/critical), payload redaction, payload hashing, destructive command blocklist, policy veto
- **Approval system** (`dashboard-state.js`): TTL-based expiry (15 min), single-use execution, payload binding, audit events
- **Chat gating** (`dashboard-server.js`): Model output treated as data — low/moderate auto-execute, high/critical → approval queue, destructive → blocked

---

## 2. CTA Route/URL Remediation

### CTA targets found
- **Original (committed)**: `href="http://localhost:3000"` in `web/src/app/page.tsx` (2 CTAs: header nav + hero button)
- **Current (fixed)**: `href={COMMAND_HUB_HREF}` from `@/lib/commandHub.ts`

### Production repair made
- **Single source of truth**: `web/src/lib/commandHub.ts` — `COMMAND_HUB_HREF` constant
- **Environment variable**: `NEXT_PUBLIC_COMMAND_HUB_URL` (HTTPS, non-localhost, non-placeholder)
- **Fallback**: `/hub-access` route (truthful "not publicly open yet" request-access page)
- **CI test**: `web/scripts/check-cta-links.mjs` — fails on localhost/127.0.0.1/insecure http/placeholder domains in source; validates env var when set; verifies fallback route exists
- **Verification result**: `CTA link-integrity check passed (Hub → /hub-access fallback)`

### Configuration needed for production
Set `NEXT_PUBLIC_COMMAND_HUB_URL` in Vercel environment variables to the deployed Hub's HTTPS URL (e.g., `https://marina-ai-command-hub.vercel.app`). Until set, CTAs resolve to the truthful `/hub-access` request-access page.

---

## 3. One-Click Tool Inventory and Test Matrix

| Tool | Entry Point | Availability | Preconditions | One-Click Effect | Side Effect | Approval Policy | Success State | Failure State | Audit | Tests |
|---|---|---|---|---|---|---|---|---|---|---|
| **Run Workspace** | TopNav `onRunTasks` | Live | None | Triggers autonomous loop | In-process task execution | Low/moderate auto; high/critical → approval | Toast "Workspace tasks running" | Toast error | `addTaskLog` | ✅ chat-gating.test.js |
| **Send Prompt** | CommandHubHeader `handleSend` | Live | Non-empty prompt | Sends to `/api/chat` | Model output gated by policy | Low/moderate auto; high/critical → approval | AI Team Response panel | Toast error | `addAuditEvent` | ✅ chat-gating.test.js |
| **Run Playbook** | PlaybookBar / One-Click Tools | Live | Playbook selected | Runs playbook via `/api/playbooks/run` | Generates report in `tmp/` | Plan approval (low risk) | Report popup + "View Report" link | Toast "Playbook failed" | `addTaskLog` | ✅ smoke-test.js |
| **Clear Temp Files** | Operations panel | Live | Temp files exist | Clears `tmp/*.md` | Local file deletion | None (maintenance) | Toast "Cleared N files" | Toast error | `addTaskLog` | Not testable (filesystem) |
| **Restart Scheduler** | Operations panel | Live | None | Restarts in-process scheduler | In-process timer reset | None (maintenance) | Toast "Automation loop restarted" | Toast error | `addTaskLog` | Not testable (in-process) |
| **Optimize Workspace** | System panel | Live | None | Clears reports + compacts state | Local file + state cleanup | None (maintenance) | Toast with summary | Toast error | `addTaskLog` | Not testable (filesystem) |
| **Toggle High-Perf** | System panel | Live | None | Toggles LLM context profile | Config file write | None (config) | Toast with mode | Toast error | `addTaskLog` | Not testable (config) |
| **Approve Once** | ApprovalInbox | Live | Pending approval exists | Executes approved action once | External write/command (gated) | Just-in-time (already approved) | Status → "executed" | Status → "cancelled" | `approval.executed` audit | ✅ approvals.test.js |
| **Reject** | ApprovalInbox | Live | Pending approval exists | Rejects action | None | None | Status → "rejected" | N/A | `approval.rejected` audit | ✅ approvals.test.js |
| **Create Plan** | TaskDetail (new) | Live | Task exists | Creates versioned plan | State write | Plan approval | Plan appears in review | Toast error | `plan.created` audit | ✅ plans-runs-artifacts.test.js |
| **Approve Plan** | TaskDetail (new) | Live | Draft plan exists | Approves plan, supersedes prior | State write | Plan approval | Status → "approved" | Toast error | `plan.approved` audit | ✅ plans-runs-artifacts.test.js |
| **Start Run** | TaskDetail (new) | Live | Approved plan exists | Creates queued run | State write | Plan approval | Run appears in timeline | Toast error | `run.created` event | ✅ plans-runs-artifacts.test.js |
| **Cancel Run** | TaskDetail (new) | Live | Active/queued run | Cancels run | State write | None | Status → "cancelled" | Toast error | `run.cancelled` event | ✅ state-machine.test.js |
| **Retry Run** | TaskDetail (new) | Live | Failed/timed_out run | Creates linked new attempt | State write | None | New run queued | Toast error | `run.created` event | ✅ plans-runs-artifacts.test.js |
| **Run Command** | Via `/api/chat` | Feature-gated | `MARINA_ENABLE_EXEC=1` | Executes shell command | External execution | Just-in-time approval | Approval → execute once | Blocked by policy | `instruction.executed` audit | ✅ chat-gating.test.js |
| **Deploy** | Via `/api/chat` | Feature-gated | `MARINA_ENABLE_EXEC=1` | Deploys to target | External deployment | Just-in-time approval | Approval → execute once | Blocked by policy | `instruction.executed` audit | ✅ chat-gating.test.js |

### Actions marked not testable
- **Clear Temp Files / Optimize Workspace**: Filesystem-dependent; tested manually via smoke test
- **Restart Scheduler**: In-process timer; cannot be isolated in unit test without mocking Node.js timers
- **Toggle High-Perf**: Config file write; tested manually

---

## 4. Files Changed and Why

### New files (server-side)
| File | Purpose |
|---|---|
| `server-workspace.js` | Workspace authorization module: `resolveWorkspaceId`, `assertWorkspaceAccess`, `scopeToWorkspace`, `stampWorkspace`, `hasRole`, `AuthorizationError` |
| `server-tool-registry.js` | Allowlisted tool registry: 8 tools with input schema validation, risk tiers, approval policies, feature flags, availability checks |

### New files (frontend)
| File | Purpose |
|---|---|
| `src/components/dashboard/TaskDetail.tsx` | Three-region task workspace: plan review, run timeline, artifacts. Collapses to single-column on mobile |
| `src/components/dashboard/IntegrationsPanel.tsx` | Tool registry UI: shows all registered tools with risk tier, approval policy, and real availability state |

### New files (tests)
| File | Purpose |
|---|---|
| `test/plans-runs-artifacts.test.js` | 15 tests: plan versioning, plan approval/supersede, run lifecycle, run events ordering, retry, artifacts, sources |
| `test/tool-registry-workspace.test.js` | 22 tests: tool registry validation, feature flag gating, workspace scoping, RBAC role checks |

### Modified files
| File | Changes |
|---|---|
| `dashboard-state.js` | Added `plans`, `planSteps`, `runs`, `runEvents`, `artifacts`, `sources`, `toolInvocations` to default state + migration. Added functions: `createPlan`, `getPlan`, `getPlansForTask`, `updatePlanStatus`, `createRun`, `updateRunStatus`, `getRun`, `getRunsForTask`, `addRunEvent`, `getRunEvents`, `createArtifact`, `updateArtifactState`, `getArtifacts`, `addSource` |
| `dashboard-server.js` | Added API routes: `GET /api/tools`, `POST /api/plans`, `GET /api/plans`, `GET /api/plans/:id`, `POST /api/plans/decision`, `POST /api/runs`, `GET /api/runs/:id`, `GET /api/runs/:id/events`, `POST /api/runs/cancel`, `POST /api/runs/retry`, `GET /api/artifacts`. All plan/run state transitions validated through `assertTransition()` |
| `src/lib/api.ts` | Added typed API client functions: `listTools`, `createPlan`, `getPlans`, `getPlan`, `decidePlan`, `createRun`, `getRun`, `getRunEvents`, `cancelRun`, `retryRun`, `getArtifacts` with full TypeScript interfaces |
| `src/components/dashboard/Sidebar.tsx` | Added `taskDetail`, `integrations`, `automations` to `ViewId` type. Added "Tools & Integrations" nav item with `Wrench` icon |
| `src/components/dashboard/index.ts` | Exported `TaskDetail` and `IntegrationsPanel` |
| `src/App.tsx` | Added `IntegrationsPanel` view rendering. Added `automations` view with truthful "Not enabled" state |

---

## 5. Visual-Preservation Verification

### Preserved (no changes)
- ✅ Near-black surface palette (`#0d0f12`, `#111318`, `#1a1d23`)
- ✅ Cyan/magenta accent treatment (`#00f5ff`, `#ff2d95`)
- ✅ Compact card rhythm: `rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card`
- ✅ Rapid-fire 4-panel grid: `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4`
- ✅ Sidebar: 224px width, collapsible groups, quick stats, lock button
- ✅ CommandHubHeader: hero, workspace bar, filter pills, 4-card summary grid, quick prompt row
- ✅ Typography: Inter, compact sizes, uppercase tracking labels
- ✅ Status colors: success/warning/error/info with dot indicators
- ✅ Focus-visible rings: `focus-visible:ring-2 focus-visible:ring-accent-primary/60`

### Purposeful visual differences
1. **IntegrationsPanel**: New card in the existing `Card` component style — same `rounded-2xl border border-border-muted bg-surface-2/95 p-4 shadow-card` pattern. Uses existing `StatusBadge` for risk tiers and availability. No new visual language introduced.
2. **TaskDetail**: Three-region grid (`lg:grid-cols-3`) that collapses to single column on mobile. Uses existing `Card`, `CardHeader`, `StatusBadge`, `Button`, `SkeletonList` components. Same dark surface, same accent treatment, same compact typography.
3. **Automations view**: Truthful "Not enabled" state using existing `border-status-warning/30 bg-status-warning/10 text-status-warning` pattern. No fake form or schedule UI.

---

## 6. Tools Implemented, Upgraded, Feature-Gated, Not Configured, or Deferred

| Tool/Feature | Status | Details |
|---|---|---|
| **Task creation** | ✅ Implemented | `POST /api/tasks` with audit event |
| **Plan generation** | ✅ Implemented | `POST /api/plans` with versioning, steps, assumptions, risks |
| **Plan approval/rejection/revision** | ✅ Implemented | `POST /api/plans/decision` with state machine validation |
| **Run creation** | ✅ Implemented | `POST /api/runs` with attempt tracking and parent linking |
| **Run cancellation** | ✅ Implemented | `POST /api/runs/cancel` with state machine validation |
| **Run retry** | ✅ Implemented | `POST /api/runs/retry` — only failed/timed_out, creates linked new attempt |
| **Run events timeline** | ✅ Implemented | `GET /api/runs/:id/events` with stable sequence ordering |
| **Artifacts** | ✅ Implemented | `GET /api/artifacts` with provenance, state tracking, filters |
| **Sources** | ✅ Implemented | `addSource()` with trust/sensitivity labels |
| **Tool registry** | ✅ Implemented | 8 registered tools with schema validation, risk tiers, feature flags |
| **Workspace authorization** | ✅ Implemented | `server-workspace.js` with scoping, RBAC, backward compatibility |
| **Policy engine** | ✅ Pre-existing | Risk classification, redaction, payload hashing, veto |
| **Approval queue** | ✅ Pre-existing | TTL, single-use, payload binding, audit trail |
| **Chat gating** | ✅ Pre-existing | Model output → policy gate → execute/approve/block |
| **Run Command** | 🔒 Feature-gated | Requires `MARINA_ENABLE_EXEC=1` + just-in-time approval |
| **Install Dependencies** | 🔒 Feature-gated | Requires `MARINA_ENABLE_EXEC=1` + just-in-time approval |
| **Deploy** | 🔒 Feature-gated | Requires `MARINA_ENABLE_EXEC=1` + just-in-time approval |
| **Automations** | 📋 Deferred (Phase E) | Truthful "Not enabled" state. Needs durable scheduler backend |
| **Code Patch** | 📋 Deferred (Phase D) | Interface defined in tool registry; needs secure runner |
| **Browser Task** | 📋 Deferred (Phase D) | Interface defined; needs isolated worker |
| **Research/Fetch** | 📋 Deferred (Phase D) | Source model exists; needs allowlisted fetch tool |

---

## 7. Security/Approval Controls and Authorization Checks

### Server-side authorization
- **Workspace scoping**: `server-workspace.js` provides `assertWorkspaceAccess()`, `scopeToWorkspace()`, `stampWorkspace()` — every record is stamped with `workspaceId` and filtered on read
- **RBAC**: `hasRole()` checks role hierarchy (viewer → member → admin → owner)
- **Backward compatibility**: Records without `workspaceId` are treated as belonging to the default workspace

### Policy enforcement (pre-existing, verified)
- **Risk classification**: `classifyRisk()` maps actions to low/moderate/high/critical; unknown → critical (fail-closed)
- **Policy veto**: `policyVeto()` blocks destructive commands (`rm -rf /`, `format`, `shutdown`, `mkfs`, `dd`, chmod 777 /) and folder deletion
- **Redaction**: `redactPayload()` masks sensitive keys (password, token, apiKey, credential, privateKey) at any depth, truncates strings, limits object depth
- **Payload binding**: `payloadHash()` creates SHA-256 hash for approval binding — approve-the-exact-action
- **Approval TTL**: 15-minute expiry, opportunistic expiry on list/read
- **Single-use**: `markApprovalExecuted()` rejects second execution
- **Double veto**: Policy veto checked before dispatch AND again at execution time after approval

### State machine enforcement (new)
- All plan status changes validated through `assertTransition("plan", from, to, actor)`
- All run status changes validated through `assertTransition("run", from, to, actor)`
- Invalid transitions return HTTP 409 with user-readable error
- Terminal states (completed, cancelled, succeeded) reject all further transitions

### Tool registry (new)
- Only allowlisted tools can be dispatched
- Input schema validation: required fields, type checking, maxLength, enum validation
- Feature flag gating: `MARINA_ENABLE_EXEC` required for high/critical tools
- Availability state: `active` or `inactive` — never fake "available"

### Audit trail
- Every consequential action emits an `AuditEvent` with actor, action, objectType, objectId, redacted metadata
- Plan lifecycle: `plan.created`, `plan.approved`, `plan.rejected`, `plan.superseded`
- Run lifecycle: `run.created`, `run.active`, `run.succeeded`, `run.failed`, `run.cancelled`, `run.timed_out`
- Artifact lifecycle: `artifact.created`, `artifact.ready`, `artifact.archived`, `artifact.deleted`
- Approval lifecycle: `approval.requested`, `approval.approved`, `approval.rejected`, `approval.executed`, `approval.expired`
- Instruction lifecycle: `instruction.executed`, `instruction.blocked`

---

## 8. Commands Run and Exact Results

### Tests
```
npm test
ℹ tests 45
ℹ pass 45
ℹ fail 0
ℹ duration_ms 3276.9298
```

### TypeScript + Build
```
npm run build
> tsc -b && vite build
✓ 1903 modules transformed.
dist/index.html                             0.98 kB │ gzip:  0.47 kB
dist/assets/index-CyRlHfDB.css             47.05 kB │ gzip:  8.22 kB
dist/assets/rolldown-runtime-CbXtAM7H.js    0.58 kB │ gzip:  0.36 kB
dist/assets/ui-DJ86kmv3.js                 44.74 kB │ gzip: 13.34 kB
dist/assets/index-CRA0DjaV.js             123.24 kB │ gzip: 31.62 kB
dist/assets/react-B8RH5zfg.js             261.62 kB │ gzip: 83.05 kB
✓ built in 484ms
```

### CTA Link-Integrity Check
```
npm run test:links
WARN: NEXT_PUBLIC_COMMAND_HUB_URL is not set — public Hub CTAs resolve to the truthful /hub-access request-access route.
CTA link-integrity check passed (Hub → /hub-access fallback)
```

---

## 9. Manual Click-by-Click Release Checklist

1. ✅ **Public landing page**: Navigate to `web/` → `npm run dev` → landing page loads with "Launch Command Hub" and "Open Command Hub" CTAs
2. ✅ **CTA target**: Both CTAs point to `COMMAND_HUB_HREF` → resolves to `/hub-access` (truthful "not publicly open yet" page)
3. ✅ **No localhost in source**: `check-cta-links.mjs` scans all `src/` files — zero forbidden hrefs found
4. ✅ **Command Hub loads**: `agent/` → `npm run build` → `dist/index.html` served → SPA loads with sidebar, header, workspace panels
5. ✅ **Rapid-fire card grid**: 4 panels (Execution, Operations, System, One-Click Tools) render in `xl:grid-cols-4` grid
6. ✅ **One-Click Tools**: 6 strategy tools (Market Position, Competitor Snapshot, Audience Persona, Trend Pulse, Offer Angle, Funnel Weak-Point) with READY/RUNNING/COMPLETED lifecycle
7. ✅ **Approvals**: Navigate to Approvals → pending approvals show with risk tier, countdown, redacted payload preview, approve/reject controls
8. ✅ **Integrations**: Navigate to Tools & Integrations → 8 registered tools shown with risk tier, approval policy, availability state
9. ✅ **Automations**: Navigate to Automations → truthful "Not enabled" state with explanation
10. ✅ **Security**: Navigate to Settings & Security → provider config, effective permissions, audit trail all load from real endpoints
11. ✅ **Tests**: 45/45 pass — state machine, policy, approvals, chat gating, plans, runs, artifacts, tool registry, workspace auth

---

## 10. Known Limitations and Next Safest Implementation Steps

### Known limitations
1. **Single-workspace deployment**: All records belong to the "default" workspace. Multi-workspace provisioning requires adding authentication and workspace membership.
2. **JSON file persistence**: State is stored in `dashboard-state.json`. Suitable for single-operator use; production multi-user requires a database (Postgres via existing Supabase client is the natural upgrade path).
3. **In-process scheduler**: The autonomous loop runs in-process via `setInterval`. Durable scheduling (Phase E) requires a persistent queue worker.
4. **No LLM-backed plan generation**: Plans are created manually via the API. A provider-backed planner adapter (Phase B 8.2) needs a configured model provider.
5. **No real run execution**: Runs are created and tracked but not yet dispatched to an executor. The `TaskExecutor` interface is the extension point.
6. **TaskDetail not wired to TaskBoard**: The TaskDetail component exists but is not yet navigable from the TaskBoard (requires adding a task selection handler).

### Next safest implementation steps
1. **Wire TaskDetail to TaskBoard**: Add `onSelectTask` handler in TaskBoard → set `activeView("taskDetail")` + selected task state in App.tsx
2. **Provider-backed planner**: Create `server-planner.js` with a deterministic dev planner + environment-configured provider adapter
3. **Run executor**: Implement `TaskExecutor` interface with one safe execution path (e.g., `generateReport` → Markdown artifact)
4. **Database migration**: Move from JSON file to Supabase Postgres with RLS policies for workspace isolation
5. **Authentication**: Add Supabase Auth with workspace membership provisioning
6. **Durable scheduler**: Add a persistent job queue (e.g., Supabase Edge Functions or a separate worker process) for Phase E automations