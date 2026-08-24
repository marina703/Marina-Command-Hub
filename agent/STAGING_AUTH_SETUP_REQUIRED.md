# Staging Auth Setup — Manual Configuration Required

> **Project Ref:** `sslgswhhlujryjlrnnfr`
>
> This document describes the exact Supabase Dashboard steps required to enable
> authentication for the MarinaAI Command Hub staging environment. No secret
> values are included in this document.

---

## 1. Confirm Supabase Project

1. Open the Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to project **sslgswhhlujryjlrnnfr**
3. Confirm the project is active and the URL matches `https://sslgswhhlujryjlrnnfr.supabase.co`

---

## 2. Configure Authentication Provider

### Option A: Email/Password (recommended for staging)

1. Go to **Authentication → Providers → Email**
2. Enable **Email provider**
3. Disable **Confirm email** (for staging convenience; re-enable for production)
4. Optionally enable **Secure email change** if email updates will be tested

### Option B: Magic Link

1. Go to **Authentication → Providers → Email**
2. Enable **Magic link** sign-in
3. Configure the email template if desired (default is functional)

---

## 3. Configure Redirect URLs

1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to: `http://localhost:3000`
3. Add to **Redirect URLs**:
   - `http://localhost:3000`
   - `http://localhost:5173` (Vite dev server)
4. Save changes

---

## 4. Set Server-Only Environment Variables

Create or update `.env.local` in the project root with:

```
SUPABASE_URL=https://sslgswhhlujryjlrnnfr.supabase.co
SUPABASE_ANON_KEY=<copy from Supabase Dashboard → Settings → API → anon public>
SUPABASE_SERVICE_ROLE_KEY=<copy from Supabase Dashboard → Settings → API → service_role secret>
VITE_SUPABASE_URL=https://sslgswhhlujryjlrnnfr.supabase.co
VITE_SUPABASE_ANON_KEY=<same anon key as above>
MARINA_ENV=staging
MARINA_ENABLE_EXEC=0
MARINA_RUN_REMOTE_STAGING_TESTS=0
```

> **SECURITY:** The `SUPABASE_SERVICE_ROLE_KEY` must NEVER be committed to
> version control, exposed in client bundles, or shared in documentation.
> It is used only by `server-supabase.js` (Node.js server-side code).

---

## 5. Verify RLS and Schema

The staging schema has already been applied with:
- 17 RLS-enabled domain tables
- Private `artifacts` storage bucket
- Workspace-scoped policies
- `private` schema for privileged helpers
- `public.create_workspace(text, text, uuid)` SECURITY DEFINER wrapper (service_role only)

No additional schema changes are required.

---

## 6. Verify Configuration

After setting environment variables, start the server:

```bash
npm start
```

The server log should show:
- `Supabase configured: true` (or equivalent status)
- No service-role key exposure warnings

Navigate to `http://localhost:3000` and confirm:
- The sign-in page appears (not the dashboard directly)
- Supabase Auth connection is established

---

## 7. Next Steps

Once configuration is verified:
1. Review `STAGING_RLS_TEST_PLAN.md` for the controlled two-user test plan
2. Approve remote test execution separately (see handoff document)
3. Do **not** merge to `main`, deploy, or push without separate confirmation