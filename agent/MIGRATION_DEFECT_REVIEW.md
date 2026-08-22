# Migration Defect Review — `20260821000001_core_schema.sql`

**Branch**: `feature/durable-foundations`
**Date**: 2026-08-22
**Status**: Defects corrected in-place (no new migration file)

---

## Defect 1 — Invalid Provisioning Order

### Problem

The original migration defined `public.has_workspace_role()` and `public.user_can_access_workspace()` near the top of the file (lines 16-62), but both are `LANGUAGE sql` functions that query `public.workspace_memberships` — a table created much later (line 125). PostgreSQL validates `LANGUAGE sql` function bodies at creation time, so the migration would fail with a "relation does not exist" error when applied to an empty database.

### Root Cause

The migration interleaved table definitions with RLS policies and helper functions without respecting the dependency graph. The helper functions depend on `workspace_memberships`, which depends on `workspaces`, which depends on `profiles` (via `auth.users`).

### Correction

Restructured the migration into a strict dependency-ordered sequence:

1. **Extensions** (`uuid-ossp`, `pgcrypto`)
2. **All 17 table definitions** with indexes (no RLS policies yet)
3. **Helper functions** (`has_workspace_role`, `user_can_access_workspace`) — defined AFTER `workspace_memberships` exists
4. **Bootstrap function** (`create_workspace_with_owner`) — defined AFTER helper functions
5. **RLS enable + policies** on all tables — defined AFTER helper functions exist
6. **Storage bucket + storage RLS policies**
7. **Trigger functions + triggers**

### Verification

New test: `"migration defines workspace_memberships before has_workspace_role"` — confirms the table definition (line 50) precedes the function definition (line 420).

New test: `"migration ordering: tables before functions before RLS before storage before triggers"` — confirms the full structural ordering: extensions → profiles → workspaces → workspace_memberships → has_workspace_role → bootstrap → RLS → storage → triggers.

---

## Defect 2 — No Safe First-Owner Bootstrap Path

### Problem

The `workspace_memberships` RLS policy `wm_admin_insert` requires `has_workspace_role(workspace_id, 'admin')` for INSERT. On a new database, a user can create a workspace (via the `workspaces_owner_insert` policy which checks `auth.uid() = created_by`), but cannot insert the initial owner membership because no membership exists yet — a circular authorization failure.

### Root Cause

The RLS policies assume a pre-existing membership to authorize new membership creation, but the first membership has no prior membership to authorize it.

### Correction

Added a `SECURITY DEFINER` function `public.create_workspace_with_owner(p_name text, p_slug text)` that:

1. **Rejects anonymous callers** — checks `auth.uid() IS NOT NULL`, raises exception if null
2. **Creates workspace atomically** — `INSERT INTO workspaces ... ON CONFLICT (slug) DO NOTHING`
3. **Creates first owner membership** — `INSERT INTO workspace_memberships ... ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`
4. **Prevents slug hijacking** — if the slug already exists but was created by a different user, raises `'Workspace slug already in use'`
5. **Uses explicit `search_path = public`** — prevents search-path injection
6. **Returns the workspace UUID**

### Security Properties

| Property | Implementation |
|---|---|
| SECURITY DEFINER | `language plpgsql security definer` |
| Explicit search_path | `set search_path = public` |
| Anonymous rejection | `if v_user_id is null then raise exception` |
| Grant scope | `revoke execute from public, anon; grant execute to authenticated` |
| Idempotency | `ON CONFLICT (slug) DO NOTHING` + `ON CONFLICT (workspace_id, user_id) DO UPDATE` |
| Slug hijack prevention | Checks `created_by = v_user_id` on slug conflict |

### Authorization Model

```
New user calls create_workspace_with_owner('My Workspace', 'my-slug')
  +-- auth.uid() IS NOT NULL? -> YES
  +-- INSERT workspace (SECURITY DEFINER bypasses RLS)
  +-- INSERT owner membership (SECURITY DEFINER bypasses RLS)
  +-- Returns workspace UUID

Subsequent operations use normal RLS:
  +-- has_workspace_role(workspace_id, 'admin') -> TRUE (owner satisfies admin)
  +-- Can now insert/update/delete memberships via wm_admin_insert policy
```

### Verification

New test: `"migration includes create_workspace_with_owner bootstrap function"` — confirms:
- Function definition exists
- `SECURITY DEFINER` present
- `set search_path = public` present
- `auth.uid()` check present
- Anonymous rejection (`is null`) present
- Owner membership creation (`'owner'`, `'active'`) present
- `revoke execute from public` present
- `grant execute to authenticated` present

---

## Static Scan Results

Scanned the final SQL for destructive or public-access patterns:

| Pattern | Result |
|---|---|
| `DROP TABLE/FUNCTION/TRIGGER/INDEX/POLICY` | None found |
| `TRUNCATE` | None found |
| `DELETE FROM` | None found |
| `public = true` (storage bucket) | None found |
| `GRANT ... TO anon/public` | None found |
| `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` | None found |

All storage buckets remain `public = false`. All SECURITY DEFINER functions have explicit `search_path = public`. The bootstrap function is revoked from `public` and `anon`, granted only to `authenticated`.

---

## Test Results

### Tests (57/57 pass — 3 new)
```
npm test
tests 57
pass 57
fail 0
duration_ms 3676.4598
```

### Build
```
npm run build
1903 modules transformed.
built in 813ms
```

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260821000001_core_schema.sql` | Restructured ordering + added `create_workspace_with_owner()` |
| `agent/test/rls-verification.test.js` | Added 3 new tests for ordering and bootstrap contract |
| `agent/MIGRATION_DEFECT_REVIEW.md` | This document (new) |

---

## Next Required Action

Apply the corrected migration to the empty MarinaAI staging Supabase project. The migration has NOT been applied to any database yet — the staging application was BLOCKED due to placeholder Supabase credentials. Once real credentials are configured, run:

```bash
supabase db push
```

Then verify the bootstrap function works by calling it from an authenticated client:

```javascript
const { data, error } = await supabase.rpc('create_workspace_with_owner', {
  p_name: 'My Workspace',
  p_slug: 'my-workspace'
});