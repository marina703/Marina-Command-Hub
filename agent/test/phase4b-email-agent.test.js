/* Email-to-Agent (Mail Manus) tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const emailAgent = require("../server-email-agent");

test("parseEmail extracts title, outcome, and instructions", () => {
  const parsed = emailAgent.parseEmail({
    from: "client@example.com",
    subject: "Build a landing page",
    body: "We need a landing page for our new product launch.\nPlease include a hero and pricing section.",
  });
  assert.equal(parsed.title, "Build a landing page");
  assert.equal(parsed.outcome, "We need a landing page for our new product launch.");
  assert.match(parsed.instructions, /pricing section/);
  assert.equal(parsed.from, "client@example.com");
});

test("parseEmail detects priority from urgency keywords", () => {
  assert.equal(emailAgent.parseEmail({ subject: "URGENT: fix the outage", body: "" }).priority, "High");
  assert.equal(emailAgent.parseEmail({ subject: "low priority: whenever you can", body: "" }).priority, "Low");
  assert.equal(emailAgent.parseEmail({ subject: "nothing urgent: whenever", body: "" }).priority, "Low");
  assert.equal(emailAgent.parseEmail({ subject: "General update", body: "Weekly status sync" }).priority, "Medium");
});

test("parseEmail falls back to a default title", () => {
  const parsed = emailAgent.parseEmail({ from: "x@y.com", subject: "", body: "some body" });
  assert.ok(parsed.title.length > 0);
});

test("processEmail returns not-configured without a client", async () => {
  const r = await emailAgent.processEmail(null, { workspaceId: "w1", subject: "hi", body: "hello" });
  assert.equal(r.ok, false);
  assert.match(r.message, /not configured/i);
});
