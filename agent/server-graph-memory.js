/* ============================================================
   MarinaAI — Knowledge Graph Memory

   Persistent graph-based memory for "self-improving agents":
     - remember(entity, relations)  → write nodes + edges
     - recall(query, depth)         → keyword seed + BFS traversal
     - reason(start, end, maxHops)  → multi-hop path finding

   Storage is pluggable: the default is an in-memory store with
   optional JSON-file persistence (memory-graph.json). A Supabase
   pgvector-backed store can be swapped in behind the same API.
   Safe: no shell, no network, no LLM dependency.
   ============================================================ */

const FS = require("fs");
const PATH = require("path");

const STORE_FILE = process.env.MEMORY_GRAPH_FILE || PATH.join(__dirname, "memory-graph.json");

let nodes = new Map(); // id -> { id, type, label, props, createdAt }
let edges = [];        // { from, to, relation, weight }

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function load() {
  try {
    const raw = FS.readFileSync(STORE_FILE, "utf8");
    const data = JSON.parse(raw);
    nodes = new Map((data.nodes || []).map((n) => [n.id, n]));
    edges = data.edges || [];
  } catch {
    nodes = new Map();
    edges = [];
  }
}

function persist() {
  try {
    FS.writeFileSync(
      STORE_FILE,
      JSON.stringify({ nodes: [...nodes.values()], edges }, null, 2),
      "utf8",
    );
  } catch {
    /* best-effort persistence */
  }
}

/** Write a node + its relations to the graph. */
function remember({ id, type = "entity", label, props = {}, relations = [] }) {
  const nodeId = id || slug(label || "node");
  if (!nodeId) return { ok: false, message: "A label or id is required" };
  nodes.set(nodeId, {
    id: nodeId,
    type,
    label: label || nodeId,
    props: props || {},
    createdAt: new Date().toISOString(),
  });
  for (const rel of relations || []) {
    if (!rel.to) continue;
    // Ensure the target node exists (as a stub if unknown).
    if (!nodes.has(rel.to)) {
      nodes.set(rel.to, { id: rel.to, type: "entity", label: rel.to, props: {}, createdAt: new Date().toISOString() });
    }
    edges.push({ from: nodeId, to: rel.to, relation: rel.relation || "related", weight: rel.weight || 1 });
  }
  persist();
  return { ok: true, id: nodeId, nodeCount: nodes.size, edgeCount: edges.length };
}

function traverse(id, depth, visited, results, level) {
  if (visited.has(id) || level > depth) return;
  visited.add(id);
  const node = nodes.get(id);
  if (node) results.push({ node, path: [...visited] });
  if (level < depth) {
    for (const e of edges) {
      if (e.from === id) traverse(e.to, depth, visited, results, level + 1);
    }
  }
}

/** Retrieve nodes matching a query, then traverse their neighborhood up to depth. */
function recall({ query, depth = 2, limit = 10 }) {
  const q = String(query || "").toLowerCase().trim();
  const results = [];
  const visited = new Set();

  if (q) {
    const seeds = [...nodes.values()].filter(
      (n) =>
        (n.label || "").toLowerCase().includes(q) ||
        JSON.stringify(n.props || {}).toLowerCase().includes(q) ||
        (n.type || "").toLowerCase().includes(q),
    );
    for (const seed of seeds) traverse(seed.id, depth, visited, results, 0);
  }

  // Fall back to the most recent nodes when nothing matched.
  if (results.length === 0) {
    for (const n of [...nodes.values()].slice(-limit)) {
      results.push({ node: n, path: [n.id] });
    }
  }

  return { ok: true, query, results: results.slice(0, limit) };
}

/** Multi-hop path finding between two nodes. */
function reason({ start, end, maxHops = 5 }) {
  if (!nodes.has(start)) return { ok: false, message: `Start node not found: ${start}` };
  if (!nodes.has(end)) return { ok: false, message: `End node not found: ${end}` };
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === end) return { ok: true, path };
    if (path.length >= maxHops) continue;
    for (const e of edges) {
      if (e.from === last && !visited.has(e.to)) {
        visited.add(e.to);
        queue.push([...path, e.to]);
      }
    }
  }
  return { ok: false, message: "No path found within hop limit", path: null };
}

function stats() {
  return { nodeCount: nodes.size, edgeCount: edges.length };
}

function clear() {
  nodes = new Map();
  edges = [];
  persist();
  return { ok: true, nodeCount: 0, edgeCount: 0 };
}

load();

module.exports = { remember, recall, reason, stats, load, persist, clear, slug };
