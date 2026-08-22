-- ============================================================
-- MarinaAI Command Hub — Core Schema Migration
--
-- Creates all domain tables with UUID primary keys, timestamps,
-- workspace-scoped foreign keys, indexes, and Row-Level Security
-- policies for owner/admin/member/viewer roles.
--
-- All tenant-owned tables enforce workspace isolation via RLS.
-- No public buckets or anonymous access are created.
-- ============================================================

-- ── Extensions ──
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Helper: workspace membership check ──
-- Returns true if the current auth user is a member of the workspace
-- with at least the required role.
create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_required_role text default 'viewer'
)
returns boolean
language sql
security definer
set search_path = public
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

-- ── Helper: resolve workspace_id for a record ──
-- Used in RLS policies to check workspace membership via a record's workspace_id.
create or replace function public.user_can_access_workspace()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Returns the first workspace_id the current user is a member of.
  -- Used as a fallback for single-workspace deployments.
  select wm.workspace_id
  from public.workspace_memberships wm
  where wm.user_id = auth.uid()
    and wm.status = 'active'
  order by wm.created_at asc
  limit 1;
$$;

-- ============================================================
-- 1. Profiles (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- 2. Workspaces
-- ============================================================
create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_slug on public.workspaces(slug);

alter table public.workspaces enable row level security;

create policy "workspaces_member_read"
  on public.workspaces for select
  using (public.has_workspace_role(id, 'viewer'));

create policy "workspaces_owner_insert"
  on public.workspaces for insert
  with check (auth.uid() = created_by);

create policy "workspaces_admin_update"
  on public.workspaces for update
  using (public.has_workspace_role(id, 'admin'));

create policy "workspaces_owner_delete"
  on public.workspaces for delete
  using (public.has_workspace_role(id, 'owner'));

-- ============================================================
-- 3. Workspace Memberships
-- ============================================================
create table if not exists public.workspace_memberships (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create index if not exists idx_wm_workspace on public.workspace_memberships(workspace_id);
create index if not exists idx_wm_user on public.workspace_memberships(user_id);

alter table public.workspace_memberships enable row level security;

create policy "wm_member_read"
  on public.workspace_memberships for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "wm_admin_insert"
  on public.workspace_memberships for insert
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy "wm_admin_update"
  on public.workspace_memberships for update
  using (public.has_workspace_role(workspace_id, 'admin'));

create policy "wm_owner_delete"
  on public.workspace_memberships for delete
  using (public.has_workspace_role(workspace_id, 'owner'));

-- ============================================================
-- 4. Projects
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text default '',
  allowed_tools jsonb default '[]'::jsonb,
  default_budget_limit numeric(10,2) default 100.00,
  default_time_limit_seconds integer default 300,
  owner_id uuid references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_workspace on public.projects(workspace_id);

alter table public.projects enable row level security;

create policy "projects_member_read"
  on public.projects for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "projects_member_insert"
  on public.projects for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "projects_member_update"
  on public.projects for update
  using (public.has_workspace_role(workspace_id, 'member'));

create policy "projects_admin_delete"
  on public.projects for delete
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ============================================================
-- 5. Tasks
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  creator_id uuid references auth.users(id),
  title text not null,
  desired_outcome text default '',
  instructions text default '',
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'awaiting_plan_review', 'queued',
                      'running', 'awaiting_approval', 'paused',
                      'completed', 'failed', 'cancelled')),
  priority text not null default 'Medium'
    check (priority in ('Low', 'Medium', 'High', 'Critical')),
  active_plan_version integer,
  budget_limit numeric(10,2),
  time_limit_seconds integer,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_workspace on public.tasks(workspace_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_creator on public.tasks(creator_id);

alter table public.tasks enable row level security;

create policy "tasks_member_read"
  on public.tasks for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "tasks_member_insert"
  on public.tasks for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "tasks_member_update"
  on public.tasks for update
  using (public.has_workspace_role(workspace_id, 'member'));

create policy "tasks_admin_delete"
  on public.tasks for delete
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ============================================================
-- 6. Task Context Items
-- ============================================================
create table if not exists public.task_context_items (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type text not null default 'text'
    check (type in ('text', 'file', 'url', 'note', 'connection_reference')),
  display_name text not null,
  storage_ref text,
  provenance jsonb default '{}'::jsonb,
  sensitivity_label text not null default 'internal'
    check (sensitivity_label in ('public', 'internal', 'confidential', 'restricted')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tci_task on public.task_context_items(task_id);

alter table public.task_context_items enable row level security;

create policy "tci_member_read"
  on public.task_context_items for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "tci_member_insert"
  on public.task_context_items for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "tci_member_update"
  on public.task_context_items for update
  using (public.has_workspace_role(workspace_id, 'member'));

create policy "tci_admin_delete"
  on public.task_context_items for delete
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ============================================================
-- 7. Plans
-- ============================================================
create table if not exists public.plans (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'superseded', 'rejected')),
  author text not null default 'system',
  summary text default '',
  assumptions jsonb default '[]'::jsonb,
  risks jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique(task_id, version)
);

create index if not exists idx_plans_task on public.plans(task_id);
create index if not exists idx_plans_workspace on public.plans(workspace_id);

alter table public.plans enable row level security;

create policy "plans_member_read"
  on public.plans for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "plans_member_insert"
  on public.plans for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "plans_member_update"
  on public.plans for update
  using (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 8. Plan Steps
-- ============================================================
create table if not exists public.plan_steps (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  purpose text default '',
  dependencies jsonb default '[]'::jsonb,
  tool_class text default '',
  input_summary text default '',
  expected_output text default '',
  risk_tier text not null default 'low'
    check (risk_tier in ('low', 'moderate', 'high', 'critical')),
  requires_approval boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'awaiting_approval',
                      'completed', 'failed', 'skipped', 'cancelled')),
  estimated_duration integer,
  estimated_cost numeric(10,2),
  retry_policy jsonb default '{"maxRetries": 0}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ps_plan on public.plan_steps(plan_id);
create index if not exists idx_ps_task on public.plan_steps(task_id);

alter table public.plan_steps enable row level security;

create policy "ps_member_read"
  on public.plan_steps for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "ps_member_insert"
  on public.plan_steps for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "ps_member_update"
  on public.plan_steps for update
  using (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 9. Runs
-- ============================================================
create table if not exists public.runs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'active', 'succeeded', 'failed',
                      'cancelled', 'timed_out')),
  attempt_count integer not null default 1,
  parent_run_id uuid references public.runs(id) on delete set null,
  provider text default '',
  tool_summary text default '',
  started_at timestamptz,
  ended_at timestamptz,
  failure_classification text,
  budget_used numeric(10,2) default 0,
  time_used_ms bigint default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_runs_task on public.runs(task_id);
create index if not exists idx_runs_workspace on public.runs(workspace_id);
create index if not exists idx_runs_status on public.runs(status);

alter table public.runs enable row level security;

create policy "runs_member_read"
  on public.runs for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "runs_member_insert"
  on public.runs for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "runs_member_update"
  on public.runs for update
  using (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 10. Run Events
-- ============================================================
create table if not exists public.run_events (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  sequence integer not null default 0,
  event text not null,
  summary text default '',
  metadata jsonb default '{}'::jsonb,
  actor text not null default 'system'
    check (actor in ('user', 'system', 'provider', 'tool')),
  created_at timestamptz not null default now()
);

create index if not exists idx_re_run on public.run_events(run_id);
create index if not exists idx_re_task on public.run_events(task_id);

alter table public.run_events enable row level security;

create policy "re_member_read"
  on public.run_events for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "re_member_insert"
  on public.run_events for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 11. Approval Requests
-- ============================================================
create table if not exists public.approval_requests (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  plan_step_id uuid references public.plan_steps(id) on delete set null,
  action_type text not null,
  action_target text default '',
  payload_hash text not null,
  payload_preview jsonb default '{}'::jsonb,
  risk_tier text not null default 'high'
    check (risk_tier in ('low', 'moderate', 'high', 'critical')),
  reason text default '',
  requested_by uuid references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_note text default '',
  executed_result text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ar_workspace on public.approval_requests(workspace_id);
create index if not exists idx_ar_status on public.approval_requests(status);
create index if not exists idx_ar_task on public.approval_requests(task_id);

alter table public.approval_requests enable row level security;

create policy "ar_member_read"
  on public.approval_requests for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "ar_member_insert"
  on public.approval_requests for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "ar_member_update"
  on public.approval_requests for update
  using (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 12. Artifacts
-- ============================================================
create table if not exists public.artifacts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  type text not null default 'document',
  display_name text not null,
  media_type text default 'text/markdown',
  storage_ref text,
  content_hash text,
  size_bytes bigint default 0,
  state text not null default 'draft'
    check (state in ('draft', 'ready', 'archived', 'deleted')),
  summary text default '',
  provenance jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_art_workspace on public.artifacts(workspace_id);
create index if not exists idx_art_task on public.artifacts(task_id);
create index if not exists idx_art_state on public.artifacts(state);

alter table public.artifacts enable row level security;

create policy "art_member_read"
  on public.artifacts for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "art_member_insert"
  on public.artifacts for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "art_member_update"
  on public.artifacts for update
  using (public.has_workspace_role(workspace_id, 'member'));

create policy "art_admin_delete"
  on public.artifacts for delete
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ============================================================
-- 13. Sources
-- ============================================================
create table if not exists public.sources (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  url text default '',
  file_ref text default '',
  title text default '',
  author text default '',
  retrieved_at timestamptz not null default now(),
  excerpt text default '',
  trust_label text not null default 'unverified'
    check (trust_label in ('unverified', 'verified', 'trusted')),
  sensitivity_label text not null default 'internal'
    check (sensitivity_label in ('public', 'internal', 'confidential', 'restricted'))
);

create index if not exists idx_src_task on public.sources(task_id);

alter table public.sources enable row level security;

create policy "src_member_read"
  on public.sources for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "src_member_insert"
  on public.sources for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 14. Audit Events
-- ============================================================
create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_type text not null default 'system'
    check (actor_type in ('user', 'system', 'provider', 'tool')),
  action text not null,
  object_type text default '',
  object_id text default '',
  metadata jsonb default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ae_workspace on public.audit_events(workspace_id);
create index if not exists idx_ae_created on public.audit_events(created_at desc);

alter table public.audit_events enable row level security;

create policy "ae_member_read"
  on public.audit_events for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "ae_member_insert"
  on public.audit_events for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 15. Tool Invocations
-- ============================================================
create table if not exists public.tool_invocations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  plan_step_id uuid references public.plan_steps(id) on delete set null,
  tool_name text not null,
  input_fingerprint text not null,
  redacted_input jsonb default '{}'::jsonb,
  redacted_output jsonb default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  usage jsonb default '{}'::jsonb,
  error text,
  approval_id uuid references public.approval_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_ti_run on public.tool_invocations(run_id);

alter table public.tool_invocations enable row level security;

create policy "ti_member_read"
  on public.tool_invocations for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "ti_member_insert"
  on public.tool_invocations for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "ti_member_update"
  on public.tool_invocations for update
  using (public.has_workspace_role(workspace_id, 'member'));

-- ============================================================
-- 16. Integration Connections
-- ============================================================
create table if not exists public.integration_connections (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  scope_summary text default '',
  connection_state text not null default 'disconnected'
    check (connection_state in ('connected', 'disconnected', 'error', 'revoked')),
  credential_ref text, -- server-side encrypted reference only
  owner_id uuid references auth.users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ic_workspace on public.integration_connections(workspace_id);

alter table public.integration_connections enable row level security;

create policy "ic_member_read"
  on public.integration_connections for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "ic_admin_insert"
  on public.integration_connections for insert
  with check (public.has_workspace_role(workspace_id, 'admin'));

create policy "ic_admin_update"
  on public.integration_connections for update
  using (public.has_workspace_role(workspace_id, 'admin'));

create policy "ic_admin_delete"
  on public.integration_connections for delete
  using (public.has_workspace_role(workspace_id, 'owner'));

-- ============================================================
-- 17. Automations
-- ============================================================
create table if not exists public.automations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid references auth.users(id),
  name text not null,
  schedule_definition jsonb default '{}'::jsonb,
  state text not null default 'disabled'
    check (state in ('active', 'paused', 'failing', 'disabled')),
  task_template jsonb default '{}'::jsonb,
  idempotency_strategy text default 'skip',
  max_runs integer default 10,
  max_budget numeric(10,2) default 50.00,
  max_time_seconds integer default 600,
  approval_policy text not null default 'just_in_time'
    check (approval_policy in ('none', 'plan_approval', 'just_in_time')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  failure_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auto_workspace on public.automations(workspace_id);

alter table public.automations enable row level security;

create policy "auto_member_read"
  on public.automations for select
  using (public.has_workspace_role(workspace_id, 'viewer'));

create policy "auto_member_insert"
  on public.automations for insert
  with check (public.has_workspace_role(workspace_id, 'member'));

create policy "auto_member_update"
  on public.automations for update
  using (public.has_workspace_role(workspace_id, 'member'));

create policy "auto_admin_delete"
  on public.automations for delete
  using (public.has_workspace_role(workspace_id, 'admin'));

-- ============================================================
-- 18. Private Storage Bucket for Artifacts
-- ============================================================
-- Only private bucket — no public access, no anonymous downloads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifacts',
  'artifacts',
  false,
  52428800, -- 50MB
  array['text/markdown', 'text/plain', 'application/json', 'application/pdf',
        'image/png', 'image/jpeg', 'image/svg+xml', 'text/csv']
)
on conflict (id) do nothing;

-- Storage RLS: only workspace members can read/write artifacts bucket objects.
-- The path convention is: {workspace_id}/{artifact_id}/{filename}
create policy "artifacts_storage_member_read"
  on storage.objects for select
  using (
    bucket_id = 'artifacts'
    and public.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'viewer'
    )
  );

create policy "artifacts_storage_member_write"
  on storage.objects for insert
  with check (
    bucket_id = 'artifacts'
    and public.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'member'
    )
  );

create policy "artifacts_storage_member_update"
  on storage.objects for update
  using (
    bucket_id = 'artifacts'
    and public.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'member'
    )
  );

create policy "artifacts_storage_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'artifacts'
    and public.has_workspace_role(
      split_part(name, '/', 1)::uuid,
      'admin'
    )
  );

-- ============================================================
-- 19. Updated_at Triggers
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_workspaces
  before update on public.workspaces
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_workspace_memberships
  before update on public.workspace_memberships
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_tasks
  before update on public.tasks
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_automations
  before update on public.automations
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 20. Auto-create profile on user signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();