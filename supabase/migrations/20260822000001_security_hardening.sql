-- ============================================================
-- MarinaAI Command Hub -- Security Hardening Migration
--
-- Moves privileged SECURITY DEFINER helper functions out of the
-- exposed public RPC surface into a private internal schema.
-- Enforces least privilege on all helper functions and RLS policies.
--
-- This is a FORWARD-ONLY migration. Do NOT modify the already-applied
-- 20260821000001_core_schema.sql.
--
-- Sections:
--   A. Create and secure private schema
--   B. Recreate helper functions in private schema
--   C. Revoke EXECUTE from exposed roles
--   D. Grant minimal EXECUTE for RLS policy evaluation
--   E. Create server-only public wrapper for workspace bootstrap
--   F. Update all RLS policies (private references + TO authenticated)
--   G. Update triggers to reference private functions
--   H. Drop obsolete public functions
-- ============================================================

-- ============================================================
-- A. Create and secure private/internal schema
-- ============================================================
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

-- ============================================================
-- B. Recreate helper functions in private schema
-- ============================================================

-- B1. RLS membership helper
create or replace function private.has_workspace_role(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and (
        case p_required_role
          when 'viewer' then wm.role in ('viewer', 'member', 'admin', 'owner')
          when 'member' then wm.role in ('member', 'admin', 'owner')
          when 'admin'  then wm.role in ('admin', 'owner')
          when 'owner'  then wm.role = 'owner'
          else false
        end
      )
      and wm.status = 'active'
  );
$$;

-- B2. Updated-at trigger helper
create or replace function private.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- B3. Auth-user profile trigger helper
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- B4. Workspace bootstrap (server-only, takes explicit user_id)
create or replace function private.create_workspace_with_owner(
  p_user_id uuid,
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
begin
  if p_user_id is null then
    raise exception 'User ID required to create a workspace';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (p_name, p_slug, p_user_id)
  on conflict (slug) do nothing
  returning id into v_workspace_id;

  if v_workspace_id is null then
    select w.id into v_workspace_id
    from public.workspaces w
    where w.slug = p_slug
      and w.created_by = p_user_id;

    if v_workspace_id is null then
      raise exception 'Workspace slug already in use';
    end if;
  end if;

  insert into public.workspace_memberships (workspace_id, user_id, role, status)
  values (v_workspace_id, p_user_id, 'owner', 'active')
  on conflict (workspace_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  return v_workspace_id;
end;
$$;

-- ============================================================
-- C. Revoke EXECUTE on all private functions from exposed roles
-- ============================================================
revoke execute on all functions in schema private from public, anon, authenticated;

-- ============================================================
-- D. Grant minimal EXECUTE for RLS policy evaluation
-- ============================================================
-- RLS policy expressions are evaluated with the session user's
-- privileges. The authenticated role needs EXECUTE on the
-- membership helper so that workspace-scoped policies work.
grant execute on function private.has_workspace_role(uuid, text) to authenticated;

-- ============================================================
-- E. Server-only public wrapper for workspace bootstrap
-- ============================================================
create or replace function public.create_workspace(
  p_name text,
  p_slug text,
  p_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  return private.create_workspace_with_owner(p_owner_id, p_name, p_slug);
end;
$$;

revoke execute on function public.create_workspace(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_workspace(text, text, uuid) to service_role;

-- ============================================================
-- F. Update all RLS policies
-- ============================================================

-- Profiles
alter policy "profiles_self_read" on public.profiles
  to authenticated
  using (auth.uid() = id);

alter policy "profiles_self_update" on public.profiles
  to authenticated
  using (auth.uid() = id);

alter policy "profiles_self_insert" on public.profiles
  to authenticated
  with check (auth.uid() = id);

-- Workspaces
alter policy "workspaces_member_read" on public.workspaces
  to authenticated
  using (private.has_workspace_role(id, 'viewer'));

alter policy "workspaces_owner_insert" on public.workspaces
  to authenticated
  with check (auth.uid() = created_by);

alter policy "workspaces_admin_update" on public.workspaces
  to authenticated
  using (private.has_workspace_role(id, 'admin'))
  with check (private.has_workspace_role(id, 'admin'));

alter policy "workspaces_owner_delete" on public.workspaces
  to authenticated
  using (private.has_workspace_role(id, 'owner'));

-- Workspace Memberships
alter policy "wm_member_read" on public.workspace_memberships
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "wm_admin_insert" on public.workspace_memberships
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'admin'));

alter policy "wm_admin_update" on public.workspace_memberships
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'))
  with check (private.has_workspace_role(workspace_id, 'admin'));

alter policy "wm_owner_delete" on public.workspace_memberships
  to authenticated
  using (private.has_workspace_role(workspace_id, 'owner'));

-- Projects
alter policy "projects_member_read" on public.projects
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "projects_member_insert" on public.projects
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "projects_member_update" on public.projects
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "projects_admin_delete" on public.projects
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- Tasks
alter policy "tasks_member_read" on public.tasks
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "tasks_member_insert" on public.tasks
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "tasks_member_update" on public.tasks
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "tasks_admin_delete" on public.tasks
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- Task Context Items
alter policy "tci_member_read" on public.task_context_items
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "tci_member_insert" on public.task_context_items
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "tci_member_update" on public.task_context_items
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "tci_admin_delete" on public.task_context_items
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- Plans
alter policy "plans_member_read" on public.plans
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "plans_member_insert" on public.plans
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "plans_member_update" on public.plans
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Plan Steps
alter policy "ps_member_read" on public.plan_steps
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "ps_member_insert" on public.plan_steps
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "ps_member_update" on public.plan_steps
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Runs
alter policy "runs_member_read" on public.runs
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "runs_member_insert" on public.runs
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "runs_member_update" on public.runs
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Run Events
alter policy "re_member_read" on public.run_events
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "re_member_insert" on public.run_events
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Approval Requests
alter policy "ar_member_read" on public.approval_requests
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "ar_member_insert" on public.approval_requests
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "ar_member_update" on public.approval_requests
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Artifacts
alter policy "art_member_read" on public.artifacts
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "art_member_insert" on public.artifacts
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "art_member_update" on public.artifacts
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "art_admin_delete" on public.artifacts
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- Sources
alter policy "src_member_read" on public.sources
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "src_member_insert" on public.sources
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Audit Events
alter policy "ae_member_read" on public.audit_events
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "ae_member_insert" on public.audit_events
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Tool Invocations
alter policy "ti_member_read" on public.tool_invocations
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "ti_member_insert" on public.tool_invocations
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "ti_member_update" on public.tool_invocations
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

-- Integration Connections
alter policy "ic_member_read" on public.integration_connections
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "ic_admin_insert" on public.integration_connections
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'admin'));

alter policy "ic_admin_update" on public.integration_connections
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'))
  with check (private.has_workspace_role(workspace_id, 'admin'));

alter policy "ic_admin_delete" on public.integration_connections
  to authenticated
  using (private.has_workspace_role(workspace_id, 'owner'));

-- Automations
alter policy "auto_member_read" on public.automations
  to authenticated
  using (private.has_workspace_role(workspace_id, 'viewer'));

alter policy "auto_member_insert" on public.automations
  to authenticated
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "auto_member_update" on public.automations
  to authenticated
  using (private.has_workspace_role(workspace_id, 'member'))
  with check (private.has_workspace_role(workspace_id, 'member'));

alter policy "auto_admin_delete" on public.automations
  to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));

-- Storage Objects (artifacts bucket remains private)
alter policy "artifacts_storage_member_read" on storage.objects
  to authenticated
  using (
    bucket_id = 'artifacts'
    and private.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'viewer'
    )
  );

alter policy "artifacts_storage_member_write" on storage.objects
  to authenticated
  with check (
    bucket_id = 'artifacts'
    and private.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'member'
    )
  );

alter policy "artifacts_storage_member_update" on storage.objects
  to authenticated
  using (
    bucket_id = 'artifacts'
    and private.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'member'
    )
  );

alter policy "artifacts_storage_admin_delete" on storage.objects
  to authenticated
  using (
    bucket_id = 'artifacts'
    and private.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'admin'
    )
  );

-- ============================================================
-- G. Update triggers to reference private functions
-- ============================================================

drop trigger if exists set_updated_at_profiles on public.profiles;
drop trigger if exists set_updated_at_workspaces on public.workspaces;
drop trigger if exists set_updated_at_workspace_memberships on public.workspace_memberships;
drop trigger if exists set_updated_at_projects on public.projects;
drop trigger if exists set_updated_at_tasks on public.tasks;
drop trigger if exists set_updated_at_automations on public.automations;
drop trigger if exists on_auth_user_created on auth.users;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function private.handle_updated_at();

create trigger set_updated_at_workspaces
  before update on public.workspaces
  for each row execute function private.handle_updated_at();

create trigger set_updated_at_workspace_memberships
  before update on public.workspace_memberships
  for each row execute function private.handle_updated_at();

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute function private.handle_updated_at();

create trigger set_updated_at_tasks
  before update on public.tasks
  for each row execute function private.handle_updated_at();

create trigger set_updated_at_automations
  before update on public.automations
  for each row execute function private.handle_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ============================================================
-- H. Drop obsolete public functions
-- ============================================================

drop function if exists public.has_workspace_role(uuid, text);
drop function if exists public.user_can_access_workspace();
drop function if exists public.handle_updated_at();
drop function if exists public.handle_new_user();
drop function if exists public.create_workspace_with_owner(text, text);