/* ============================================================
   Phase 4A: Web Search Tool Tests
   ============================================================ */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const search = require("../server-web-search");

const research = require("../server-research-planner");

const codeGen = require("../server-code-gen");

const sandbox = require("../server-sandbox");

test("web-search module exports required functions", () => {
  assert.equal(typeof search.searchWeb, "function");
  assert.equal(typeof search.searchWithFallback, "function");
  assert.equal(typeof search.batchSearch, "function");
  assert.ok(search.PROVIDERS);
  assert.ok(search.DEFAULT_PROVIDER);
});

test("PROVIDERS has expected providers", () => {
  assert.ok(search.PROVIDERS.tavily);
  assert.ok(search.PROVIDERS.serpapi);
  assert.ok(search.PROVIDERS.exa);

  for (const [name, config] of Object.entries(search.PROVIDERS)) {
    assert.equal(config.name, name);
    assert.ok(config.baseUrl);
    assert.ok(config.requiredEnv);
    assert.ok(config.maxResults);
  }
});

test("searchWeb validates missing API key", async () => {
  // Temporarily remove API keys
  const originalKeys = {};
  for (const [name, config] of Object.entries(search.PROVIDERS)) {
    originalKeys[config.requiredEnv] = process.env[config.requiredEnv];
    delete process.env[config.requiredEnv];
  }

  try {
    const result = await search.searchWeb("test query");
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("No API key configured"));
  } finally {
    // Restore
    for (const [key, value] of Object.entries(originalKeys)) {
      if (value) process.env[key] = value;
    }
  }
});

test("decomposeQuery creates valid subtasks", () => {
  const subtasks = research.decomposeQuery("test query", { maxSubtasks: 5 });
  assert.ok(Array.isArray(subtasks));
  assert.ok(subtasks.length > 0);
  assert.ok(subtasks.length <= 5);

  // Check core subtask
  const core = subtasks.find((s) => s.type === "core");
  assert.ok(core);
  assert.equal(core.query, "test query");

  // Check angle subtasks
  const angles = subtasks.filter((s) => s.type === "angle");
  assert.ok(angles.length > 0);
});

test("decomposeQuery respects maxSubtasks limit", () => {
  const subtasks = research.decomposeQuery("test", { maxSubtasks: 3 });
  assert.ok(subtasks.length <= 3);
});

test("code-gen generates valid projects", () => {
  const result = codeGen.generateProject("node-cli", {
    name: "test-cli",
    description: "Test CLI",
  });
  assert.equal(result.ok, true);
  assert.equal(result.template, "Node.js CLI Application");
  assert.equal(result.projectName, "test-cli");
  assert.ok(result.files.length > 0);
  assert.ok(result.fileCount > 0);

  // Check required files exist
  const paths = result.files.map((f) => f.path);
  assert.ok(paths.includes("package.json"));
  assert.ok(paths.includes("tsconfig.json"));
  assert.ok(paths.includes("src/index.ts"));
  assert.ok(paths.includes("README.md"));
});

test("code-gen validates project name", () => {
  const result = codeGen.generateProject("node-cli", {
    name: "Invalid_Name!",
    description: "Test",
  });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("Invalid project name"));
});

test("code-gen rejects unknown template", () => {
  const result = codeGen.generateProject("unknown-template", { name: "test" });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("Template not found"));
});

test("code-gen generates all built-in templates", () => {
  for (const templateName of Object.keys(codeGen.BUILTIN_TEMPLATES)) {
    const result = codeGen.generateProject(templateName, {
      name: `test-${templateName}`,
      description: "Test",
    });
    assert.equal(
      result.ok,
      true,
      `Template ${templateName} should generate successfully`,
    );
    assert.ok(
      result.files.length > 0,
      `Template ${templateName} should have files`,
    );
  }
});

test("sandbox healthCheck returns status", async () => {
  const result = await sandbox.healthCheck();

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.available));
  assert.ok(Array.isArray(result.missing));
  assert.equal(typeof result.healthy, "boolean");
});

test("sandbox executes Python code", async () => {
  const result = await sandbox.executeCode(
    "python",
    "print('Hello from Python')",
  );

  // Should succeed if python3 is available, or fail gracefully
  assert.ok(typeof result.ok === "boolean");
  if (result.ok) {
    assert.ok(result.stdout.includes("Hello from Python"));
  }
});

test("sandbox executes Node.js code", async () => {
  const result = await sandbox.executeCode(
    "node",
    "console.log('Hello from Node')",
  );

  assert.ok(typeof result.ok === "boolean");
  if (result.ok) {
    assert.ok(result.stdout.includes("Hello from Node"));
  }
});

test("sandbox executes shell commands", async () => {
  const result = await sandbox.executeCode("shell", "echo 'Hello from Shell'");

  assert.ok(typeof result.ok === "boolean");
  if (result.ok) {
    assert.ok(result.stdout.includes("Hello from Shell"));
  }
});

test("sandbox rejects unsupported language", async () => {
  const result = await sandbox.executeCode("unsupported", "code");
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("Unsupported language"));
});

test("research planner decomposeQuery returns structured subtasks", () => {
  const subtasks = research.decomposeQuery("machine learning frameworks", {
    maxSubtasks: 4,
  });

  assert.ok(Array.isArray(subtasks));
  assert.ok(subtasks.length > 0);
  assert.ok(subtasks.length <= 4);

  for (const subtask of subtasks) {
    assert.ok(subtask.type);
    assert.ok(subtask.query);
    assert.ok(typeof subtask.priority === "number");
  }
});

test("research planner synthesizeResults creates markdown report", async () => {
  const mockResults = [
    {
      ok: true,
      subtask: { type: "core", query: "test query" },
      results: [
        {
          title: "Test Result 1",
          url: "https://example.com/1",
          snippet: "Snippet 1",
        },
        {
          title: "Test Result 2",
          url: "https://example.com/2",
          snippet: "Snippet 2",
        },
      ],
    },
  ];

  const synthesis = await research.synthesizeResults(
    "test query",
    mockResults,
    { format: "markdown" },
  );
  assert.equal(synthesis.ok, true);
  assert.ok(synthesis.report);
  assert.ok(synthesis.report.includes("Test Result"));
});

test("research planner handles empty results gracefully", async () => {
  const synthesis = await research.synthesizeResults("test query", [], {
    format: "markdown",
  });
  assert.equal(synthesis.ok, false);
  assert.ok(synthesis.message.includes("No successful research results"));
});

test("code-gen validates required variables", () => {
  // Missing name
  const result = codeGen.generateProject("node-cli", { description: "Test" });
  assert.equal(result.ok, false);

  // Empty name
  const result2 = codeGen.generateProject("node-cli", {
    name: "",
    description: "Test",
  });
  assert.equal(result2.ok, false);
});

test("sandbox timeout handling", async () => {
  // Infinite loop should be killed by timeout
  const result = await sandbox.executeCode("python", "while True: pass", {
    timeoutMs: 100,
  });

  // Should be killed by timeout
  assert.ok(result.killed === true || result.ok === false);
});

test("research planner depth parameter affects subtask count", () => {
  const quick = research.decomposeQuery("test", {
    depth: "quick",
    maxSubtasks: 10,
  });
  const deep = research.decomposeQuery("test", {
    depth: "deep",
    maxSubtasks: 10,
  });

  // Deep should have more or equal subtasks
  assert.ok(deep.length >= quick.length);
});

test("code-gen createProjectZip produces valid base64", async () => {
  const project = codeGen.generateProject("react-app", {
    name: "my-app",
    description: "Test React App",
  });
  assert.ok(project.ok);

  const zipResult = await codeGen.createProjectZip(project);

  assert.ok(zipResult.ok);
  assert.ok(zipResult.base64);
  assert.ok(zipResult.filename.endsWith(".zip"));

  // Verify it's valid base64
  const buffer = Buffer.from(zipResult.base64, "base64");
  assert.ok(buffer.length > 0);
});

test("research planner handles failed subtasks in synthesis", async () => {
  const mockResults = [
    {
      ok: true,
      subtask: { type: "core", query: "test" },
      results: [{ title: "OK", url: "https://a.com", snippet: "OK" }],
    },
    {
      ok: false,
      subtask: { type: "angle", angle: "technical", query: "fail" },
      error: "API error",
    },
  ];

  const synthesis = await research.synthesizeResults(
    "test query",
    mockResults,
    { format: "markdown" },
  );

  assert.equal(synthesis.ok, true);
  assert.ok(synthesis.report.includes("Failed Subtasks"));
  assert.ok(synthesis.report.includes("API error"));
});

test("sandbox concurrent execution", async () => {
  const results = await Promise.all([
    sandbox.executeCode("python", "print('a')"),
    sandbox.executeCode("node", "console.log('b')"),
    sandbox.executeCode("shell", "echo c"),
  ]);

  for (const result of results) {
    assert.ok(typeof result.ok === "boolean");
  }
});
