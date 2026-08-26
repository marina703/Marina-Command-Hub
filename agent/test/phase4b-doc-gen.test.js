/* Document Generation tests — node:test. */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.DOC_GEN_ENABLED = "1";

const docGen = require("../server-doc-gen");
const dispatch = require("../server-workflow-dispatch");
const registry = require("../server-tool-registry");

const SECTIONS = [
  { heading: "Overview", body: "This is a proposal for the client." },
  { heading: "Scope", body: "Phase 1 delivery." },
];

test("document-generation tool is registered and dispatchable", () => {
  const def = registry.getToolDefinition("document-generation");
  assert.ok(def);
  assert.equal(def.executable, true);
  assert.equal(registry.isDispatchable(def), true);
});

test("generateDeliverable produces a valid .docx", async () => {
  const r = await docGen.generateDeliverable({ format: "docx", title: "Proposal", sections: SECTIONS });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "proposal.docx");
  assert.ok(r.base64.length > 0);
  // DOCX is a ZIP — magic bytes PK
  const buf = Buffer.from(r.base64, "base64");
  assert.equal(buf.toString("utf8", 0, 2), "PK");
});

test("generateDeliverable produces a valid .xlsx", async () => {
  const r = await docGen.generateDeliverable({
    format: "xlsx",
    title: "Budget",
    sheetName: "Budget",
    rows: [["Item", "Cost"], ["Hosting", 100], ["Design", 250]],
  });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "budget.xlsx");
  const buf = Buffer.from(r.base64, "base64");
  assert.equal(buf.toString("utf8", 0, 2), "PK");
});

test("generateDeliverable produces a .pdf", async () => {
  const r = await docGen.generateDeliverable({ format: "pdf", title: "Report", sections: SECTIONS });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "report.pdf");
  // PDF magic: %PDF
  const buf = Buffer.from(r.base64, "base64");
  assert.equal(buf.toString("utf8", 0, 4), "%PDF");
});

test("generateDeliverable rejects unknown format", async () => {
  const r = await docGen.generateDeliverable({ format: "txt", title: "x" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Unsupported format/);
});

test("dispatch document-generation returns a deliverable", async () => {
  const r = await dispatch.dispatch("document-generation", {
    format: "docx",
    title: "Client Proposal",
    sections: SECTIONS,
  });
  assert.equal(r.ok, true);
  assert.equal(r.filename, "client-proposal.docx");
  assert.ok(r.base64);
});

test("dispatch document-generation rejects missing format", async () => {
  const r = await dispatch.dispatch("document-generation", { title: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.failureClassification, "invalid_input");
});
