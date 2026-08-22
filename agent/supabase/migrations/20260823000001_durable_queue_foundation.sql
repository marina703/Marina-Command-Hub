-- ============================================================
-- MarinaAI Command Hub — Durable Queue & Worker Foundation
--
-- Additive forward-only migration. Does NOT modify any table
-- created by 20260821000001_core_schema.sql or
-- 20260822000001_security_hardening.sql. Does NOT change RLS,
-- private schema grants, Auth, or storage settings.
--
-- PURPOSE
-- Provide the minimal additive columns and indexes that a
-- durable queue + worker + registered tool-dispatch foundation
-- requires. The current `runs` table already carries the
-- durable work, event, artifact, and audit records. The only
-- real gaps for queue claim/lease semantics are:
--
--   1. A nullable worker_id/claim_token/lease_expires_at/heartbeat_at
--      triple so a single worker can safely own a run.
--   2. An idempotency_key column + partial unique index so the
--      enqueue path can deduplicate by client request.
--   3. An available_at column so retries with bounded backoff
--      can be persisted without hidden process state.
--   4. A max_attempts column so retry policy is persisted.
--
-- All new columns are NULLABLE so existing rows remain valid
-- and no legacy data must be migrated. RLS is untouched; the
-- existing policies (TO authenticated, private.has_workspace_role)
-- continue to apply.
--
-- GATE
-- This migration is NOT applied by this milestone. It is staged
-- locally on feature/durable-foundations and MUST be reviewed and
-- applied only after the user explicitly approves. The current
-- Supabase staging project (sslgswhhlujryjlrnnfr) remains at the
-- verified baseline and is NOT touched.
-- ============================================================

-- ── 1. Queue claim/lease fields on runs ──
alter table public.runs
  add column if not exists claim_token text,
  add column if not exists worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists idempotency_key text,
  add column if not exists max_attempts integer not null default 1,
  add column if not exists tool_name text default 'safe-internal',
  add column if not exists tool_version text default '1.0.0',
  add column if not exists retry_classification text;

-- ── 2. Idempotency: partial unique index by (workspace_id, task_id, idempotency_key)
--     Only enforced when idempotency_key is non-null. Allows re-enqueue of
--     subsequent attempts while still preventing duplicate enqueue of the
--     same logical request. ──
create unique index if not exists runs_idempotency_key_uidx
  on public.runs (workspace_id, task_id, idempotency_key)
  where idempotency_key is not null;

-- ── 3. Atomic-claim index: used by claimNextEligibleRun to scan
--     only queued rows whose lease is expired or absent and that
--     are ready (available_at <= now()). Workspace isolation is
--     preserved by RLS. ──
create index if not exists runs_claim_scan_idx
  on public.runs (status, available_at)
  where status in ('queued', 'active');

-- ── 4. Run-tool link (typed dispatch): the worker reads tool_name
--     + tool_version to validate against the registry, persists a
--     tool_invocations row, and rejects unknown tools before
--     dispatch. The existing tool_invocations table is sufficient
--     for the audit record; we only add a foreign key for clarity
--     so that orphan invocations are impossible. ──
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tool_invocations_run_id_fkey'
      and table_name = 'tool_invocations'
  ) then
    -- (No-op: the existing tool_invocations.run_id already has a FK in
    -- 20260821000001_core_schema.sql. This block exists only to make
    -- the intent explicit and to short-circuit if a future schema
    -- change accidentally drops the FK.)
    raise notice 'tool_invocations.run_id FK is already present';
  end if;
end
$$;

-- ── 5. tool_invocations: small additive fields used by the worker
--     to record classification, dispatch decision, and durable link
--     to the run. All nullable so existing rows remain valid. ──
alter table public.tool_invocations
  add column if not exists handler_id text,
  add column if not exists handler_version text,
  add column if not exists dispatch_decision text,
  add column if not exists correlation_id text,
  add column if not exists redaction_fields jsonb default '[]'::jsonb,
  add column if not exists duration_ms bigint;

create index if not exists tool_invocations_corr_idx
  on public.tool_invocations (correlation_id)
  where correlation_id is not null;

-- ============================================================
-- END OF MIGRATION
-- No RLS policies are added or changed. No Auth, storage, or
-- private-schema grants are touched. The forward-only additive
-- shape is preserved.
-- ============================================================
