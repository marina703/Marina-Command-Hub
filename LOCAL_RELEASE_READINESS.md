# MarinaAI Command Hub — Local Release Readiness

Validated: 2026-08-21 · Checkout: `C:\Users\linde\Projects\MarinaAI` (repo `Marina-Command-Hub`)

## 1. Checkout & restart mechanism

| Item | Value |
|---|---|
| Applications | `agent/` (React 19 + Vite 8 + TS + Tailwind 4 SPA + Node API), `web/` (Next.js 14 landing) |
| Local service | Windows service **`MarinaAI`** (NSSM-wrapped node), Status: Running, StartType: Automatic |
| Restart script | `agent/restart-service.ps1` — runs `nssm restart MarinaAI`; requires Administrator; changes no config/files |
| Ports | 3000 = Hub service (old code until restart) · 3001 = pre-existing Next dev server (not started by validation) |

## 2. Configuration status (redacted)

| Setting | Scope | Status | Assessment |
|---|---|---|---|
| `MARINA_ENABLE_EXEC` | Process / User / Machine / service env / repo files | **Absent everywhere** | ✅ High-risk execution safely disabled |
| `NEXT_PUBLIC_COMMAND_HUB_URL` | Process / User / Machine / `web/.env.local` | **Absent/unset** | ✅ `/hub-access` fallback active; no localhost/placeholder value shipped |
| `permissions.json` allow flags | repo file | createFiles/modifyFiles=true; runCommands/installDependencies/deploy=**false** (+ env gate) | ✅ Defense in depth intact |
| `web/.env.local` | repo file | Supabase dev URL/anon key/site URL only (values not inspected) | No Hub URL present |

## 3. CTA target/fallback verification

- Both public CTAs ("Launch Command Hub", "Open Command Hub →") resolve through the single source `web/src/lib/commandHub.ts`.
- Production build served on :3002: landing HTTP 200, **2 CTAs → `/hub-access`, 0 localhost refs**.
- `/hub-access` HTTP 200 with truthful "not publicly open yet" request-access state.
- `npm run test:links` passes and fails on any local/insecure/placeholder CTA href.

## 4. Build / test / lint / link-check results

| Command | Location | Result | Duration |
|---|---|---|---|
| `npm test` (node --test, 23 tests incl. end-to-end approval gating over real HTTP handler) | agent | ✅ pass 23/23, fail 0 | ~5.7 s |
| `npm run build` (tsc -b && vite build) | agent | ✅ exit 0 | ~4.8 s |
| `npm run lint` (next lint) | web | ✅ no warnings/errors | ~5.2 s |
| `npm run test:links` (CTA integrity) | web | ✅ passed (expected WARN: Hub URL unset → fallback) | ~3.3 s |
| `npm run build` (next build) | web | ✅ exit 0, hub-access prerendered | ~36.5 s |

## 5. Service restart status

**Not performed** — validation terminal was not elevated (`elevated: False`). The service on :3000 is healthy but still runs the previous code load (`/api/system/state` returns SPA HTML instead of JSON). Run as Administrator:

```powershell
cd C:\Users\linde\Projects\MarinaAI\agent
powershell -NoProfile -ExecutionPolicy Bypass -File .\restart-service.ps1
```

Then confirm updated code is live via `http://localhost:3000/api/system/state` returning JSON with `effectivePermissions`. Full details: `RUN_AS_ADMIN_RESTART_INSTRUCTIONS.md`.

## 6. Safe smoke-test results (new-code instance on :3100, since stopped)

| Area | Result |
|---|---|
| Command Hub load | ✅ Dashboard renders, truthful "Online" badge (health: online/autonomous/ollama ok) |
| Dashboard cards | ✅ Near-black style + rapid-fire grid unchanged; Operations shows real tmp count (73 files) |
| Settings & Security | ✅ Live provider status (ollama: qwen2.5:3b), Gemini key "Not configured", permissions: shell/install/deploy all **Denied**, audit trail truthful empty state |
| Approval Queue | ✅ Filters render, truthful empty state; no approvals issued during validation |
| Audit view | ✅ Empty state + redaction note (no events generated during validation) |
| Low-risk task/playbook | ⚠️ Not exercised live to avoid mutating operator state or invoking providers; covered by unit/integration tests (23 passing). Scheduler cycle ran once at instance start by design. |
| Public landing route | ✅ Production build: both CTAs → `/hub-access`, zero localhost refs |
| Hub access page | ✅ Truthful request-access state renders |

Not testable: playbook LLM runs and any high-risk action — intentionally not triggered (provider operations and protected actions are out of scope for safe validation).

## 7. Git working-tree summary (no commit made)

Modified: `agent.js`, `dashboard-server.js`, `dashboard-state.js`, `package.json`, `permissions.json`, `scheduler.js`, `src/App.tsx`, 8 dashboard components, `src/lib/api.ts`, `web/package.json`, `web/src/app/page.tsx`. New: `server-policy.js`, `server-state-machine.js`, `system-actions.js`, `test/` (4 files), `ApprovalInbox.tsx`, `SecurityPanel.tsx`, `web/src/lib/commandHub.ts`, `web/src/app/hub-access/`, `web/scripts/check-cta-links.mjs`, `web/.eslintrc.json`, plus this file and `RUN_AS_ADMIN_RESTART_INSTRUCTIONS.md`. Runtime artifacts (`dashboard-state.json`, `logs/*`) also changed by normal operation. Review and commit deliberately.

## 8. Blockers / manual next actions

1. **Restart the service as Administrator** (instructions above) to load the updated server code.
2. When a real HTTPS Hub origin exists, set `NEXT_PUBLIC_COMMAND_HUB_URL` in Vercel for `web` (never localhost); the link check will validate it.

## 9. Final status

**READY AFTER MANUAL ADMIN RESTART** — all builds/tests/lint/link checks pass and configuration is safe; the only remaining step is the administrator service restart to load the new code into the running local service.