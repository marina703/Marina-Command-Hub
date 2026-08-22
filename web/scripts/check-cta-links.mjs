#!/usr/bin/env node
/* ============================================================
   MarinaAI — Command Hub CTA link-integrity check (CI-friendly)

   Fails the build when:
     1. Any source file under src/ contains a hard-coded
        localhost / 127.0.0.1 / insecure http:// href.
     2. NEXT_PUBLIC_COMMAND_HUB_URL is set but invalid
        (non-HTTPS, localhost, placeholder domain).
     3. The Hub URL is unconfigured but the truthful
        /hub-access fallback route is missing.

   Zero dependencies — plain Node. Run: npm run test:links
   ============================================================ */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

const failures = [];
const warnings = [];

/* ── 1. Scan source for forbidden hrefs ─────────────────────── */

const FORBIDDEN_HREF =
  /href\s*=\s*["'`]\s*(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[^"'`]*/i;
const INSECURE_HTTP_HREF = /href\s*=\s*["'`]http:\/\/(?!localhost)/i;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx?|jsx?|mts)$/.test(entry.name)) continue;
    const text = readFileSync(full, "utf8");
    const rel = full.slice(root.length + 1);

    const forbidden = text.match(FORBIDDEN_HREF);
    if (forbidden) {
      failures.push(
        `${rel}: hard-coded local/development href found → "${forbidden[0].slice(0, 80)}"`,
      );
    }
    const insecure = text.match(INSECURE_HTTP_HREF);
    if (insecure) {
      failures.push(
        `${rel}: insecure http:// href found → "${insecure[0].slice(0, 80)}"`,
      );
    }
  }
}
walk(srcDir);

/* ── 2. Validate NEXT_PUBLIC_COMMAND_HUB_URL when set ───────── */

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
const BLOCKED_SUFFIXES = [".local", ".internal", ".example", ".test", ".localhost"];

const raw = process.env.NEXT_PUBLIC_COMMAND_HUB_URL;
let configured = null;

if (raw && raw.trim()) {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      failures.push(
        `NEXT_PUBLIC_COMMAND_HUB_URL must be HTTPS (got "${url.protocol}")`,
      );
    } else if (BLOCKED_HOSTS.has(host)) {
      failures.push(
        `NEXT_PUBLIC_COMMAND_HUB_URL points at a blocked host ("${host}")`,
      );
    } else if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
      failures.push(
        `NEXT_PUBLIC_COMMAND_HUB_URL uses a non-production suffix ("${host}")`,
      );
    } else {
      configured = raw.trim().replace(/\/+$/, "");
    }
  } catch {
    failures.push(
      `NEXT_PUBLIC_COMMAND_HUB_URL is not a valid absolute URL ("${raw}")`,
    );
  }
}

/* ── 3. Fallback route must exist when unconfigured ─────────── */

if (!configured) {
  const fallback = join(srcDir, "app", "hub-access", "page.tsx");
  if (!existsSync(fallback)) {
    failures.push(
      "NEXT_PUBLIC_COMMAND_HUB_URL is unconfigured but the /hub-access fallback route (src/app/hub-access/page.tsx) is missing — CTAs would 404.",
    );
  } else {
    warnings.push(
      "NEXT_PUBLIC_COMMAND_HUB_URL is not set — public Hub CTAs resolve to the truthful /hub-access request-access route. Set the variable in Vercel to link the production Hub.",
    );
  }
}

/* ── Report ─────────────────────────────────────────────────── */

for (const w of warnings) console.warn(`WARN: ${w}`);

if (failures.length > 0) {
  console.error("\nCTA link-integrity check FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(
  configured
    ? `CTA link-integrity check passed (Hub → ${configured})`
    : "CTA link-integrity check passed (Hub → /hub-access fallback)",
);