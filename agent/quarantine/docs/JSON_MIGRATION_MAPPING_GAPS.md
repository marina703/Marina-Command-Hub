# JSON Migration Mapping Gaps

## Status: LIVE JSON MIGRATION BLOCKED

The dry-run migration report identifies 16 records in `dashboard-state.json`:
- 12 tasks
- 2 brainstorm ideas (`brainstormIdeas`)
- 2 AI summaries (`aiSummaries`)

## Lossless mapping status

| Record type | Count | Destination table | Lossless? | Status |
|---|---|---|---|---|
| Tasks | 12 | `tasks` | ✅ Yes | Fields map cleanly (title, status, priority, owner→creator_id) |
| Brainstorm Ideas | 2 | **NONE** | ❌ No | No `ideas` table exists in the schema |
| AI Summaries | 2 | **NONE** | ❌ No | No `summaries` table exists in the schema |

## Gap details

### Brainstorm Ideas (2 records)
```json
[
  {"id":"idea-1787364536753","title":"Dynamic AI Lead Concierge for ignitix.online","category":"Revenue","owner":"Ava (Strategist Sub-Agent)","description":"Interactive AI onboarding module converting visitors directly into enrolled users on ignitix and pyroprep."},
  {"id":"idea-1787364536736","title":"Dynamic AI Lead Concierge for ignitix.online","category":"Revenue","owner":"Ava (Strategist Sub-Agent)","description":"Interactive AI onboarding module converting visitors directly into enrolled users on ignitix and pyroprep."}
]
```

**Fields to preserve**: `id`, `title`, `category`, `owner`, `description`

**Recommended schema addition**:
```sql
create table if not exists public.ideas (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  category text default 'Growth',
  owner text default '',
  description text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
-- RLS: same pattern as other workspace-scoped tables
```

### AI Summaries (2 records)
```json
[
  {"id":"summary-1787364536758","title":"AI operations update","summary":"The system is running with 3 active tasks...","owner":"AI Team","generatedAt":"2026-08-22T02:08:56.758Z"},
  {"id":"summary-1787364536739","title":"AI operations update","summary":"The system is running with 1 active tasks...","owner":"AI Team","generatedAt":"2026-08-22T02:08:56.739Z"}
]
```

**Fields to preserve**: `id`, `title`, `summary`, `owner`, `generatedAt`

**Recommended schema addition**:
```sql
create table if not exists public.ai_summaries (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  summary text default '',
  owner text default '',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- RLS: same pattern as other workspace-scoped tables
```

## Blocking decisions required before `--apply`

1. **Add `ideas` and `ai_summaries` tables** to the schema migration (or a follow-up migration) so all 16 records have a lossless destination.
2. **Define the initial owner account**: Which auth user will own the default workspace? The 12 tasks reference `owner: "AI Team"` (not a user ID). A user lookup or default-user mapping is required.
3. **Define the default workspace**: All 12 records lack a `workspaceId`. A default workspace UUID must be created and assigned before migration.

## Conclusion

The live JSON migration (`migrate-json-to-supabase.js --apply`) must remain blocked until:
- The `ideas` and `ai_summaries` tables are added to the schema
- An initial owner account and default workspace are explicitly defined
- The migration tool is updated to handle the new tables