/* ============================================================
   MarinaAI — Agent Bus (Cross-Agent Collaboration, Phase 4E)

   In-memory coordination layer for multi-agent workflows:
     - registerAgent / findAgents / listAgents  (registry + discovery)
     - publish / subscribe / listMessages       (topic message bus)
     - delegate                                 (parent -> child protocol)

   Topics: task.delegated, context.shared, result.published.
   Safe: no shell, no network, no LLM dependency. A Supabase
   pg_notify-backed bus can be swapped in behind the same API.
   ============================================================ */

const TOPICS = ["task.delegated", "context.shared", "result.published"];

const agents = new Map();        // id -> { id, capabilities, registeredAt }
const messages = [];             // { id, topic, from, to, payload, createdAt }
const delegations = [];          // { id, from, to, task, context, expectedOutput, status, createdAt }
const subscribers = new Map();   // topic -> [handler]

function registerAgent({ id, capabilities = [] }) {
  if (!id) return { ok: false, message: "id is required" };
  agents.set(id, { id, capabilities, registeredAt: new Date().toISOString() });
  return { ok: true, agent: agents.get(id) };
}

function findAgents(capability) {
  if (!capability) return { ok: false, message: "capability is required" };
  const matches = [...agents.values()].filter((a) => a.capabilities.includes(capability));
  return { ok: true, agents: matches };
}

function listAgents() {
  return { ok: true, agents: [...agents.values()] };
}

function publish({ topic, from, to, payload = {} }) {
  if (!topic) return { ok: false, message: "topic is required" };
  const message = {
    id: `msg-${messages.length + 1}`,
    topic,
    from: from || null,
    to: to || null,
    payload,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  for (const handler of subscribers.get(topic) || []) {
    try { handler(message); } catch { /* subscriber errors are isolated */ }
  }
  return { ok: true, message };
}

function subscribe(topic, handler) {
  if (!subscribers.has(topic)) subscribers.set(topic, []);
  subscribers.get(topic).push(handler);
  return { ok: true };
}

function listMessages(topic) {
  const filtered = topic ? messages.filter((m) => m.topic === topic) : messages;
  return { ok: true, messages: filtered };
}

/** Parent -> child delegation with context + expected output. */
function delegate({ from, to, task, context = {}, expectedOutput }) {
  if (!to || !task) return { ok: false, message: "to and task are required" };
  const delegation = {
    id: `del-${delegations.length + 1}`,
    from: from || null,
    to,
    task,
    context,
    expectedOutput: expectedOutput || "",
    status: "delegated",
    createdAt: new Date().toISOString(),
  };
  delegations.push(delegation);
  publish({
    topic: "task.delegated",
    from: from || null,
    to,
    payload: { delegationId: delegation.id, task, context, expectedOutput },
  });
  return { ok: true, delegation };
}

function listDelegations() {
  return { ok: true, delegations };
}

function stats() {
  return { agentCount: agents.size, messageCount: messages.length, delegationCount: delegations.length };
}

module.exports = {
  TOPICS,
  registerAgent,
  findAgents,
  listAgents,
  publish,
  subscribe,
  listMessages,
  delegate,
  listDelegations,
  stats,
};
