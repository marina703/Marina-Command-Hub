/* ============================================================
   Marina AI Command Hub — Workspace Authorization

   Server-side workspace scoping and authorization checks.
   Every read/write query must pass through these functions to
   ensure a user cannot see or modify another workspace's
   records by guessing an ID.

   In the current single-workspace deployment, the default
   workspace is "default". When multi-workspace provisioning
   is added, these functions become the enforcement seam.
   ============================================================ */

const DEFAULT_WORKSPACE_ID = "default";

/**
 * Resolve the workspace ID from a request context.
 * In production this would come from the authenticated session.
 * For now, all requests are scoped to the default workspace
 * unless explicitly provided.
 */
function resolveWorkspaceId(context = {}) {
  return context.workspaceId || DEFAULT_WORKSPACE_ID;
}

/**
 * Assert that a record belongs to the given workspace.
 * Throws an AuthorizationError if the workspace does not match.
 */
class AuthorizationError extends Error {
  constructor(resource, id, workspaceId) {
    super(
      `Access denied: ${resource} "${id}" does not belong to workspace "${workspaceId}"`,
    );
    this.name = "AuthorizationError";
    this.resource = resource;
    this.id = id;
    this.workspaceId = workspaceId;
  }
}

/**
 * Verify that a record's workspaceId matches the expected workspace.
 * Records without a workspaceId are treated as belonging to the
 * default workspace (backward compatibility with pre-scoped data).
 */
function assertWorkspaceAccess(record, workspaceId, resourceType = "record") {
  if (!record) return;
  const recordWorkspace = record.workspaceId || DEFAULT_WORKSPACE_ID;
  if (recordWorkspace !== workspaceId) {
    throw new AuthorizationError(resourceType, record.id || "unknown", workspaceId);
  }
}

/**
 * Filter an array of records to only those belonging to the workspace.
 * Records without a workspaceId are included (backward compatibility).
 */
function scopeToWorkspace(records, workspaceId) {
  if (!Array.isArray(records)) return [];
  return records.filter((r) => {
    const rw = r.workspaceId || DEFAULT_WORKSPACE_ID;
    return rw === workspaceId;
  });
}

/**
 * Stamp a record with the workspace ID before persistence.
 */
function stampWorkspace(record, workspaceId) {
  return {
    ...record,
    workspaceId: workspaceId || DEFAULT_WORKSPACE_ID,
  };
}

/**
 * Check if a user has a required role in a workspace.
 * Currently all users are "owner" of the default workspace.
 * When membership is provisioned, this checks WorkspaceMembership.
 */
function hasRole(userContext, workspaceId, requiredRole) {
  // In the current single-workspace deployment, the operator
  // has full owner access. This is the seam where RBAC will be
  // enforced when multi-user provisioning is added.
  const role = userContext?.role || "owner";
  const roleHierarchy = ["viewer", "member", "admin", "owner"];
  const requiredIdx = roleHierarchy.indexOf(requiredRole);
  const actualIdx = roleHierarchy.indexOf(role);
  if (requiredIdx === -1 || actualIdx === -1) return false;
  return actualIdx >= requiredIdx;
}

module.exports = {
  DEFAULT_WORKSPACE_ID,
  AuthorizationError,
  resolveWorkspaceId,
  assertWorkspaceAccess,
  scopeToWorkspace,
  stampWorkspace,
  hasRole,
};