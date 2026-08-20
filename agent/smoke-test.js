const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { getLLMConfig, collectProjectContext } = require("./agent");
const writeFile = require("./executor/writeFile");
const modifyFile = require("./executor/modifyFile");
const runCommand = require("./executor/runCommand");

(async () => {
  const nestedDir = path.join(__dirname, "tmp", "nested");
  const filePath = path.join(nestedDir, "demo.txt");

  fs.rmSync(nestedDir, { recursive: true, force: true });

  writeFile(filePath, "hello");
  assert.strictEqual(fs.readFileSync(filePath, "utf8"), "hello");

  modifyFile(filePath, "\nworld");
  assert.strictEqual(fs.readFileSync(filePath, "utf8"), "hello\nworld");

  const parsedCreate = require("./agent.js").parseInstructions(
    "Create file tmp/mission-brief.md",
  );
  assert.deepStrictEqual(parsedCreate, [
    {
      action: "createFile",
      payload: { path: "tmp/mission-brief.md", content: "" },
    },
  ]);

  process.env.GEMINI_API_KEY = "test-key";
  process.env.LLM_PROVIDER = "gemini";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";

  const providerConfig = getLLMConfig();
  assert.strictEqual(providerConfig.provider, "gemini");
  assert.strictEqual(providerConfig.apiKey, "test-key");
  assert.strictEqual(providerConfig.model, "gemini-2.5-flash");

  delete process.env.GEMINI_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.GEMINI_MODEL;

  const ctx = collectProjectContext();
  assert.ok(typeof ctx === "string");
  assert.ok(
    ctx.includes("agent") || ctx.includes("web") || ctx.includes("MarinaAI"),
  );

  const { generateStandupBrief, runAutonomousLoop } = require("./scheduler");
  const brief = await generateStandupBrief();
  assert.ok(typeof brief === "string" && brief.length > 0);
  await runAutonomousLoop();

  const { handleVoiceInput } = require("./listener");
  await handleVoiceInput("idea: Real-time Voice to Roadmap sync");
  await handleVoiceInput("task: Review Vercel environment variables");

  const {
    runIdeaToExecutionPlaybook,
    runSiteAuditPlaybook,
    runFastSOPPlaybook,
  } = require("./playbooks");
  const pb1 = await runIdeaToExecutionPlaybook(
    "Automated Course Funnel for pyroprep",
  );
  assert.ok(pb1.ok === true && fs.existsSync(pb1.roadmapFile));

  const pb2 = await runSiteAuditPlaybook();
  assert.ok(pb2.ok === true && fs.existsSync(pb2.auditFile));

  const pb3 = await runFastSOPPlaybook("Autonomous Deployment SOP");
  assert.ok(pb3.ok === true && fs.existsSync(pb3.sopFile));

  await runCommand("node -e \"console.log('ok')\"");
  console.log("smoke-test: ok");
})();
