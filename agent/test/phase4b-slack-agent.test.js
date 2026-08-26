/* Slack Deliverables Agent tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const slack = require("../server-slack-agent");

const THREAD = [
  { user: "marina", text: "We should launch a campaign for the new product." },
  { user: "dev", text: "Landing page is ready, just needs copy." },
  { user: "marina", text: "Great, let's target next month." },
];

test("summarizeThread flattens messages into a bullet list", () => {
  const s = slack.summarizeThread(THREAD);
  assert.match(s, /marina: We should launch a campaign/);
  assert.match(s, /dev: Landing page is ready/);
});

test("buildSections produces a proposal structure", () => {
  const sections = slack.buildSections(THREAD, "proposal");
  const headings = sections.map((s) => s.heading);
  assert.ok(headings.includes("Context"));
  assert.ok(headings.includes("Proposal"));
  assert.ok(headings.includes("Next Steps"));
});

test("buildSections produces a meeting-summary structure", () => {
  const sections = slack.buildSections(THREAD, "meeting-summary");
  const headings = sections.map((s) => s.heading);
  assert.ok(headings.includes("Decisions"));
  assert.ok(headings.includes("Action Items"));
});

test("generateDeliverable produces a .docx", async () => {
  const r = await slack.generateDeliverable({ messages: THREAD, type: "proposal", format: "docx" });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "slack-proposal.docx");
  const buf = Buffer.from(r.base64, "base64");
  assert.equal(buf.toString("utf8", 0, 2), "PK");
});

test("generateDeliverable rejects unknown type", async () => {
  const r = await slack.generateDeliverable({ messages: THREAD, type: "nope" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Unknown deliverable type/);
});
