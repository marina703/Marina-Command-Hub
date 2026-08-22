/* ============================================================
   MarinaAI — Server-side Supabase Repository Layer

   This module provides a typed, workspace-scoped data access
   layer that uses the Supabase service-role client (server-side
   only) for operations that require elevated access, and the
   anon client for RLS-protected reads.

   IMPORTANT: The service-role key must NEVER be exposed to the
   browser. This module is imported only by dashboard-server.js
   (Node.js server), never by Vite client code.

   When Supabase is not configured (missing env vars or missing
   npm package), the module falls back to the existing JSON file
   persistence in dashboard-state.js.
   ============================================================ */

let createClient = null;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch {
  // @supabase/supabase-js not installed in this environment.
  // The module reports isConfigured = false and all repository
  // functions return "not configured" so the caller falls back
  // to JSON file persistence.
}

// ── Configuration ──
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/** Whether Supabase is fully configured with client + keys. */
const isConfigured = Boolean(
  createClient &&
    SUPABASE_URL &&
    SUPABASE_SERVICE_KEY &&
    SUPABASE_URL.startsWith("https://"),
);

let serviceClient = null;
let anonClient = null;

function getServiceClient() {
  if (!isConfigured) return null;
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

function getAnonClient() {
  if (!createClient || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!anonClient) {
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

function getSupabaseStatus() {
  return {
    configured: isConfigured,
    url: SUPABASE_URL ? SUPABASE_URL.replace(/\/$/, "") : null,
    hasServiceKey: Boolean(SUPABASE_SERVICE_KEY),
    hasAnonKey: Boolean(SUPABASE_ANON_KEY),
    packageInstalled: Boolean(createClient),
  };
}

// ── Auth Verification ────────────────────────────────────────

/**
 * Verify a bearer token and return the authenticated user.
 *
 * SECURITY: This derives the user identity server-side from the JWT.
 * It never trusts a client-supplied userId.
 *
 * @param {string} bearerToken - The Authorization: Bearer <token> value
 * @returns {{ ok: boolean, user?: object, error?: string }}
 */
async function verifySession(bearerToken) {
  if (!isConfigured) return { ok: false, error: "Supabase not configured" };
  if (!bearerToken) return { ok: false, error: "No bearer token provided" };

  const client = getServiceClient();
  if (!client) return { ok: false, error: "Service client unavailable" };

  // Use the service-role client to verify the JWT and get the user
  const { data: { user }, error } = await client.auth.getUser(bearerToken);

  if (error || !user) {
    return { ok: false, error: error?.message || "Invalid or expired token" };
  }

  return { ok: true, user };
}

// ── Workspace Authorization ──────────────────────────────────

/**
 * Get all workspaces the authenticated user is a member of.
 *
 * SECURITY: Uses RLS-aware query — the service client queries
 * workspace_memberships filtered by the authenticated user ID.
 *
 * @param {string} userId - The verified user ID from verifySession
 * @returns {{ ok: boolean, workspaces?: Array, error?: string }}
 */
async function getUserWorkspaces(userId) {
  if (!isConfigured) return { ok: false, error: "Supabase not configured" };
  if (!userId) return { ok: false, error: "User ID required" };

  const client = getServiceClient();
  if (!client) return { ok: false, error: "Service client unavailable" };

  const { data, error } = await client
    .from("workspace_memberships")
    .select("workspace_id, role, workspaces!inner(id, name, slug)")
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  const workspaces = (data || []).map((row) => ({
    id: row.workspaces.id,
    name: row.workspaces.name,
    slug: row.workspaces.slug,
    role: row.role,
  }));

  return { ok: true, workspaces };
}

/**
 * Verify that a user is a member of a specific workspace.
 *
 * SECURITY: This is the server-side authorization check. It must be
 * called on every workspace-scoped API request. Never trust a
 * client-supplied workspaceId as proof of membership.
 *
 * @param {string} userId - The verified user ID
 * @param {string} workspaceId - The workspace ID to check
 * @returns {{ ok: boolean, role?: string, error?: string }}
 */
async function verifyWorkspaceMembership(userId, workspaceId) {
  if (!isConfigured) return { ok: false, error: "Supabase not configured" };
  if (!userId) return { ok: false, error: "User ID required" };
  if (!workspaceId) return { ok: false, error: "Workspace ID required" };

  const client = getServiceClient();
  if (!client) return { ok: false, error: "Service client unavailable" };

  const { data, error } = await client
    .from("workspace_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not a member of this workspace" };

  return { ok: true, role: data.role };
}

// ── Repository functions ──

async function createTaskInDb(task) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("tasks")
    .insert({
      workspace_id: task.workspaceId,
      project_id: task.projectId || null,
      creator_id: task.creatorId || null,
      title: task.title,
      desired_outcome: task.desiredOutcome || "",
      instructions: task.instructions || "",
      status: task.status || "draft",
      priority: task.priority || "Medium",
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, task: data };
}

async function listTasksInDb(workspaceId, filters = {}) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  let query = client
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) return { ok: false, message: error.message };
  return { ok: true, tasks: data || [] };
}

async function createPlanInDb(plan) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("plans")
    .insert({
      workspace_id: plan.workspaceId,
      task_id: plan.taskId,
      version: plan.version || 1,
      status: "draft",
      author: plan.author || "system",
      summary: plan.summary || "",
      assumptions: plan.assumptions || [],
      risks: plan.risks || [],
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, plan: data };
}

async function createRunInDb(run) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("runs")
    .insert({
      workspace_id: run.workspaceId,
      task_id: run.taskId,
      plan_id: run.planId || null,
      status: "queued",
      attempt_count: run.attemptCount || 1,
      parent_run_id: run.parentRunId || null,
      provider: run.provider || "",
      tool_summary: run.toolSummary || "",
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, run: data };
}

async function updateRunStatusInDb(runId, status, details = {}) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const updates = { status };
  if (status === "active" && !details.skipStartedAt) {
    updates.started_at = new Date().toISOString();
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(status)) {
    updates.ended_at = new Date().toISOString();
    if (details.failureClassification) {
      updates.failure_classification = details.failureClassification;
    }
  }
  const { data, error } = await client
    .from("runs")
    .update(updates)
    .eq("id", runId)
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, run: data };
}

async function createApprovalInDb(approval) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("approval_requests")
    .insert({
      workspace_id: approval.workspaceId,
      task_id: approval.taskId || null,
      run_id: approval.runId || null,
      action_type: approval.action,
      payload_hash: approval.payloadHash,
      payload_preview: approval.payloadPreview || {},
      risk_tier: approval.riskTier || "high",
      reason: approval.reason || "",
      status: "pending",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, approval: data };
}

async function createArtifactInDb(artifact) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("artifacts")
    .insert({
      workspace_id: artifact.workspaceId,
      task_id: artifact.taskId || null,
      run_id: artifact.runId || null,
      type: artifact.type || "document",
      display_name: artifact.displayName,
      media_type: artifact.mediaType || "text/markdown",
      storage_ref: artifact.storageRef || "",
      content_hash: artifact.contentHash || "",
      size_bytes: artifact.sizeBytes || 0,
      state: "draft",
      summary: artifact.summary || "",
      provenance: artifact.provenance || {},
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, artifact: data };
}

// ── Artifact Storage ─────────────────────────────────────────

const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
  "application/zip",
]);

/**
 * Upload an artifact file to the private storage bucket.
 *
 * SECURITY: Validates file size and MIME type before upload.
 * Uses the path convention {workspace_id}/{artifact_id}/{filename}.
 *
 * @param {string} workspaceId
 * @param {string} artifactId
 * @param {string} filename
 * @param {Buffer|string} content
 * @param {string} contentType
 * @param {number} sizeBytes - File size in bytes (must be validated by caller)
 */
async function uploadArtifactFile(workspaceId, artifactId, filename, content, contentType, sizeBytes) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };

  // Validate size
  if (sizeBytes && sizeBytes > ARTIFACT_MAX_BYTES) {
    return { ok: false, message: `File exceeds maximum size of ${ARTIFACT_MAX_BYTES / (1024 * 1024)} MB` };
  }

  // Validate MIME type
  if (contentType && !ALLOWED_MIME_TYPES.has(contentType)) {
    return { ok: false, message: `MIME type "${contentType}" is not allowed` };
  }

  const filePath = `${workspaceId}/${artifactId}/${filename}`;
  const { data, error } = await client.storage
    .from("artifacts")
    .upload(filePath, content, {
      contentType: contentType || "text/markdown",
      upsert: true,
    });
  if (error) return { ok: false, message: error.message };
  return { ok: true, path: data?.path || filePath };
}

/**
 * Generate a short-lived signed URL for an artifact download.
 *
 * SECURITY: Never generates public URLs. The signed URL expires
 * after the specified duration (default 1 hour).
 */
async function getArtifactSignedUrl(workspaceId, artifactId, filename, expiresIn = 3600) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const filePath = `${workspaceId}/${artifactId}/${filename}`;
  const { data, error } = await client.storage
    .from("artifacts")
    .createSignedUrl(filePath, expiresIn);
  if (error) return { ok: false, message: error.message };
  return { ok: true, url: data?.signedUrl };
}

async function createAuditEventInDb(event) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  const { data, error } = await client
    .from("audit_events")
    .insert({
      workspace_id: event.workspaceId,
      actor_id: event.actorId || null,
      actor_type: event.actorType || "system",
      action: event.action,
      object_type: event.objectType || "",
      object_id: event.objectId || "",
      metadata: event.metadata || {},
    })
    .select()
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, event: data };
}

/**
 * Create a workspace with the first owner membership.
 *
 * SECURITY: This function calls the server-only public.create_workspace
 * RPC which is restricted to service_role. The userId parameter MUST be
 * derived from verified server auth context (JWT/session). Never accept
 * a client-supplied user_id as trusted input.
 *
 * When real auth is not yet configured, this function returns
 * { ok: false, message: "Authenticated user ID required" } as a
 * truthful unavailable state.
 */
async function createWorkspace({ userId, name, slug }) {
  if (!isConfigured) return { ok: false, message: "Supabase not configured" };
  if (!userId) return { ok: false, message: "Authenticated user ID required" };
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Service client unavailable" };
  const { data, error } = await client.rpc("create_workspace", {
    p_name: name,
    p_slug: slug,
    p_owner_id: userId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, workspaceId: data };
}

/**
 * Create a workspace for an authenticated user.
 *
 * SECURITY: This is the server-only service seam. It:
 * 1. Verifies the authenticated principal via bearer token
 * 2. Validates and normalizes workspace name/slug
 * 3. Invokes the service-role-only create_workspace RPC
 * 4. Never exposes service credentials or allows browser-provided owner IDs
 *
 * NOT wired to public self-service UI until controlled test phase is approved.
 *
 * @param {string} bearerToken - The Authorization: Bearer <token>
 * @param {string} name - Workspace display name
 * @param {string} slug - URL-safe workspace slug
 */
async function createWorkspaceForAuthenticatedUser(bearerToken, name, slug) {
  // Step 1: Verify the authenticated principal
  const authResult = await verifySession(bearerToken);
  if (!authResult.ok) return { ok: false, message: authResult.error };

  // Step 2: Validate and normalize
  const normalizedName = (name || "").trim();
  const normalizedSlug = (slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

  if (!normalizedName || normalizedName.length < 2) {
    return { ok: false, message: "Workspace name must be at least 2 characters" };
  }
  if (!normalizedSlug || normalizedSlug.length < 2) {
    return { ok: false, message: "Workspace slug must be at least 2 characters" };
  }

  // Step 3: Create workspace with verified user ID
  return createWorkspace({
    userId: authResult.user.id,
    name: normalizedName,
    slug: normalizedSlug,
  });
}

module.exports = {
  isConfigured,
  getSupabaseStatus,
  getServiceClient,
  getAnonClient,
  verifySession,
  getUserWorkspaces,
  verifyWorkspaceMembership,
  createTaskInDb,
  listTasksInDb,
  createPlanInDb,
  createRunInDb,
  updateRunStatusInDb,
  createApprovalInDb,
  createArtifactInDb,
  uploadArtifactFile,
  getArtifactSignedUrl,
  createAuditEventInDb,
  createWorkspace,
  createWorkspaceForAuthenticatedUser,
  ARTIFACT_MAX_BYTES,
  ALLOWED_MIME_TYPES,
};