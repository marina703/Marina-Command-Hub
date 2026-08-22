/* ============================================================
   MarinaAI — Command Hub destination (single source of truth)

   Every public "Launch/Open Command Hub" CTA must resolve its
   href through this module. Never hard-code the Hub origin in
   a component.

   Configuration:
     NEXT_PUBLIC_COMMAND_HUB_URL  — absolute HTTPS origin of the
       deployed Command Hub (e.g. https://marina-ai-command-hub.vercel.app)

   Validation rules (enforced here and mirrored by
   scripts/check-cta-links.mjs):
     - must parse as an absolute URL
     - must be HTTPS
     - must not be localhost / 127.0.0.1 / 0.0.0.0 / ::1
     - must not be a placeholder or example domain

   When unconfigured or invalid, CTAs fall back to the truthful
   same-origin "/hub-access" request-access route. A localhost or
   empty destination is never shipped.
   ============================================================ */

/** Hosts that must never be used as a production CTA target. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "example.com",
  "example.org",
  "example.net",
  "placeholder.com",
  "your-domain.com",
  "yourdomain.com",
]);

/** Hostname suffixes that indicate a non-production target. */
const BLOCKED_SUFFIXES = [".local", ".internal", ".example", ".test", ".localhost"];

/**
 * Validate a candidate Command Hub origin.
 * Returns the normalized HTTPS origin, or null when unconfigured/invalid.
 */
export function validateCommandHubUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return null;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;

  // Normalize: no trailing slash so hrefs stay clean.
  return trimmed.replace(/\/+$/, "");
}

/**
 * The authoritative production Command Hub URL, or null when the
 * deployment has not been configured yet.
 */
export const COMMAND_HUB_URL: string | null = validateCommandHubUrl(
  process.env.NEXT_PUBLIC_COMMAND_HUB_URL,
);

/**
 * The href every public Command Hub CTA must use.
 * Falls back to the truthful same-origin request-access route.
 */
export const COMMAND_HUB_HREF: string = COMMAND_HUB_URL ?? "/hub-access";