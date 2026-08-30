# Marina AI — Project Status

**Updated:** 2026-08-30 (ship-ready confirmed; recommended upgrades in progress)

## What just happened

Manus AI implemented the new Command Hub layout (`agent/src/components/dashboard/CommandHubShell.tsx`). This audit verified it, fixed what it missed, quarantined stale files, and reconciled the design brief to the shipped code.

### Audit verdict on the Manus layout: WIRED CORRECTLY

- All 16 `ViewId`s route to render branches in `App.tsx`
- All 49 frontend API calls have matching server routes (83 routes total in `dashboard-server.js` + `server-durable-routes.js` + `server-queue-routes.js`)
- All 35 must-have endpoints verified present (`/api/chat`, `/api/durable/*`, `/api/playbooks/run`, `/api/gemini/sync`, etc.)
- All 16 durable endpoints used by `durable-api.ts` exist server-side
- All 29 dashboard panels exist, compile-exported through the barrel
- All custom CSS classes the shell relies on (`stone-surface`, `font-display`, `writing-mode-vertical`, glow shadows) exist in `src/index.css`
- All 44 server/executor/api JS files parse clean (`node --check`)

### Fixes made this session

1. **Mobile Command AI access** — the right chat panel was `lg:flex` only; on phones it was unreachable. Added a pink "Command AI" pill button (mobile only) that opens the pop-out chat window.
2. **Floating button overlap** — the mobile "Full Dashboard" button and the reopen-chat button could collide; they are now stacked in one fixed column.
3. **Gemini Sync was a stub** — the view showed placeholder text. Built `GeminiSyncPanel.tsx` (real component, calls `/api/gemini/sync`, shows sync count + timestamp, disables when no chat history) and wired it into `App.tsx`.
4. **PlaybookBar was dead code** — built, exported, never rendered. Now rendered at the top of the Command Hub dashboard view with a real `handleRunPlaybook` handler calling `/api/playbooks/run`.
5. **`vite.config.js` was shadowing `vite.config.ts`** — Vite prefers `.js`; the duplicate silently won. Quarantined the `.js`; the maintained `.ts` (referenced by `tsconfig.node.json`) now rules.

### Quarantine (20 files moved to `agent/quarantine/`)

Stale scratch files (`c`, `incoming.txt`, `voice.txt`), stale logs, duplicate Vite config, TS build caches, and 12 completed-phase handoff docs. See `agent/quarantine/README.md` for the reason per file and what was deliberately kept (e.g. `config.json`, `server-workspace.js`, both still referenced).

### Design brief reconciled

`command_hub_blended_design_brief.md` now documents the layout **as executed** (10 edits): heading text, nav items, tool cards, suggested prompts, and right-panel controls updated to match the code; the business-category selector is marked **[deferred]** (no backend model yet).

---

## Ship-ready checklist

| # | Item | Status |
|---|---|---|
| 1 | Manus layout wired (views, routes, CSS tokens) | ✅ Done |
| 2 | All 16 views render, all panels exported | ✅ Done |
| 3 | Frontend ↔ backend API wiring verified | ✅ Done |
| 4 | Mobile access to chat + dashboard | ✅ Done |
| 5 | Dead features wired (Gemini Sync, PlaybookBar) | ✅ Done |
| 6 | Stale files quarantined | ✅ Done |
| 7 | Design brief matches shipped code | ✅ Done |
| 8 | TypeScript build green (`npm run build` in `agent/`) | ✅ Done |
| 9 | Test suite green (`npm test` in `agent/`) | ✅ Done |
| 10 | Manual smoke: login → home → chat → each tool panel | ⬜ Needs your eyes |
| 11 | Deploy: `web/` to Vercel + `agent/` build to host | ⬜ After 8-10 |

## Known issues (not blockers, but real)

1. **Ollama timeouts** — `service-err.log` shows `timeout of 120000ms exceeded` and `30000ms` errors. The local LLM is slow or not running; chat still works but replies can fail. Restart Ollama or raise the timeout in config.
2. **Automations view is a placeholder** — shows "Not enabled, planned for Phase E". It needs a durable scheduler backend; the queue infrastructure (`server-queue-worker.js`) already exists to build on.
3. **Business category selector deferred** — the brief's Retail/Agency/Finance/Healthcare/Services bar has no backend model. Needs a `business_categories` table + tool-mapping logic before building the UI.
4. **`service-err.log` / `service-out.log` are locked** — the background service is running and writing to them. They stay in `agent/` until the service stops.
5. **Light theme vs `stone-surface`** — the `stone-surface` class hardcodes dark rgba values; in light theme those cards stay dark. Cosmetic; fix by moving the class values into the `[data-theme="light"]` override block.



## In progress (recommended upgrades)

### 1. Ollama resilience
- Backend: bump timeout in dashboard-server.js from 120s to 300s
- Frontend: exponential backoff in getOllamaStatus (1s, 2s, 4s, 8s, 16s)
- UI: LLM Hub panel already shows provider status; add retry-on-fail toast

### 2. Automations Phase E
- Wire schedule builder to server-queue-worker.js
- Add recurring task UI

### 3. Business category selector
- Supabase: business_categories table + tool_mapping table
- Frontend: dropdown in IntegrationsPanel onboarding
- Wire listBusinessCategories + getToolsForCategory API

### 4. Log rotation
- Add size-based rotation in dashboard-server.js (10MB cap, keep 3)

### 5. PlaybookBar on Home
- Already on Command Hub dashboard; expose on web/ home page

### 6. Mobile nav drawer
- Slide-out drawer for <md screens

### 7. Error boundary telemetry
- Pipe ErrorBoundary catches to system log

### 8. CI
- .github/workflows/ci.yml: npm install + npm test + npm run build

## Recommended upgrades (priority order)

1. **Ollama resilience (do first)** — add a health-check + auto-retry with backoff around Ollama calls, and surface provider status in the LLM Hub panel. The timeouts in the log will bite users.
2. **Automations Phase E** — the durable queue, planner, and state machine are all in place; wiring a schedule builder UI to `server-queue-worker.js` completes the last major feature gap.
3. **Business category selector** — Supabase table + onboarding flow; it is the brief's core "adaptable hub" promise and unlocks tailored tool recommendations.
4. **Log rotation** — `logs/` and service logs grow unbounded. Add a simple size-based rotation in `dashboard-server.js`.
5. **PlaybookBar on Home** — it currently renders only on the Command Hub dashboard view; surfacing it on the Home shell would make the 14 playbooks one click closer.
6. **Mobile nav drawer** — the left rail is hidden on mobile; the two pill buttons cover the essentials, but a slide-out drawer would match the brief's responsive spec.
7. **Error boundary telemetry** — boundaries exist per panel; pipe their catches into the system log so failures are visible in System Log Viewer.
8. **CI** — a GitHub Action running `npm test` + `npm run build` on push would have caught the `vite.config.js` shadowing class of bug.

## Quick commands

```powershell
# Build the dashboard (agent/)
cd C:\Users\linde\Projects\MarinaAI\agent ; npm run build

# Run tests
cd C:\Users\linde\Projects\MarinaAI\agent ; npm test

# Dev mode (Vite on 5173, API proxied to 3000)
cd C:\Users\linde\Projects\MarinaAI\agent ; npm run dev

# Web marketing site (Next.js)
cd C:\Users\linde\Projects\MarinaAI\web ; npm run dev
```
