/* ============================================================
   MarinaAI — Server-side Supabase Repository Layer

   IMPORTANT: The service-role key must NEVER be exposed to the
   browser. This module is imported only by dashboard-server.js
   (Node.js server), never by Vite client code.
   ============================================================ */

let createClient = null;
try {
  createClient = require("@supabase/supabase-js").createClient;
} catch {}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const isConfigured = Boolean(
  createClient && SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_URL.startsWith("https://"),
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

const _NOT = { ok: false, message: "Supabase not configured" };
const repo = require("./server-supabase-repo");

async function verifySession(bearerToken) {
  if (!isConfigured) return { ok: false, error: "Supabase not configured" };
  if (!bearerToken) return { ok: false, error: "No bearer token provided" };
  const client = getServiceClient();
  if (!client) return { ok: false, error: "Service client unavailable" };
  const { data: { user }, error } = await client.auth.getUser(bearerToken);
  if (error || !user) {
    return { ok: false, error: error?.message || "Invalid or expired token" };
  }
  return { ok: true, user };
}

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
    id: row.workspaces.id, name: row.workspaces.name, slug: row.workspaces.slug, role: row.role,
  }));
  return { ok: true, workspaces };
}

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

// ── Durable task repository (workspace-scoped, RLS-protected) ──
const createTaskInDb = (t) => repo.createTask(getServiceClient(), t);
const getTaskInDb = (workspaceId, taskId) => repo.getTask(getServiceClient(), workspaceId, taskId);
const listTasksInDb = (workspaceId, filters) => repo.listTasks(getServiceClient(), workspaceId, filters);
const updateTaskInDb = (workspaceId, taskId, updates) => repo.updateTask(getServiceClient(), workspaceId, taskId, updates);

const nextPlanVersion = (ws, taskId) => repo.nextPlanVersion(getServiceClient(), ws, taskId);
const createPlanInDb = (p) => repo.createPlan(getServiceClient(), p);
const createPlanStepsInDb = (steps) => repo.createPlanSteps(getServiceClient(), steps);
const listPlansForTaskInDb = (ws, taskId) => repo.listPlansForTask(getServiceClient(), ws, taskId);
const getPlanInDb = (ws, planId) => repo.getPlan(getServiceClient(), ws, planId);
const updatePlanStatusInDb = (ws, planId, status) => repo.updatePlanStatus(getServiceClient(), ws, planId, status);

const createRunInDb = (r) => repo.createRun(getServiceClient(), r);
const updateRunStatusInDb = (runId, status, details) => repo.updateRunStatus(getServiceClient(), runId, status, details);
const getRunInDb = (runId) => repo.getRun(getServiceClient(), runId);
const listRunsForTaskInDb = (ws, taskId) => repo.listRunsForTask(getServiceClient(), ws, taskId);
const nextRunEventSequence = (runId) => repo.nextRunEventSequence(getServiceClient(), runId);
const createRunEventInDb = (e) => repo.createRunEvent(getServiceClient(), e);
const listRunEventsInDb = (runId) => repo.listRunEvents(getServiceClient(), runId);
const findActiveRunForTaskInDb = (ws, taskId) => repo.findActiveRun(getServiceClient(), ws, taskId);

const createApprovalInDb = (a) => repo.createApproval(getServiceClient(), a);
const getApprovalInDb = (ws, id) => repo.getApproval(getServiceClient(), ws, id);
const listApprovalsInDb = (ws, status) => repo.listApprovals(getServiceClient(), ws, status);
const updateApprovalStatusInDb = (ws, id, fields) => repo.updateApprovalStatus(getServiceClient(), ws, id, fields);

const createArtifactInDb = (a) => repo.createArtifact(getServiceClient(), a);
const updateArtifactStateInDb = (ws, id, state) => repo.updateArtifactState(getServiceClient(), ws, id, state);
const getArtifactInDb = (ws, id) => repo.getArtifact(getServiceClient(), ws, id);
const listArtifactsInDb = (ws, filters) => repo.listArtifacts(getServiceClient(), ws, filters);

const createAuditEventInDb = (e) => repo.createAuditEvent(getServiceClient(), e);
const listAuditEventsInDb = (ws, limit) => repo.listAuditEvents(getServiceClient(), ws, limit);

// ── Artifact Storage ─────────────────────────────────────────

const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "text/markdown", "text/plain", "text/csv", "application/json",
  "application/pdf", "image/png", "image/jpeg", "image/svg+xml",
  "image/webp", "application/zip",
  // Office deliverables
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

async function uploadArtifactFile(workspaceId, artifactId, filename, content, contentType, sizeBytes) {
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Supabase not configured" };
  if (sizeBytes && sizeBytes > ARTIFACT_MAX_BYTES) {
    return { ok: false, message: `File exceeds maximum size of ${ARTIFACT_MAX_BYTES / (1024 * 1024)} MB` };
  }
  if (contentType && !ALLOWED_MIME_TYPES.has(contentType)) {
    return { ok: false, message: `MIME type "${contentType}" is not allowed` };
  }
  const filePath = `${workspaceId}/${artifactId}/${filename}`;
  const { data, error } = await client.storage
    .from("artifacts")
    .upload(filePath, content, { contentType: contentType || "text/markdown", upsert: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true, path: data?.path || filePath };
}

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

async function createWorkspace({ userId, name, slug }) {
  if (!isConfigured) return { ok: false, message: "Supabase not configured" };
  if (!userId) return { ok: false, message: "Authenticated user ID required" };
  const client = getServiceClient();
  if (!client) return { ok: false, message: "Service client unavailable" };
  const { data, error } = await client.rpc("create_workspace", {
    p_name: name, p_slug: slug, p_owner_id: userId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, workspaceId: data };
}

async function createWorkspaceForAuthenticatedUser(bearerToken, name, slug) {
  const authResult = await verifySession(bearerToken);
  if (!authResult.ok) return { ok: false, message: authResult.error };
  const normalizedName = (name || "").trim();
  const normalizedSlug = (slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!normalizedName || normalizedName.length < 2) {
    return { ok: false, message: "Workspace name must be at least 2 characters" };
  }
  if (!normalizedSlug || normalizedSlug.length < 2) {
    return { ok: false, message: "Workspace slug must be at least 2 characters" };
  }
  return createWorkspace({ userId: authResult.user.id, name: normalizedName, slug: normalizedSlug });
}

module.exports = {
  isConfigured,
  getSupabaseStatus,
  getServiceClient,
  getAnonClient,
  verifySession,
  getUserWorkspaces,
  verifyWorkspaceMembership,
  createTaskInDb, getTaskInDb, listTasksInDb, updateTaskInDb,
  nextPlanVersion, createPlanInDb, createPlanStepsInDb,
  listPlansForTaskInDb, getPlanInDb, updatePlanStatusInDb,
  createRunInDb, updateRunStatusInDb, getRunInDb, listRunsForTaskInDb,
  nextRunEventSequence, createRunEventInDb, listRunEventsInDb, findActiveRunForTaskInDb,
  createApprovalInDb, getApprovalInDb, listApprovalsInDb, updateApprovalStatusInDb,
  createArtifactInDb, updateArtifactStateInDb, getArtifactInDb, listArtifactsInDb,
  createAuditEventInDb, listAuditEventsInDb,
  uploadArtifactFile, getArtifactSignedUrl,
  createWorkspace, createWorkspaceForAuthenticatedUser,
  ARTIFACT_MAX_BYTES, ALLOWED_MIME_TYPES,
};
