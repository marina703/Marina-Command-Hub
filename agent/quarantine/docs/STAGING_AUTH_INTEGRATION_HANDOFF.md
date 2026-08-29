# Staging Auth Integration — Handoff Document

> **Branch:** `feature/durable-foundations`
> **Date:** 2026-08-22
> **Status:** READY FOR STAGING AUTH CONFIGURATION AND REMOTE TEST APPROVAL

---

## Changed Files

### New Files
| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Browser-side Supabase client (anon key only) |
| `src/hooks/useAuth.ts` | Auth hook: session restore, sign-in, sign-out |
| `src/hooks/useWorkspace.ts` | Workspace hook: list, select, membership |
| `src/components/dashboard/LoginPage.tsx` | Login page using MarinaAI visual system |
| `test/auth-integration.test.js` | Auth integration tests (17 tests) |
| `test/staging-rls-remote.test.js` | Remote staging RLS test script (dry-run guard) |
| `STAGING_AUTH_SETUP_REQUIRED.md` | Manual Supabase Dashboard setup steps |
| `STAGING_RLS_TEST_PLAN.md` | Controlled two-user RLS test plan |

### Modified Files
| File | Changes |
|------|---------|
| `.env.example` | Added `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `MARINA_ENV`, `MARINA_RUN_REMOTE_STAGING_TESTS`; separated browser-safe vs server-only vars |
| `.gitignore` | Added secret-scan patterns for service-role keys, PEM files, credentials |
| `server-supabase.js` | Added `verifySession()`, `getUserWorkspaces()`, `verifyWorkspaceMembership()`, `createWorkspaceForAuthenticatedUser()`, artifact validation constants |
| `dashboard-server.js` | Added `extractBearerToken()`, `requireAuth()`, `requireWorkspaceAuth()` helpers; new routes: `/api/auth/session`, `/api/auth/status`, `/api/workspaces`, `/api/artifacts/upload`, `/api/artifacts/download` |
| `src/App.tsx` | Integrated `useAuth()` and `useWorkspace()` hooks; added auth gate (LoginPage), session loading state, sign-out in Sidebar |
| `src/components/dashboard/Sidebar.tsx` | Added `onSignOut` and `user` props; user email display; sign-out button |
| `src/components/dashboard/index.ts` | Added `LoginPage` export |

---

## Environment Variable Names (no values)

### Browser-Safe (Vite)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/publishable key

### Server-Only (Node.js)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key (NEVER expose to browser)
- `MARINA_ENV` — Environment name (`local`, `staging`, `production`)
- `MARINA_ENABLE_EXEC` — Execution safety flag (default `0`)
- `MARINA_RUN_REMOTE_STAGING_TESTS` — Remote test guard (default `0`)

---

## Test Results

### Unit & Integration Tests
```
tests 83 | pass 83 | fail 0
```

All existing tests pass. New auth integration tests cover:
- server-supabase module loads safely without env vars
- Reports "not configured" when env vars are missing
- `verifySession` returns error when not configured
- `getUserWorkspaces` returns error when not configured
- `verifyWorkspaceMembership` returns error when not configured
- `createWorkspaceForAuthenticatedUser` rejects without token
- `createWorkspace` rejects without userId
- Artifact validation: 50MB max, allowed MIME types
- Dashboard server exports auth helpers
- Staging RLS remote test dry-run guard
- Service-role key isolation (no references in client source)

### Build
```
tsc -b && vite build — SUCCESS (1.58s)
```

TypeScript compilation and Vite production build both pass.

### CTA Link Behavior
Preserved — no changes to `index.html`, CTA URLs, or `/hub-access` fallback.

---

## Manual Steps Required

See `STAGING_AUTH_SETUP_REQUIRED.md` for the complete checklist:

1. Confirm Supabase project `sslgswhhlujryjlrnnfr`
2. Enable Email/Password or Magic Link auth provider
3. Configure redirect URLs (`http://localhost:3000`, `http://localhost:5173`)
4. Create `.env.local` with real credentials (see `.env.example` for variable names)
5. Verify server starts with `Supabase configured: true`

---

## Remote Test Plan Scope

See `STAGING_RLS_TEST_PLAN.md` for the full plan. Summary:

1. Create two staging test users (`@test.invalid` emails)
2. Create workspace via server-only bootstrap
3. Create test task and artifact
4. Verify owner access (read/write/upload/download)
5. Verify non-member denial (403 on all operations)
6. Verify anonymous denial (401 on all operations)
7. Verify service-role isolation (no key in bundles)
8. Cleanup test data and users

---

## Confirmation Required

**Before any staging users, data, or artifacts are created, the user must explicitly confirm by setting `MARINA_RUN_REMOTE_STAGING_TESTS=1` and running the test script.**

The exact confirmation sentence:

> I approve creating staging test users (`marina-staging-owner-*` and `marina-staging-nonmember-*@test.invalid`), one staging workspace, one test task, and one private artifact in project `sslgswhhlujryjlrnnfr` for RLS verification purposes.

---

## Safety Boundaries Maintained

- ✅ No service-role key in browser bundles, source maps, or client code
- ✅ Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are browser-visible
- ✅ All server routes verify bearer tokens server-side
- ✅ Workspace membership verified server-side on every scoped request
- ✅ `MARINA_ENABLE_EXEC` remains disabled
- ✅ No `dashboard-state.json` migration attempted
- ✅ No deployment, push, merge, or PR created
- ✅ No real staging users/data/artifacts created without explicit approval