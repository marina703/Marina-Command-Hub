/**
 * Vercel Serverless Function — Marina AI Command Hub API
 *
 * This single handler delegates every /api/* request to the existing
 * handleRequest router in dashboard-server.js.  When dashboard-server.js
 * is imported (not run directly) it does NOT bind a port or start
 * background timers (scheduler / voice watcher), so it is safe to use
 * inside a Vercel serverless function.
 *
 * The built React SPA (dist/) is served automatically by Vercel's
 * @vercel/static-build (see vercel.json), so this function only ever
 * receives /api/* requests.
 */

const { handleRequest } = require("../dashboard-server");

/**
 * Vercel Node.js serverless function entry point.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = (req, res) => {
  return handleRequest(req, res).catch((err) => {
    // Safety net: if handleRequest throws, send a clean 500 JSON response.
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, message: err.message || "Internal Server Error" }));
    }
  });
};

// Allow up to 60 seconds (Vercel Pro).  Free tier caps at 10s.
// Playbook runs with a 120s LLM timeout may exceed this — those long-running
// ops are best suited for the self-hosted Windows service.
module.exports.maxDuration = 60;
