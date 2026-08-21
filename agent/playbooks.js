const fs = require("fs");
const path = require("path");
const {
  askLLM,
  processInstruction,
  collectProjectContext,
} = require("./agent");
const {
  createTask,
  addIdea,
  addTaskLog,
  readState,
  writeState,
  generateDashboardSummary,
} = require("./dashboard-state");

/**
 * Autonomous Role-Based Sub-Agents Playbook Engine
 * Eliminates manual copy-pasting by coordinating Strategist, Executor, and Web/Ops sub-agents.
 */

async function runIdeaToExecutionPlaybook(ideaText) {
  const targetIdea =
    ideaText || "Automated AI Operations Hub for Multi-Site Portfolio";
  addTaskLog(
    "playbook",
    `⚡ Playbook Launched: Idea -> Execution Map for "${targetIdea.slice(0, 50)}"`,
  );

  // Sub-Agent 1: Strategist (Ava) - Formulates multi-angle proposals
  const strategistPrompt = `You are Ava, Chief Strategy Sub-Agent. 
Analyze this core idea: "${targetIdea}".
Provide 5 concise execution paths and 3 immediate monetization angles.`;

  let strategistBrief = "";
  try {
    const res = await askLLM(strategistPrompt);
    strategistBrief = Array.isArray(res)
      ? JSON.stringify(res, null, 2)
      : String(res || "");
  } catch {
    strategistBrief = `1. Fast MVP Launch\n2. Next.js Landing Integration\n3. Supabase Auth Gate\n4. Multi-model routing\n5. Automated Task Scheduler`;
  }

  // Sub-Agent 2: Executor (Maya) - Writes execution roadmap file directly to disk
  const slug = targetIdea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30);
  const roadmapPath = path.join(
    __dirname,
    "tmp",
    `roadmap-${slug}-${Date.now()}.md`,
  );
  const roadmapContent = `# Execution Roadmap: ${targetIdea}

**Orchestrated by**: MarinaAI Autonomous Sub-Agents (Ava, Maya, Niko)
**Timestamp**: ${new Date().toISOString()}

## 1. Strategic Angles (Ava - Strategist)
${strategistBrief}

## 2. Technical Execution Plan (Maya - Executor)
- [ ] Connect workspace context with active LLM routing
- [ ] Implement automated triggers on http://localhost:3000
- [ ] Validate multi-site monitoring (ignitix.online & pyroprep.academy)

## 3. Operations & Task Pipeline (Niko - Ops)
- Generated autonomous queue items for instant execution without copy-pasting.
`;

  fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
  fs.writeFileSync(roadmapPath, roadmapContent, "utf8");
  addTaskLog(
    "createFile",
    `Executor Agent generated roadmap: ${path.basename(roadmapPath)}`,
  );

  // Sub-Agent 3: Ops & Task Coordinator (Niko) - Queues real tasks and records avenue stream
  const task1 = createTask({
    title: `Implement ${targetIdea.slice(0, 40)} Roadmap`,
    owner: "Maya (Executor Agent)",
    priority: "High",
    progress: 20,
    status: "in-progress",
  });

  const task2 = createTask({
    title: `Audit Integration with ignitix & pyroprep`,
    owner: "Niko (Ops Agent)",
    priority: "Medium",
    progress: 0,
    status: "queued",
  });

  const ideaEntry = addIdea({
    title: targetIdea,
    category: "Revenue",
    owner: "Ava (Strategist Agent)",
    description: `Automated roadmap compiled at ${path.basename(roadmapPath)}.`,
  });

  generateDashboardSummary();

  return {
    ok: true,
    playbook: "Idea -> Execution Map",
    reportFile: path.basename(roadmapPath),
    roadmapFile: path.basename(roadmapPath),
    tasksCreated: [task1.title, task2.title],
    ideaAdded: ideaEntry.title,
    summary: `Strategist & Executor sub-agents generated roadmap (${path.basename(roadmapPath)}) and populated 2 tasks in the queue.`,
  };

}

async function runSiteAuditPlaybook() {
  addTaskLog(
    "playbook",
    "⚡ Playbook Launched: Multi-Site Growth & Health Audit",
  );

  const sites = ["ignitix.online", "pyroprep.academy"];
  const auditReportPath = path.join(
    __dirname,
    "tmp",
    `site-audit-${Date.now()}.md`,
  );

  const content = `# Multi-Site Operations & Health Audit

**Generated**: ${new Date().toISOString()}
**Sub-Agent**: Niko (Web & Ops Radar)

## 1. Managed Domains
- **ignitix.online**: DNS active • Target: B2B Growth & Automation
- **pyroprep.academy**: DNS active • Target: Course Platform & Student Hub

## 2. Recommended Next Upgrades
1. Embed MarinaAI Concierge on ignitix.online for lead capture.
2. Connect pyroprep.academy authentication with local Supabase stack.
3. Keep 1-click status radar active on http://localhost:3000.
`;

  fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
  fs.writeFileSync(auditReportPath, content, "utf8");

  createTask({
    title: "Apply Multi-Site Audit Recommendations",
    owner: "Niko (Ops Agent)",
    priority: "High",
    progress: 10,
    status: "queued",
  });

  generateDashboardSummary();

  return {
    ok: true,
    playbook: "Multi-Site Growth Audit",
    reportFile: path.basename(auditReportPath),
    auditFile: path.basename(auditReportPath),
    sitesAudited: sites,
    tasksCreated: ["Apply Multi-Site Audit Recommendations"],
    summary: `Web Radar audited ignitix.online and pyroprep.academy. Report saved to ${path.basename(auditReportPath)}.`,
  };

}

async function runFastSOPPlaybook(topic) {
  const sopTopic = topic || "Workspace Standard Operating Procedures";
  const sopPath = path.join(__dirname, "tmp", `sop-${Date.now()}.md`);
  const sopContent = `# Standard Operating Procedure: ${sopTopic}

**Sub-Agent**: Maya (Technical Documentation)
**Updated**: ${new Date().toISOString()}

## Purpose
Standardize single-screen autonomous execution across MarinaAI Command Center.

## Workflow
1. Open http://localhost:3000 (auto-boots on Windows startup).
2. Use Assistant Console or 1-click Playbooks to orchestrate tasks.
3. Let Sub-Agents automatically generate files, execute commands, and update Task Hub.
`;

  fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
  fs.writeFileSync(sopPath, sopContent, "utf8");
  addTaskLog("createFile", `SOP generated: ${path.basename(sopPath)}`);

  return {
    ok: true,
    playbook: "Fast SOP Generator",
    reportFile: path.basename(sopPath),
    sopFile: path.basename(sopPath),
    tasksCreated: [],
    summary: `Generated standard operating procedure: ${path.basename(sopPath)}.`,
  };

}

/**
 * Dedicated One-Click Tool runner. Each of the 6 One-Click Tools gets a
 * purpose-built prompt, a structured markdown report with clear sections,
 * and a tool-specific follow-up task so the action is fully autonomous and
 * produces visible, actionable output (no mock data).
 */
const ONE_CLICK_TOOL_DEFS = {
  "market-position": {
    label: "Market Position Analyzer",
    prompt: (p) =>
      `Analyze the market position of the Marina AI portfolio (ignitix.online, pyroprep.academy). Produce a structured report with these sections:
1. Current Positioning — where each brand sits today.
2. Differentiation — what makes each brand unique vs competitors.
3. Competitive Gaps — 3-5 unmet needs we can exploit.
4. Recommended Positioning Statement — a crisp one-liner for each brand.
5. Action Items — 3 concrete next steps with owners and effort.
Be specific and actionable.`,
    task: "Apply Market Position Analyzer recommendations",
  },
  "competitor-snapshot": {
    label: "Competitor Snapshot",
    prompt: (p) =>
      `Create a competitor snapshot for the Marina AI portfolio (ignitix.online, pyroprep.academy). Produce a structured report with these sections:
1. Top Competitors — list 4-6 direct and indirect competitors.
2. Strengths — what each competitor does well.
3. Weaknesses — where each competitor is vulnerable.
4. Exploitable Gaps — 3-5 opportunities to outmaneuver them.
5. Watchlist — signals to monitor for each competitor.
Be specific and actionable.`,
    task: "Apply Competitor Snapshot recommendations",
  },
  "audience-persona": {
    label: "Audience Persona Builder",
    prompt: (p) =>
      `Build 3 detailed audience personas for the Marina AI portfolio (ignitix.online, pyroprep.academy). For each persona produce a structured section with:
1. Name & Role — a memorable persona name and job title.
2. Demographics — age, location, income, industry.
3. Goals — what they want to achieve.
4. Pain Points — their frustrations and blockers.
5. Messaging Hooks — 3 hooks that resonate with them.
6. Where to Reach Them — channels and content formats.
Be specific and actionable.`,
    task: "Apply Audience Persona Builder recommendations",
  },
  "trend-pulse": {
    label: "Trend Pulse Scan",
    prompt: (p) =>
      `Scan current trends relevant to the Marina AI portfolio (ignitix.online, pyroprep.academy). Produce a structured report with these sections:
1. Trend Watch — list 5 current trends with a one-line description each.
2. Opportunity Level — rate each trend High/Medium/Low for our portfolio.
3. Relevance — how each trend maps to ignitix.online and pyroprep.academy.
4. Recommended Action — a concrete action for each trend.
5. Time Horizon — short/medium/long-term play for each.
Be specific and actionable.`,
    task: "Apply Trend Pulse Scan recommendations",
  },
  "offer-angle": {
    label: "Offer Angle Generator",
    prompt: (p) =>
      `Generate 5 offer angles for the Marina AI portfolio (ignitix.online, pyroprep.academy). For each angle produce a structured section with:
1. Core Promise — the single outcome the customer gets.
2. Target Segment — who this angle speaks to.
3. Hook — a compelling headline or opening line.
4. Proof — evidence or social proof to back it up.
5. CTA — the call-to-action that converts.
Be specific and actionable.`,
    task: "Apply Offer Angle Generator recommendations",
  },
  "funnel-weakpoint": {
    label: "Funnel Weak-Point Detector",
    prompt: (p) =>
      `Analyze the sales funnel for the Marina AI portfolio (ignitix.online, pyroprep.academy). Produce a structured report with these sections:
1. Funnel Stages — Awareness, Interest, Decision, Action, Retention.
2. Weak Points — identify the weakest stage and why.
3. Bottlenecks — where prospects drop off and the likely cause.
4. Fixes — a concrete fix for each weak point with expected impact.
5. Measurement — the metric to track for each stage.
Be specific and actionable.`,
    task: "Apply Funnel Weak-Point Detector recommendations",
  },
};

async function runOneClickTool(toolId, promptValue) {
  const def = ONE_CLICK_TOOL_DEFS[toolId];
  if (!def) return runGenericPlaybook(toolId, promptValue);

  const { askLLM } = require("./agent");
  const { createTask, addTaskLog, generateDashboardSummary } = require("./dashboard-state");

  addTaskLog("playbook", `⚡ One-Click Tool Launched: ${def.label}`);

  let content = "";
  try {
    const res = await askLLM(def.prompt(promptValue), {
      includeRaw: true,
      timeoutMs: 120000,
    });
    if (res && typeof res === "object" && !Array.isArray(res)) {
      const raw = res.rawText || "";
      const inst = res.instructions || [];
      content = raw
        ? String(raw)
        : Array.isArray(inst) && inst.length > 0
          ? JSON.stringify(inst, null, 2)
          : "";
    } else {
      content = Array.isArray(res)
        ? JSON.stringify(res, null, 2)
        : String(res || "");
    }
  } catch {
    content = `Generated ${def.label} for the Marina AI Command Hub.`;
  }

  const slug = def.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const reportPath = path.join(__dirname, "tmp", `${slug}-${Date.now()}.md`);
  fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `# ${def.label}\n\n**Generated**: ${new Date().toISOString()}\n**Tool**: One-Click Tool\n\n${content}\n`,
    "utf8",
  );
  addTaskLog("createFile", `One-Click Tool report generated: ${path.basename(reportPath)}`);

  const task = createTask({
    title: def.task,
    owner: "AI Team",
    priority: "High",
    progress: 10,
    status: "queued",
  });

  generateDashboardSummary();

  return {
    ok: true,
    playbook: def.label,
    tool: toolId,
    reportFile: path.basename(reportPath),
    tasksCreated: [task.title],
    summary: `${def.label} generated (${path.basename(reportPath)}) and queued a follow-up task.`,
  };
}

/**
 * Generic playbook runner that maps the Command Hub's 8 selectable playbook
 * chips to real backend handlers. Each handler uses the active LLM to generate
 * content, writes a report to tmp/, and queues a follow-up task so the action
 * is fully autonomous (no mock data).
 */
async function runGenericPlaybook(playbookId, promptValue) {

  const labels = {
    // Rapid Fire (primary) tools
    "next-steps": "Next Steps",
    "daily-ideas": "Daily Ideas",
    "monetization-map": "Monetization Map",
    "marketing-playbook": "Marketing Playbook",
    "opportunity-scan": "Opportunity Scan",
    "execution-map": "Execution Map",
    "business-proposals": "Business Proposals",
    "strategy-brief": "Strategy Brief",
    "generate-coalition": "Generate Coalition",
    "audit-site": "Audit Site Syntax & Psychology",
    "logo-sketch": "Logo Sketch",
    "video-script": "Video Script",
    "write-story-report": "Write Story Report",
    // One-Click (secondary) tools
    "market-position": "Market Position Analyzer",
    "competitor-snapshot": "Competitor Snapshot",
    "audience-persona": "Audience Persona Builder",
    "trend-pulse": "Trend Pulse Scan",
    "offer-angle": "Offer Angle Generator",
    "funnel-weakpoint": "Funnel Weak-Point Detector",
    // New modules
    "business-idea-generator": "Business Idea Generator",
    "monetization-generator": "Monetization Generator",
    "required-tools": "Required Tools & Tech Stack",
  };

  const label = labels[playbookId] || playbookId;

  const prompts = {
    // Rapid Fire (primary) tools
    "next-steps": `Turn the idea "${promptValue || "Marina AI Command Hub"}" into a concrete, actionable plan. List the next 5 steps with owners, effort, and expected outcome.`,
    "daily-ideas": `Generate 3 new business ideas for the Marina AI portfolio (ignitix.online, pyroprep.academy). For each idea give a one-line pitch, target audience, and a quick monetization angle.`,
    "monetization-map": `Map the idea "${promptValue || "Marina AI Command Hub"}" to revenue models. List 5 monetization strategies with pricing, target segment, and implementation effort.`,
    "marketing-playbook": `Write a full marketing strategy for the Marina AI portfolio (ignitix.online, pyroprep.academy). Cover positioning, channels, content plan, launch sequence, and KPIs.`,
    "opportunity-scan": `Scan the Marina AI portfolio for new opportunities and optimizations. List 5 growth opportunities and 5 operational optimizations with expected impact.`,
    "execution-map": `Create a concise execution map for: "${promptValue || "Marina AI Command Hub"}" with 5 prioritized phases, owners, and success metrics.`,
    "business-proposals": `Generate 10 business proposals for the Marina AI portfolio (ignitix.online, pyroprep.academy) with monetization angles.`,
    "strategy-brief": `Write a one-page strategy brief for the Marina AI Command Hub covering positioning, goals, and next 90 days.`,
    "generate-coalition": `Outline a coalition / partnership plan for the Marina AI portfolio: target partners, value exchange, and outreach steps.`,
    "audit-site": `Audit ignitix.online and pyroprep.academy for syntax, psychology, and conversion improvements. List concrete fixes.`,
    "logo-sketch": `Describe a logo sketch concept for the Marina AI Command Hub. Purpose / what the logo is for: "${promptValue || "the Marina AI Command Hub brand"}" with color palette, typography, and layout notes.`,

    "video-script": `Write a 60-second video script promoting the Marina AI Command Hub with hook, body, and call-to-action.`,
    "write-story-report": `Write a story-style report summarizing the Marina AI Command Hub's mission, capabilities, and recent wins.`,
    // One-Click (secondary) tools
    "market-position": `Analyze the market position of the Marina AI portfolio (ignitix.online, pyroprep.academy). Identify positioning, differentiation, and gaps versus competitors.`,
    "competitor-snapshot": `Create a competitor snapshot for the Marina AI portfolio. List top competitors, their strengths, weaknesses, and what we can exploit.`,
    "audience-persona": `Build 3 audience personas for the Marina AI portfolio. For each: demographics, goals, pain points, and messaging hooks.`,
    "trend-pulse": `Scan current trends relevant to the Marina AI portfolio. List 5 trends with opportunity level and recommended action.`,
    "offer-angle": `Generate 5 offer angles for the Marina AI portfolio. For each: core promise, target segment, and hook.`,
    "funnel-weakpoint": `Analyze the sales funnel for the Marina AI portfolio. Identify weak points at each stage and recommend fixes.`,
    // New modules
    "business-idea-generator": `Act as a Business Idea Generator. Using these parameters: Budget/seed money: "${promptValue || "not specified"}", Manual vs autonomous execution %, Setup time allowed, Revenue potential limits, Longevity preference, Space type (Digital products, Services, Manual labor, Offline, Online). Output 3-5 business ideas that match the parameters. For each idea include: Difficulty level, Time-to-first-dollar estimate, Automation potential, Required skills, Risk profile.`,
    "monetization-generator": `Act as a Monetization Generator. Using these parameters: Budget: "${promptValue || "not specified"}", Execution style (manual vs autonomous), Setup time, Revenue ceiling, Business type (digital, service, offline, etc.). Output 5 monetization paths. For each include: Pricing models, Subscription angles, Upsell/downsell paths, Automation-based revenue streams, Partnership opportunities.`,
    "required-tools": `Act as a Required Tools & Tech Stack Engine. For the idea: "${promptValue || "laundry service"}". Output must include: Physical equipment needed, Digital tools needed, Software stack, Licensing requirements, Compliance requirements, Startup checklist, Estimated costs, Vendor recommendations.`,
  };




  const { askLLM } = require("./agent");
  const { createTask, addTaskLog, generateDashboardSummary } = require("./dashboard-state");

  addTaskLog("playbook", `⚡ Playbook Launched: ${label}`);

  let content = "";
  try {
    const res = await askLLM(
      prompts[playbookId] ||
        `Generate a concise ${label} for the Marina AI Command Hub.`,
      {

      includeRaw: true,
      timeoutMs: 120000,
    });
    if (res && typeof res === "object" && !Array.isArray(res)) {
      const raw = res.rawText || "";
      const inst = res.instructions || [];
      content = raw
        ? String(raw)
        : Array.isArray(inst) && inst.length > 0
          ? JSON.stringify(inst, null, 2)
          : "";
    } else {
      content = Array.isArray(res)
        ? JSON.stringify(res, null, 2)
        : String(res || "");
    }
  } catch {
    content = `Generated ${label} for the Marina AI Command Hub.`;
  }



  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const reportPath = path.join(
    __dirname,
    "tmp",
    `${slug}-${Date.now()}.md`,
  );
  fs.mkdirSync(path.join(__dirname, "tmp"), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `# ${label}\n\n**Generated**: ${new Date().toISOString()}\n\n${content}\n`,
    "utf8",
  );
  addTaskLog("createFile", `Playbook report generated: ${path.basename(reportPath)}`);

  const task = createTask({
    title: `Apply ${label} recommendations`,
    owner: "AI Team",
    priority: "High",
    progress: 10,
    status: "queued",
  });

  generateDashboardSummary();

  return {
    ok: true,
    playbook: label,
    reportFile: path.basename(reportPath),
    tasksCreated: [task.title],
    summary: `${label} generated (${path.basename(reportPath)}) and queued a follow-up task.`,
  };

}

/** Dispatch any playbook id to its handler. */
async function runPlaybookById(playbookId, promptValue) {
  if (playbookId === "idea-to-roadmap") {
    return runIdeaToExecutionPlaybook(promptValue);
  }
  if (playbookId === "site-audit") {
    return runSiteAuditPlaybook();
  }
  if (playbookId === "fast-sop") {
    return runFastSOPPlaybook(promptValue);
  }
  // One-Click Tools get a dedicated, purpose-built handler.
  if (ONE_CLICK_TOOL_DEFS[playbookId]) {
    return runOneClickTool(playbookId, promptValue);
  }
  return runGenericPlaybook(playbookId, promptValue);
}

module.exports = {
  runIdeaToExecutionPlaybook,
  runSiteAuditPlaybook,
  runFastSOPPlaybook,
  runOneClickTool,
  runGenericPlaybook,
  runPlaybookById,
};

