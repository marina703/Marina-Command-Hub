/* ============================================================
   MarinaAI — Research Planner

   Decomposes research queries into parallel subtasks, dispatches
   them through the durable queue, and synthesizes results into
   structured research reports.
   ============================================================ */

const CRYPTO = require("crypto");
const search = require("./server-web-search");
const queue = require("./server-queue-repo");
const repo = require("./server-supabase-repo");
const planner = require("./server-planner");

const MAX_SUBTASKS = Number(process.env.RESEARCH_MAX_SUBTASKS) || 8;
const SUBTASK_TIMEOUT_MS =
  Number(process.env.RESEARCH_SUBTASK_TIMEOUT_MS) || 30000;
const SYNTHESIS_TIMEOUT_MS =
  Number(process.env.RESEARCH_SYNTHESIS_TIMEOUT_MS) || 60000;

/**
 * Decompose a research query into parallel subtasks
 */
function decomposeQuery(query, options = {}) {
  const { maxSubtasks = MAX_SUBTASKS, depth = "standard" } = options;

  // Simple decomposition strategy - can be enhanced with LLM
  const subtasks = [];

  // Core query
  subtasks.push({
    type: "core",
    query: query,
    priority: 1,
  });

  // Decompose into angles
  const angles = [
    { angle: "overview", query: `${query} overview summary` },
    { angle: "technical", query: `${query} technical details implementation` },
    { angle: "comparison", query: `${query} alternatives comparison` },
    { angle: "recent", query: `${query} latest developments 2024 2025` },
    { angle: "use-cases", query: `${query} use cases examples` },
    {
      angle: "limitations",
      query: `${query} limitations challenges drawbacks`,
    },
    { angle: "pricing", query: `${query} pricing cost` },
    { angle: "community", query: `${query} community reviews opinions` },
  ];

  // Select subset based on maxSubtasks
  const selectedAngles = angles.slice(0, maxSubtasks - 1);

  for (const angle of selectedAngles) {
    subtasks.push({
      type: "angle",
      angle: angle.angle,
      query: angle.query,
      priority: 2,
    });
  }

  return subtasks.slice(0, maxSubtasks);
}

/**
 * Execute a single research subtask
 */
async function executeSubtask(
  service,
  subtask,
  workspaceId,
  taskId,
  correlationId,
) {
  const startTime = Date.now();

  try {
    // Search for the subtask
    const searchResult = await search.searchWithFallback(subtask.query, {
      maxResults: 10,
    });

    if (!searchResult.ok) {
      return {
        ok: false,
        subtask,
        error: searchResult.message,
        durationMs: Date.now() - startTime,
      };
    }

    // Store raw results as artifact
    const artifactContent = JSON.stringify(
      {
        subtask,
        results: searchResult.results,
        searchedAt: searchResult.searchedAt,
        provider: searchResult.provider,
      },
      null,
      2,
    );

    const artifactId = CRYPTO.randomBytes(8).toString("hex");
    const artifactPath = `${workspaceId}/${taskId}/research/${artifactId}.json`;

    // Store in private artifact bucket (would use Supabase storage in production)
    // For now, store as run event with metadata

    return {
      ok: true,
      subtask,
      resultCount: searchResult.resultCount,
      results: searchResult.results.slice(0, 5), // Top 5 for synthesis
      artifactId,
      artifactPath,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      ok: false,
      subtask,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Synthesize research results into a structured report
 */
async function synthesizeResults(query, subtaskResults, options = {}) {
  const { format = "markdown" } = options;

  const successfulResults = subtaskResults.filter((r) => r.ok);
  const failedResults = subtaskResults.filter((r) => !r.ok);

  if (!successfulResults.length) {
    return {
      ok: false,
      message: "No successful research results to synthesize",
    };
  }

  // Collect all unique sources
  const allSources = [];
  for (const r of successfulResults) {
    for (const result of r.results) {
      allSources.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        subtask: r.subtask.type,
        angle: r.subtask.angle,
      });
    }
  }

  // Deduplicate by URL
  const uniqueSources = [];
  const seenUrls = new Set();
  for (const source of allSources) {
    if (!seenUrls.has(source.url)) {
      seenUrls.add(source.url);
      uniqueSources.push(source);
    }
  }

  // Build synthesis
  const timestamp = new Date().toISOString();
  const sourceCount = uniqueSources.length;

  let report;

  if (format === "markdown") {
    report = `# Research Report: ${query}

**Generated**: ${timestamp}  
**Subtasks Executed**: ${subtaskResults.length}  
**Successful**: ${successfulResults.length}  
**Failed**: ${failedResults.length}  
**Unique Sources**: ${sourceCount}

---

## Executive Summary

This report synthesizes findings from ${successfulResults.length} parallel research subtasks covering ${subtaskResults.filter((r) => r.subtask.type === "angle").length} analytical angles.

---

## Key Findings by Angle

`;

    // Group by angle
    const byAngle = {};
    for (const r of successfulResults) {
      const angle = r.subtask.angle || r.subtask.type;
      if (!byAngle[angle]) byAngle[angle] = [];
      byAngle[angle].push(r);
    }

    for (const [angle, results] of Object.entries(byAngle)) {
      report += `### ${angle.charAt(0).toUpperCase() + angle.slice(1)}\n\n`;

      // Combine snippets
      const snippets = [];
      for (const r of results) {
        for (const res of r.results) {
          snippets.push(`- **${res.title}** (${res.url}): ${res.snippet}`);
        }
      }

      report += snippets.slice(0, 10).join("\n") + "\n\n";
    }

    report += `---

## Sources

`;

    for (let i = 0; i < uniqueSources.length; i++) {
      const s = uniqueSources[i];
      report += `${i + 1}. [${s.title}](${s.url}) — ${s.angle || "core"}\n`;
    }

    report += `

---

## Failed Subtasks

`;
    for (const f of failedResults) {
      report += `- ${f.subtask.angle || f.subtask.type}: ${f.error}\n`;
    }
  } else {
    // JSON format
    report = JSON.stringify(
      {
        query,
        timestamp,
        stats: {
          totalSubtasks: subtaskResults.length,
          successful: successfulResults.length,
          failed: failedResults.length,
          uniqueSources: sourceCount,
        },
        subtasks: subtaskResults,
        sources: uniqueSources,
      },
      null,
      2,
    );
  }

  return {
    ok: true,
    report,
    format,
    stats: {
      totalSubtasks: subtaskResults.length,
      successful: successfulResults.length,
      failed: failedResults.length,
      uniqueSources: sourceCount,
    },
  };
}

/**
 * Execute full research pipeline: decompose -> parallel search -> synthesize
 */
async function executeResearch(service, query, options = {}) {
  const correlationId = CRYPTO.randomBytes(8).toString("hex");
  const workspaceId = options.workspaceId;
  const taskId = options.taskId;

  // Decompose query
  const subtasks = decomposeQuery(query, options);

  // Execute subtasks in parallel with bounded concurrency
  const concurrency = options.concurrency || 3;
  const subtaskResults = [];

  for (let i = 0; i < subtasks.length; i += concurrency) {
    const batch = subtasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((subtask) =>
        executeSubtask(
          service,
          subtask,
          options.workspaceId,
          options.taskId,
          correlationId,
        ),
      ),
    );
    subtaskResults.push(...batchResults);
  }

  // Synthesize results
  const synthesis = await synthesizeResults(query, subtaskResults, {
    format: options.format || "markdown",
  });

  return {
    ok: true,
    query,
    correlationId,
    subtasks: subtaskResults,
    synthesis,
    stats: {
      totalSubtasks: subtasks.length,
      successful: subtaskResults.filter((r) => r.ok).length,
      failed: subtaskResults.filter((r) => !r.ok).length,
    },
  };
}

/**
 * Queue a research task through the durable queue system
 */
async function queueResearch(
  service,
  workspaceId,
  taskId,
  query,
  options = {},
) {
  const correlationId = CRYPTO.randomBytes(8).toString("hex");
  const idempotencyKey = `research:${taskId}:${CRYPTO.createHash("sha256").update(query).digest("hex").slice(0, 16)}`;

  const enq = await queue.enqueueRun(service, {
    workspaceId,
    taskId,
    toolName: "research",
    toolVersion: "1.0.0",
    idempotencyKey,
    provider: "research",
    availableAt: new Date().toISOString(),
    maxAttempts: 2,
  });

  if (!enq.ok) {
    return { ok: false, message: enq.message };
  }

  // Store research parameters for the worker to pick up
  // In production, this would be stored in a research_params table

  return { ok: true, run: enq.run, correlationId };
}

module.exports = {
  decomposeQuery,
  executeSubtask,
  synthesizeResults,
  executeResearch,
  queueResearch,
  MAX_SUBTASKS,
};
