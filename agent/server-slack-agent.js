/* ============================================================
   MarinaAI — Slack Deliverables Agent

   Reads a Slack thread and produces a structured deliverable
   (proposal, product spec, campaign plan, or meeting summary) as
   a .docx/.pdf document. Deterministic, providerless, safe —
   reuses the document-generation module. No shell, no network
   egress beyond the caller's own Supabase repo.
   ============================================================ */

const docGen = require("./server-doc-gen");

const DELIVERABLE_TYPES = ["proposal", "product-spec", "campaign-plan", "meeting-summary"];

/** Flatten a thread into a bullet list of speaker + text. */
function summarizeThread(messages = []) {
  return messages
    .map((m) => `- ${m.user || "someone"}: ${m.text || ""}`)
    .join("\n");
}

/** Build structured sections for a deliverable type from thread context. */
function buildSections(messages, type) {
  const points = summarizeThread(messages);
  switch (type) {
    case "proposal":
      return [
        { heading: "Context", body: points },
        { heading: "Proposal", body: "Based on the thread, the following proposal is recommended for approval." },
        { heading: "Next Steps", body: "1. Review and approve\n2. Assign an owner\n3. Schedule delivery" },
      ];
    case "product-spec":
      return [
        { heading: "Requirements", body: points },
        { heading: "Scope", body: "In-scope and out-of-scope items based on the discussion." },
        { heading: "Acceptance Criteria", body: "Define measurable outcomes before sign-off." },
      ];
    case "campaign-plan":
      return [
        { heading: "Campaign Overview", body: points },
        { heading: "Channels", body: "Recommended channels and messaging approach." },
        { heading: "Timeline", body: "A phased rollout plan with milestones." },
      ];
    case "meeting-summary":
      return [
        { heading: "Discussion", body: points },
        { heading: "Decisions", body: "Key decisions reached during the thread." },
        { heading: "Action Items", body: "Owners and deadlines for follow-ups." },
      ];
    default:
      return [{ heading: "Summary", body: points }];
  }
}

/** Generate a deliverable document from a thread. */
async function generateDeliverable({ messages, type, format = "docx", title }) {
  if (!DELIVERABLE_TYPES.includes(type)) {
    return { ok: false, message: `Unknown deliverable type: ${type}. Use ${DELIVERABLE_TYPES.join(", ")}.` };
  }
  const sections = buildSections(messages, type);
  const docTitle = title || `Slack ${type.replace("-", " ")}`;
  const result = await docGen.generateDeliverable({ format, title: docTitle, sections });
  return { ok: result.ok, ...result, sections };
}

module.exports = { DELIVERABLE_TYPES, summarizeThread, buildSections, generateDeliverable };
