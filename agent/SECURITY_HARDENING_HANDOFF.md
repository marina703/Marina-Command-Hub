# Security Hardening Handoff

**Branch**: `feature/durable-foundations`
**Date**: 2026-08-22
**Migration**: `supabase/migrations/20260822000001_security_hardening.sql`
**Status**: READY FOR SECURITY-HARDENING MIGRATION REVIEW

---

## Migration Summary

Forward-only security-hardening migration that moves privileged SECURITY DEFINER helper functions out of the exposed public RPC surface into a private internal schema. Enforces least privilege on all helper functions and RLS policies.

Does NOT modify the already-applied `20260821000001_core_schema.sql`.

---

## Object Moves and Revocations

### A. Private Schema Created

| Action | Detail |
|---|---|
| CREATE SCHEMA IF NOT EXISTS private | Internal schema for privileged functions |
| REVOKE ALL ON SCHEMA private FROM public, anon, authenticated | No schema usage for exposed roles |
| GRANT USAGE ON SCHEMA private TO postgres, service_role | Only internal roles can access |

### B. Functions Moved to private

| Function | Old Location | New Location | search_path |
|---|---|---|---|
| has_workspace_role(uuid, text) | public | private | pg_catalog, public |
| handle_updated_at() | public | private | pg_catalog, public |
| handle_new_user() | public | private | pg_catalog, public |
| create_workspace_with_owner(uuid, text, text) | N/A (new) | private | pg_catalog, public |

### C. EXECUTE Revocations

| Action | Roles |
|---|---|
| REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM public, anon, authenticated | All exposed roles |

### D. Minimal Access Grants for RLS Policy Evaluation

| Action | Roles | Purpose |
|---|---|---|
| GRANT USAGE ON SCHEMA private TO postgres, service_role | Internal roles | Full schema access |
| GRANT USAGE ON SCHEMA private TO authenticated | End-user role | Name resolution only — allows Postgres to resolve `private.has_workspace_role(...)` in RLS policy expressions. Does NOT expose the schema through Supabase's Data API (not listed in `db-schemas`) and does NOT grant table/function access by itself. |
| GRANT EXECUTE ON FUNCTION private.has_workspace_role(uuid, text) TO authenticated | End-user role | Only function granted to authenticated — required for RLS policy evaluation |

> **Correction (2026-08-22):** The original migration granted EXECUTE on `private.has_workspace_role` to `authenticated` but omitted `GRANT USAGE ON SCHEMA private TO authenticated`. Postgres requires both schema USAGE (name resolution) and function EXECUTE to invoke a schema-qualified function. Without the USAGE grant, authenticated requests would get `permission denied for schema private` when RLS evaluates `private.has_workspace_role(...)`.

### E. Server-Only Workspace Bootstrap

| Action | Detail |
|---|---|
| public.create_workspace(text, text, uuid) | Thin wrapper in public schema for PostgREST access |
| REVOKE EXECUTE FROM public, anon, authenticated | Not callable by exposed roles |
| GRANT EXECUTE TO service_role | Only callable by server-side service-role client |
| DROP FUNCTION public.create_workspace_with_owner(text, text) | Old public bootstrap removed |

### F. RLS Policies Updated

- 60 policies updated via ALTER POLICY
- All policies now reference private.has_workspace_role instead of public.has_workspace_role
- All policies restricted to TO authenticated (defense-in-depth)
- UPDATE policies now include WITH CHECK expressions for tenant retention
- Storage policies updated to reference private.has_workspace_role

### G. Triggers Updated

- 7 triggers dropped and recreated referencing private.handle_updated_at() and private.handle_new_user()
- Old public trigger functions dropped

### H. Obsolete Public Functions Dropped

| Function | Reason |
|---|---|
| public.has_workspace_role(uuid, text) | Replaced by private.has_workspace_role |
| public.user_can_access_workspace() | Unused in any RLS policy or application code |
| public.handle_updated_at() | Replaced by private.handle_updated_at |
| public.handle_new_user() | Replaced by private.handle_new_user |
| public.create_workspace_with_owner(text, text) | Replaced by private.create_workspace_with_owner + public.create_workspace wrapper |

---

## Server Repository Layer Changes

File: agent/server-supabase.js

Added createWorkspace({ userId, name, slug }) function:
- Calls public.create_workspace RPC via service-role client
- userId parameter MUST be derived from verified server auth context (JWT/session)
- Never accepts a client-supplied user_id as trusted input
- Returns { ok: false, message: "Authenticated user ID required" } when userId is missing
- Returns { ok: false, message: "Supabase not configured" } when Supabase is not configured

---

## Tests

### Test Results (68/68 pass)

```
npm test
tests 68
pass 68
fail 0
duration_ms 4091.9278
```

### Security Hardening Tests (11 tests)

| Test | Validates |
|---|---|
| private schema exists and is secured | Schema creation + revoke/grant + USAGE for authenticated |
| all SECURITY DEFINER functions use fixed search_path | No mutable search_path |
| no SECURITY DEFINER helper callable by anon | EXECUTE revoked from exposed roles |
| anon and public lack USAGE and EXECUTE on private helpers | No USAGE/EXECUTE grants to anon or public |
| private schema is not exposed via Data API | `private` not in config.toml `schemas` |
| workspace bootstrap is server-only | Private function + public wrapper restricted to service_role |
| RLS policies reference private.has_workspace_role | All policies updated |
| all policies restricted to authenticated role | TO authenticated on every policy |
| old public functions are dropped | 5 functions dropped |
| artifacts bucket remains private | No public = true |
| createWorkspace server seam rejects missing userId | Server-only integration seam |

### Build Results

```
npm run build
1903 modules transformed.
built in 565ms
```

---

## Static Scan Results

| Pattern | Result |
|---|---|
| DROP TABLE | None found |
| TRUNCATE | None found |
| DELETE FROM | None found |
| public = true | None found |
| GRANT TO anon/public | None found |
| DISABLE ROW LEVEL SECURITY | None found |
| DROP TRIGGER IF EXISTS | 7 found (expected - replacing with private references) |
| DROP FUNCTION IF EXISTS | 5 found (expected - removing obsolete public functions) |
| Client-side service_role references | None found in Vite/client code |

---

## Remaining Limitations

1. No live auth context: The application does not yet have real Supabase auth configured. The createWorkspace server seam returns "Authenticated user ID required" as a truthful unavailable state. When auth is configured, the server layer must derive userId from the verified JWT/session.

2. No HTTP endpoint for workspace creation: The createWorkspace function is a server-only integration seam. No dashboard-server.js endpoint exposes it yet. This is intentional - an endpoint should only be added after real auth is configured.

3. has_workspace_role granted to authenticated: The RLS membership helper is the only private function granted EXECUTE to authenticated. This is required because RLS policy expressions are evaluated with the session user's privileges. The function is invisible to PostgREST because the private schema is not registered in db-schemas.

4. No service_role in browser: The SUPABASE_SERVICE_ROLE_KEY is never exposed to Vite client code. The service-role client is only used server-side in server-supabase.js.

---

## Post-Application Verification

After applying the migration, run this query to confirm both schema USAGE and function EXECUTE privileges are correct:

```sql
-- Verify schema USAGE grants
SELECT
  n.nspname AS schema,
  r.rolname AS grantee,
  'USAGE' AS privilege_type
FROM pg_namespace n
JOIN pg_roles r ON has_schema_privilege(r.rolname, n.nspname, 'USAGE')
WHERE n.nspname = 'private'
  AND r.rolname IN ('authenticated', 'anon', 'public', 'postgres', 'service_role')
ORDER BY r.rolname;

-- Expected: authenticated, postgres, service_role (NOT anon or public)

-- Verify function EXECUTE grants
SELECT
  n.nspname AS schema,
  p.proname AS function,
  pg_get_function_arguments(p.oid) AS args,
  r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON has_function_privilege(r.rolname, p.oid, 'EXECUTE')
WHERE n.nspname = 'private'
  AND r.rolname IN ('authenticated', 'anon', 'public')
ORDER BY r.rolname, p.proname;

-- Expected: only (authenticated, has_workspace_role, uuid, text)
-- anon and public should have zero rows
```

---

## Remote Application Confirmation Required

To apply this migration to the marinaai-staging Supabase project:

1. Confirm the migration should be applied: supabase db push
2. Run the post-application verification queries above
3. Verify RLS policies still work by running the verification suite against the live database
4. Verify the artifacts bucket remains private

Do NOT apply until reviewed. The migration is forward-only and safe to apply to the existing staging schema.
