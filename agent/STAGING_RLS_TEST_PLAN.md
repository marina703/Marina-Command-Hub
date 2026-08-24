# Staging RLS Test Plan — Controlled Two-User Verification

> **Project Ref:** `sslgswhhlujryjlrnnfr`
>
> This document describes the exact remote staging test plan. No tests will
> contact the staging database until the user explicitly confirms by setting
> `MARINA_RUN_REMOTE_STAGING_TESTS=1` and verifying the project ref.

---

## Test Architecture

### Guard Mechanism

The test script (`test/staging-rls-remote.test.js`) enforces:

1. **Environment guard:** `MARINA_RUN_REMOTE_STAGING_TESTS` must be set to `1`
2. **Project ref check:** The Supabase URL must match `sslgswhhlujryjlrnnfr`
3. **Default behavior:** Dry-run/report-only when guard is not set
4. **Explicit confirmation:** Each destructive phase requires separate approval

### Test Users

Two clearly labeled **staging-only** test users:

| Label | Email Pattern | Purpose |
|-------|--------------|---------|
| Owner | `marina-staging-owner-{timestamp}@test.invalid` | Workspace member with full access |
| Non-member | `marina-staging-nonmember-{timestamp}@test.invalid` | Should be denied workspace access |

> **No real employee/customer email addresses are used.**
> The `@test.invalid` TLD ensures no real email delivery.

---

## Test Phases

### Phase 1: Create Test Users (requires explicit confirmation)

1. Create owner user via Supabase Auth Admin API (server-side, service-role)
2. Create non-member user via Supabase Auth Admin API
3. Record user IDs for cleanup

### Phase 2: Create Workspace (requires explicit confirmation)

1. Call `createWorkspaceForAuthenticatedUser()` with owner's bearer token
2. Verify workspace was created with correct name/slug
3. Verify owner is listed as workspace member

### Phase 3: Create Test Data (requires explicit confirmation)

1. Create a test task under the owner's workspace
2. Create a test artifact record
3. Upload a small test file to the private `artifacts` bucket

### Phase 4: Verify Owner Access

1. Owner reads workspace tasks → expect 200 with task data
2. Owner creates a new task → expect 200
3. Owner uploads artifact → expect 200
4. Owner downloads artifact via signed URL → expect 200 with valid URL

### Phase 5: Verify Non-Member Denial

1. Non-member reads owner's workspace tasks → expect 403
2. Non-member creates task in owner's workspace → expect 403
3. Non-member uploads artifact to owner's workspace → expect 403
4. Non-member downloads artifact from owner's workspace → expect 403
5. Non-member guesses cross-workspace ID → expect 403 or 404

### Phase 6: Verify Anonymous Denial

1. Anonymous (no token) reads workspace tasks → expect 401
2. Anonymous creates task → expect 401
3. Anonymous uploads artifact → expect 401
4. Anonymous downloads artifact → expect 401

### Phase 7: Verify Service-Role Isolation

1. Check rendered HTML for service-role key → expect zero matches
2. Check client bundle (dist/) for service-role key → expect zero matches
3. Check source maps for service-role key → expect zero matches
4. Verify `/api/auth/status` does not expose service key → expect only `configured` and `url`

### Phase 8: Cleanup (requires separate explicit confirmation)

1. Delete test artifacts from storage
2. Delete test artifact records
3. Delete test task records
4. Delete test workspace
5. Delete test users

---

## Execution

```bash
# Dry-run (default) — reports what would happen, touches nothing
node test/staging-rls-remote.test.js

# Execute — requires explicit guard
MARINA_RUN_REMOTE_STAGING_TESTS=1 node test/staging-rls-remote.test.js
```

---

## Safety Guarantees

- The script checks `MARINA_RUN_REMOTE_STAGING_TESTS=1` before any network call
- The script verifies the Supabase URL contains `sslgswhhlujryjlrnnfr`
- Test users use `@test.invalid` email addresses
- Cleanup is scoped to specifically created test data only
- No arbitrary staging data is deleted
- Service-role key is never logged, printed, or exposed in output