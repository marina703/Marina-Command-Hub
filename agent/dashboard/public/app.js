let currentConfig = {
  provider: "ollama",
  model: "qwen2.5:3b",
};

/* ──────────────────────────────────────────────
   CONFIG
   ────────────────────────────────────────────── */
async function fetchConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      currentConfig = {
        ...currentConfig,
        provider: data.provider,
        model: data.model,
        geminiModel: data.geminiModel,
        baseUrl: data.baseUrl,
        ollamaBaseUrl: data.ollamaBaseUrl,
        hasGeminiKey: data.hasGeminiKey,
      };
      updateModelUI();
    }
  } catch (err) {
    console.warn("Could not fetch config:", err);
  }
}

function updateModelUI() {
  const activeProvider = currentConfig.provider || "ollama";
  const activeModel = currentConfig.model || "";

  document.querySelectorAll("#modelList .model").forEach((btn) => {
    const p = btn.dataset.provider;
    const m = btn.dataset.model;
    if (p === activeProvider && (m === activeModel || !m)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const badge = document.getElementById("currentModelBadge");
  if (badge) {
    badge.textContent = `${activeProvider.toUpperCase()}: ${activeModel || "default"}`;
  }
}

async function setModelProvider(provider, model) {
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model }),
    });
    if (res.ok) {
      const data = await res.json();
      currentConfig = { ...currentConfig, ...data.config };
      updateModelUI();
      appendChatMessage(
        "system",
        `Switched active LLM provider to ${provider.toUpperCase()} (${model}). Project context will now route through this model.`,
      );
      await loadDashboard();
    }
  } catch (err) {
    appendChatMessage("system", `Failed to switch model: ${err.message}`);
  }
}

/* ──────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────── */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/[•\-\*]{2,}/g, "•");

  html = html.replace(/^### (.*$)/gim, '<div class="md-h3">$1</div>');
  html = html.replace(/^## (.*$)/gim, '<div class="md-h2">$1</div>');
  html = html.replace(/^# (.*$)/gim, '<div class="md-h1">$1</div>');
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/^(\d+)\.\s+(.*$)/gim, '<div class="md-list-item"><span class="md-num">$1.</span>$2</div>');
  html = html.replace(/^[•\-\*]\s+(.*$)/gim, '<div class="md-bullet"><span class="md-bullet-mark">•</span>$1</div>');
  html = html.replace(/\n\n/g, '<div class="md-paragraph"></div>');
  html = html.replace(/\n/g, "<br>");
  return html;
}

/* ──────────────────────────────────────────────
   LOADING OVERLAY
   ────────────────────────────────────────────── */
function showLoading(target, message) {
  const host = target || document.body;
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="loading-spinner" aria-hidden="true"></div>
    <span class="loading-text">${escapeHtml(message || "Loading…")}</span>
  `;
  host.appendChild(overlay);
  return overlay;
}

function hideLoading(target) {
  const host = target || document.body;
  const overlay = host.querySelector(".loading-overlay");
  if (overlay) overlay.remove();
}

/* ──────────────────────────────────────────────
   TOAST NOTIFICATIONS
   ────────────────────────────────────────────── */
function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${type === "success" ? "✅" : type === "error" ? "⚠️" : type === "warning" ? "⚠️" : "ℹ️"}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss notification">×</button>
  `;

  const close = () => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector(".toast-close").addEventListener("click", close);
  setTimeout(close, duration);

  container.appendChild(toast);
}

/* ──────────────────────────────────────────────
   DARK MODE
   ────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) {
    toggle.textContent = theme === "light" ? "☀️" : "🌙";
    toggle.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
}

function initTheme() {
  const saved = localStorage.getItem("marina_theme");
  const theme = saved === "light" ? "light" : "dark";
  applyTheme(theme);
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      localStorage.setItem("marina_theme", next);
      applyTheme(next);
      showToast(next === "light" ? "Light theme enabled" : "Dark theme enabled", "info", 2000);
    });
  }
}

/* ──────────────────────────────────────────────
   CHAT
   ────────────────────────────────────────────── */
function appendChatMessage(type, text) {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;

  const welcome = chatWindow.querySelector(".chat-welcome");
  if (welcome) {
    chatWindow.innerHTML = "";
  }

  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  bubble.innerHTML = formatMarkdown(text);
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

async function sendPrompt(messageText) {
  const input = document.getElementById("promptInput");
  const text = messageText || (input ? input.value.trim() : "");
  if (!text) return;
  if (input && !messageText) input.value = "";

  appendChatMessage("user", text);
  const loadingBubble = appendChatMessage("system", "Thinking & inspecting project context…");

  const autonomousCheckbox = document.getElementById("autonomousToggle");
  const autonomous = autonomousCheckbox ? autonomousCheckbox.checked : true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, autonomous }),
    });

    const data = await res.json();
    if (data.ok) {
      const formattedReply = formatMarkdown(data.reply || "Task processed.");
      loadingBubble.innerHTML = formattedReply;

      if (data.executed && data.executed.length) {
        const details = document.createElement("div");
        details.className = "executed-actions";
        details.innerHTML = data.executed
          .map((e) => `<div class="executed-item">✓ <strong>${escapeHtml(e.instruction.action)}</strong>: ${JSON.stringify(e.instruction.payload)}</div>`)
          .join("");
        loadingBubble.appendChild(details);
      }
      showToast("Task processed successfully", "success", 2500);
    } else {
      loadingBubble.innerHTML = `<span class="text-error">Error: ${escapeHtml(data.message || "Failed to process prompt.")}</span>`;
      showToast(data.message || "Failed to process prompt.", "error", 4000);
    }
  } catch (err) {
    loadingBubble.innerHTML = `<span class="text-error">Network error: ${escapeHtml(err.message)}</span>`;
    showToast(`Network error: ${err.message}`, "error", 4000);
  }

  await loadDashboard();
}

/* ──────────────────────────────────────────────
   DASHBOARD LOAD
   ────────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    const data = await response.json();

    const statsGrid = document.getElementById("statsGrid");
    const servicesGrid = document.getElementById("servicesGrid");
    const moduleList = document.getElementById("moduleList");
    const projectList = document.getElementById("projectList");
    const controlList = document.getElementById("controlList");
    const logList = document.getElementById("logList");
    const activeTaskList = document.getElementById("activeTaskList");
    const completedTaskList = document.getElementById("completedTaskList");
    const ideasGrid = document.getElementById("ideasGrid");
    const meetingsGrid = document.getElementById("meetingsGrid");

    updateQuickStats(data);
    renderCommandHubUpdates(data);

    /* ── System Metrics ── */
    if (statsGrid && data.system) {
      statsGrid.innerHTML = Object.entries(data.system)
        .map(([key, value]) => `
          <div class="metric-card">
            <div class="value ${key === "cpu" || key === "npu" ? "teal" : "pink"}">${value}%</div>
            <div class="label">${key.toUpperCase()}</div>
          </div>
        `)
        .join("");
    }

    /* ── Services ── */
    if (servicesGrid && data.services) {
      servicesGrid.innerHTML = data.services
        .map((service) => `
          <div class="service-card">
            <div class="service-header">
              <strong>${escapeHtml(service.name)}</strong>
              <span class="status-dot ${service.status === "healthy" || service.status === "online" ? "" : "alert"}"></span>
            </div>
            <small>${escapeHtml(service.details)}</small>
          </div>
        `)
        .join("");
    }

    /* ── Modules ── */
    if (moduleList && data.modules) {
      moduleList.innerHTML = data.modules
        .map((module) => `
          <div class="module-card">
            <div>
              <strong>${escapeHtml(module.name)}</strong>
              <small>${escapeHtml(module.type)}</small>
            </div>
            <span class="status-dot ${module.status === "ready" || module.status === "running" ? "" : "alert"}"></span>
          </div>
        `)
        .join("");
    }

    /* ── Projects ── */
    if (projectList && data.projects) {
      projectList.innerHTML = data.projects
        .map((project) => `
          <div class="project-card">
            <div>
              <strong>${escapeHtml(project.name)}</strong>
              <div class="meta">${escapeHtml(project.branch)} • ${escapeHtml(project.status)}</div>
            </div>
            <button class="project-action-btn" data-action="${escapeHtml(project.action)}" data-name="${escapeHtml(project.name)}">${escapeHtml(project.action)}</button>
          </div>
        `)
        .join("");

      document.querySelectorAll(".project-action-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const siteName = btn.dataset.name;
          if (siteName && siteName.includes(".")) {
            appendChatMessage("system", `Checking health and uptime monitor for ${siteName}…`);
            try {
              await fetch("/api/site/monitor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ site: siteName }),
              });
              await loadDashboard();
            } catch (err) {
              appendChatMessage("system", `Monitor check failed: ${err.message}`);
            }
          } else {
            sendPrompt(`Execute project action: ${btn.dataset.action}`);
          }
        });
      });
    }

    /* ── Active Tasks ── */
    if (activeTaskList) {
      const tasks = data.tasks || [];
      if (!tasks.length) {
        activeTaskList.innerHTML = `<li class="task-item-card"><small class="text-muted">No active tasks in queue.</small></li>`;
      } else {
        activeTaskList.innerHTML = tasks
          .slice(0, 8)
          .map((t) => `
            <li class="task-item-card">
              <div>
                <strong>${escapeHtml(t.title || t.message || "Task")}</strong>
                <small>${escapeHtml(t.owner || "AI Team")} • ${escapeHtml(t.priority || "Normal")} • ${escapeHtml(t.status || "active")}</small>
              </div>
              ${t.id ? `<button class="complete-task-btn" data-id="${t.id}">Complete</button>` : ""}
            </li>
          `)
          .join("");

        document.querySelectorAll(".complete-task-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const taskId = btn.dataset.id;
            try {
              await fetch("/api/tasks/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId }),
              });
              await loadDashboard();
            } catch (err) {
              appendChatMessage("system", `Could not complete task: ${err.message}`);
            }
          });
        });
      }
    }

    /* ── Completed Tasks ── */
    if (completedTaskList) {
      const history = data.completedHistory || [];
      if (!history.length) {
        completedTaskList.innerHTML = `<li class="task-item-card"><small class="text-muted">No completed tasks yet.</small></li>`;
      } else {
        completedTaskList.innerHTML = history
          .slice(0, 6)
          .map((h) => `
            <li class="task-item-card task-completed">
              <div>
                <strong>✓ ${escapeHtml(h.title)}</strong>
                <small>${escapeHtml(h.owner || "Team")} • ${new Date(h.completedAt).toLocaleTimeString()}</small>
              </div>
            </li>
          `)
          .join("");
      }
    }

    /* ── Ideas Grid ── */
    if (ideasGrid && data.brainstormIdeas) {
      ideasGrid.innerHTML = data.brainstormIdeas
        .slice(0, 6)
        .map((idea) => `
          <div class="idea-card">
            <div class="idea-card-header">
              <strong>${escapeHtml(idea.title)}</strong>
              <span class="chip">${escapeHtml(idea.category || "Growth")}</span>
            </div>
            <p>${escapeHtml(idea.description || "")}</p>
            <small>Lead: ${escapeHtml(idea.owner || "AI Team")}</small>
          </div>
        `)
        .join("");
    }

    /* ── AI Team Meetings & Summaries ── */
    if (meetingsGrid) {
      const meetings = data.meetingAgenda || [];
      const summaries = data.aiSummaries || [];

      let meetingsHtml, summariesHtml;

      if (meetings.length) {
        meetingsHtml = `
          <div class="meetings-column">
            <strong style="color: var(--teal);">Upcoming Team Agendas</strong>
            ${meetings.slice(0, 4).map((m) => `
              <div class="task-item-card">
                <div>
                  <strong>${escapeHtml(m.title)}</strong>
                  <small>${escapeHtml(m.time || "")} • ${escapeHtml(m.owner || "")}</small>
                  <div class="meeting-agenda">Agenda: ${(m.agenda || []).join(", ")}</div>
                </div>
              </div>
            `).join("")}
          </div>`;
      } else {
        meetingsHtml = `<small class="text-muted">No upcoming agendas.</small>`;
      }

      if (summaries.length) {
        summariesHtml = `
          <div class="meetings-column">
            <strong style="color: var(--pink);">Latest AI Briefs & Insights</strong>
            ${summaries.slice(0, 3).map((s) => `
              <div class="task-item-card task-summary">
                <strong>${escapeHtml(s.title)}</strong>
                <small>${escapeHtml(s.summary || "")}</small>
              </div>
            `).join("")}
          </div>`;
      } else {
        summariesHtml = `<small class="text-muted">No briefs generated yet.</small>`;
      }

      meetingsGrid.innerHTML = meetingsHtml + summariesHtml;
    }

    /* ── System Controls ── */
    if (controlList && data.systemControls) {
      controlList.innerHTML = data.systemControls
        .map((action) => `
          <div class="control-item">
            <span>${escapeHtml(action)}</span>
            <button class="control-run-btn" data-control="${escapeHtml(action)}">Run</button>
          </div>
        `)
        .join("");

      document.querySelectorAll(".control-run-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.control;
          if (action.includes("Clear temp")) {
            sendPrompt('run command: node -e "const fs = require(\'fs\'); fs.rmSync(\'tmp\', { recursive: true, force: true }); console.log(\'temp cleared\');"');
          } else if (action.includes("Restart")) {
            sendPrompt("run command: node smoke-test.js");
          } else {
            sendPrompt(`Execute system control action: ${action}`);
          }
        });
      });
    }

    /* ── Logs ── */
    if (logList && data.logs) {
      logList.innerHTML = data.logs.map((log) => `<li>${escapeHtml(log)}</li>`).join("");
    }
  } catch (err) {
    console.error("Failed to load dashboard state:", err);
  }
}

/* ── Sidebar Quick Stats (data-driven) ── */
function updateQuickStats(data) {
  // Prefer quickStats from server; fall back to computed values
  const quickStats = data.quickStats || [];

  const getStat = (label) => {
    const item = quickStats.find((s) => s.label === label);
    return item ? item.value : null;
  };

  const computed = {
    tasks: (data.tasks || []).length || getStat("Active Tasks"),
    calls: getStat("AI Calls"),
    deploys: getStat("Deployments"),
    alerts: (data.services || []).filter(
      (s) => s.status !== "healthy" && s.status !== "online",
    ).length,
  };

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== null && val !== undefined && val !== "" ? val : "—";
  };

  setEl("quick-active-tasks", computed.tasks);
  setEl("quick-ai-calls", computed.calls);
  setEl("quick-deployments", computed.deploys);
  setEl("quick-alerts", computed.alerts);
}

/* ── Command Hub Updates (playing-card module) ── */
function renderCommandHubUpdates(data) {
  const feed = document.getElementById("updatesFeed");
  if (!feed) return;

  const updates = data.commandHubUpdates || [];
  if (!updates.length) {
    feed.innerHTML = `<p class="text-muted">No updates yet.</p>`;
    return;
  }

  const icons = {
    tool: "🛠️",
    card: "🃏",
    widget: "🧩",
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
  };

  feed.innerHTML = updates
    .slice(0, 8)
    .map((u) => {
      const icon = icons[u.type] || icons.info;
      const cls = u.installed ? "installed" : "pending";
      const time = u.createdAt
        ? new Date(u.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      return `
        <div class="update-item ${cls}">
          <span class="update-icon">${icon}</span>
          <div class="update-body">
            <p class="update-title">${escapeHtml(u.title)}</p>
            ${u.description ? `<p class="update-desc">${escapeHtml(u.description)}</p>` : ""}
            ${time ? `<p class="update-time">${time}</p>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

/* ── Auto-update check: polls /api/ui/updates every 60s ── */
async function checkForAutoUpdates() {
  try {
    const res = await fetch("/api/ui/updates");
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok && data.installed && data.installed.length) {
      renderCommandHubUpdates({ commandHubUpdates: data.installed });
    }
  } catch (err) {
    // Silent — auto-update is best-effort
  }
}

/* ──────────────────────────────────────────────
   DOM READY
   ────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  /* ── Passcode / Login Authentication Gate ── */
  const loginGate = document.getElementById("loginGate");
  const appShell = document.getElementById("appShell");
  const loginForm = document.getElementById("loginForm");
  const passcodeInput = document.getElementById("passcodeInput");
  const loginError = document.getElementById("loginError");
  const lockBtn = document.getElementById("lockBtn");

  function unlockCockpit() {
    if (loginGate) loginGate.style.display = "none";
    if (appShell) appShell.style.display = "flex";
    localStorage.setItem("marina_unlocked", "true");
  }

  function lockCockpit() {
    if (appShell) appShell.style.display = "none";
    if (loginGate) loginGate.style.display = "grid";
    localStorage.removeItem("marina_unlocked");
    if (passcodeInput) {
      passcodeInput.value = "";
      passcodeInput.focus();
    }
  }

  if (localStorage.getItem("marina_unlocked") === "true") {
    unlockCockpit();
  } else {
    lockCockpit();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = passcodeInput ? passcodeInput.value.trim() : "";
      if (code.length >= 3) {
        unlockCockpit();
      } else {
        if (loginError) loginError.textContent = "Passcode must be at least 3 characters.";
      }
    });
  }

  if (lockBtn) {
    lockBtn.addEventListener("click", lockCockpit);
  }

  /* ── Theme (dark / light) ── */
  initTheme();

  /* ── Sidebar Navigation ── */
  document.querySelectorAll(".nav-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const view = tab.dataset.view;

      const viewMap = {
        dashboard: ".hero-panel",
        assistant: ".hero-panel",
        tasks: ".tasks-panel",
        projects: ".projects-panel",
        geminiSync: "#geminiSyncSection",
        models: ".sidebar-panel",
        system: ".stat-panel",
      };

      const target = document.querySelector(viewMap[view] || "header");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  /* ── Initialise ── */
  await fetchConfig();
  await loadDashboard();

  /* ── Send Prompt Button & Enter Key ── */
  const sendBtn = document.getElementById("sendPromptBtn");
  const promptInput = document.getElementById("promptInput");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      const loading = showLoading(document.body, 'Processing your request...');
      sendPrompt().finally(() => hideLoading(document.body));
    });
  }
  if (promptInput) {
    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const loading = showLoading(document.body, 'Processing your request...');
        sendPrompt().finally(() => hideLoading(document.body));
      }
    });
  }

  // Add character counter
  if (promptInput) {
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.textContent = '0/500';
    promptInput.parentNode.insertBefore(counter, promptInput.nextSibling);

    promptInput.addEventListener('input', () => {
      const count = promptInput.value.length;
      counter.textContent = `${count}/500`;
      if (count > 450) {
        counter.classList.add('warning');
      } else {
        counter.classList.remove('warning');
      }
    });
  }

  /* ── Quick Prompt Tools ── */
  const presetPrompts = {
    "💡 5 Execution Ideas":
      "Hey AI agents, I have this idea: [insert your idea here]. Give me 5 distinct execution strategies on how to make this happen, prioritized by speed and ROI.",
    "🗺️ 10 Business Proposals & Map":
      "Hey AI agents, here are the parameters: [insert parameters]. Give me 10 different business proposals and a step-by-step execution roadmap for ignitix.online and pyroprep.academy.",
    "🎯 Strategy Brief":
      "Summarize the current project architecture, active tasks, and Next.js / Supabase stack readiness.",
    "🛠️ Generate Code/File":
      "create file tmp/execution-roadmap.md",
    "📊 Audit Sites (Ignitix & PyroPrep)":
      "Audit the performance, SEO, and integration points for ignitix.online and pyroprep.academy and propose the next 3 priority upgrades.",
  };

  document.querySelectorAll(".prompt-tools button").forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.textContent.trim();
      const promptText = presetPrompts[label];
      if (!promptText) return;

      if (label.includes("5 Execution Ideas") || label.includes("10 Business Proposals")) {
        const input = document.getElementById("promptInput");
        if (input) {
          input.value = promptText;
          input.focus();
          const start = label.includes("5 Execution") ? 27 : 36;
          const end = label.includes("5 Execution") ? 51 : 57;
          input.setSelectionRange(start, end);
          return;
        }
      }

      sendPrompt(promptText);
    });
  });

  /* ── Command Hub Quick Actions ── */
  const commandPrompts = {
    marketing:
      "Create a comprehensive marketing campaign brief for ignitix.online and pyroprep.academy. Include target audience, channels, budget allocation, and success metrics.",
    seo:
      "Generate an SEO content plan for ignitix.online and pyroprep.academy. Include keyword clusters, content calendar, and on-page optimization checklist.",
    brand:
      "Draft a brand voice and positioning statement for ignitix.online and pyroprep.academy. Include tone guidelines, messaging pillars, and differentiation strategy.",
    logo:
      "Generate logo and visual direction concepts for ignitix.online and pyroprep.academy. Include color palette, typography, and brand asset recommendations.",
    social:
      "Create a 30-day social media content calendar for ignitix.online and pyroprep.academy. Include platform-specific post ideas and engagement strategies.",
    video:
      "Outline a video script strategy for ignitix.online and pyroprep.academy. Include video topics, formats, and distribution plan.",
    report:
      "Generate a weekly performance report template for ignitix.online and pyroprep.academy. Include KPIs, traffic analysis, conversion metrics, and recommendations.",
    audit:
      "Run a full site health audit for ignitix.online and pyroprep.academy. Check performance, SEO, accessibility, and integration points. Propose priority fixes.",
  };

  document.querySelectorAll(".command-button").forEach((button) => {
    button.addEventListener("click", () => {
      const command = button.dataset.command;
      const promptText = commandPrompts[command];
      if (!promptText) return;
      showToast(`Running ${button.textContent.trim()}…`, "info", 2500);
      sendPrompt(promptText);
    });
  });

  /* ── Playbook Runner ── */
  const runPlaybookBtn = document.getElementById("runPlaybookBtn");
  const playbookSelect = document.getElementById("playbookSelect");
  if (runPlaybookBtn && playbookSelect) {
    runPlaybookBtn.addEventListener("click", async () => {
      const selected = playbookSelect.value;
      const customPrompt = document.getElementById("promptInput")
        ? document.getElementById("promptInput").value.trim()
        : "";

      runPlaybookBtn.textContent = "Executing Sub-Agents…";
      appendChatMessage(
        "system",
        `⚡ Executing Playbook: [${selected.toUpperCase()}] with Role-Based Sub-Agents (Ava + Maya + Niko)…`,
      );

      try {
        const res = await fetch("/api/playbooks/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playbook: selected, prompt: customPrompt }),
        });
        const data = await res.json();
        if (data.ok) {
          appendChatMessage(
            "system",
            `✅ Playbook "${data.playbook}" Complete!
${data.summary || ""}
${data.roadmapFile ? `• File: ${data.roadmapFile}` : ""}
${data.tasksCreated ? `• New Tasks: ${data.tasksCreated.join(", ")}` : ""}`,
          );
          await loadDashboard();
        } else {
          appendChatMessage("system", `Playbook error: ${data.message}`);
        }
      } catch (err) {
        appendChatMessage("system", `Network error: ${err.message}`);
      } finally {
        runPlaybookBtn.textContent = "Run Playbook";
      }
    });
  }

  /* ── Voice Dictation ── */
  const voiceMicBtn = document.getElementById("voiceMicBtn");
  if (voiceMicBtn) {
    voiceMicBtn.addEventListener("click", async () => {
      const simulatedSpoken = prompt(
        "🎙️ MarinaAI Voice Dictation (or write to voice.txt):\nPrefix with 'idea:' or 'task:' or general prompt:",
        "idea: Automated YouTube Shorts to Blog Post Repurposer",
      );
      if (!simulatedSpoken) return;

      voiceMicBtn.textContent = "Processing…";
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: simulatedSpoken }),
        });
        const data = await res.json();
        if (data.ok) {
          appendChatMessage("system", `🎙️ Voice Input Received & Processed: "${simulatedSpoken}"`);
          await loadDashboard();
        }
      } catch (err) {
        appendChatMessage("system", `Voice error: ${err.message}`);
      } finally {
        voiceMicBtn.textContent = "🎙️ Dictate";
      }
    });
  }

  /* ── Model Selection ── */
  document.querySelectorAll("#modelList .model").forEach((btn) => {
    btn.addEventListener("click", () => {
      setModelProvider(btn.dataset.provider, btn.dataset.model);
    });
  });

  /* ── Workspace Context Scanner ── */
  const scanBtn = document.getElementById("scanContextBtn");
  if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
      scanBtn.textContent = "Scanning…";
      try {
        const res = await fetch("/api/project/scan");
        const data = await res.json();
        if (data.ok) {
          appendChatMessage(
            "system",
            `Workspace Scan Complete! Found ${data.count} project context files (Cline rules, Next.js configs, Agent modules). Ready for autonomous execution.`,
          );
          await loadDashboard();
        }
      } catch (err) {
        appendChatMessage("system", `Scan failed: ${err.message}`);
      } finally {
        scanBtn.textContent = "Scan Workspace Context";
      }
    });
  }

  /* ── Quick Task Form ── */
  const quickTaskForm = document.getElementById("quickTaskForm");
  if (quickTaskForm) {
    quickTaskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("newTaskTitle");
      const title = input.value.trim();
      if (!title) return;

      try {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            owner: "Operator",
            priority: "High",
            status: "queued",
            progress: 10,
          }),
        });
        input.value = "";
        await loadDashboard();
      } catch (err) {
        appendChatMessage("system", `Could not create task: ${err.message}`);
      }
    });
  }

  /* ── Quick Idea Form ── */
  const quickIdeaForm = document.getElementById("quickIdeaForm");
  if (quickIdeaForm) {
    quickIdeaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("newIdeaTitle");
      const title = input.value.trim();
      if (!title) return;

      try {
        await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            category: "Growth",
            owner: "Strategist",
            description: "New revenue stream brainstormed via Command Center.",
          }),
        });
        input.value = "";
        await loadDashboard();
      } catch (err) {
        appendChatMessage("system", `Could not save idea: ${err.message}`);
      }
    });
  }

  /* ── AI Team Meeting Sync ── */
  const syncMeetingBtn = document.getElementById("triggerMeetingSyncBtn");
  if (syncMeetingBtn) {
    syncMeetingBtn.addEventListener("click", async () => {
      syncMeetingBtn.textContent = "Syncing AI Team…";
      try {
        await fetch("/api/summary", { method: "POST" });
        appendChatMessage(
          "system",
          "AI Team sync complete. Operations summaries, milestone reviews, and agent tasks synchronized across the Command Center.",
        );
        await loadDashboard();
      } catch (err) {
        appendChatMessage("system", `Team sync failed: ${err.message}`);
      } finally {
        syncMeetingBtn.textContent = "⚡ Run AI Team Sync";
      }
    });
  }

  /* ── Save Gemini API Key ── */
  const saveKeyBtn = document.getElementById("saveApiKeyBtn");
  const keyInput = document.getElementById("geminiApiKeyInput");
  if (saveKeyBtn && keyInput) {
    saveKeyBtn.addEventListener("click", async () => {
      const apiKey = keyInput.value.trim();
      if (!apiKey) return;

      saveKeyBtn.textContent = "…";
      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            provider: "gemini",
            model: "gemini-1.5-flash",
          }),
        });
        keyInput.value = "";
        appendChatMessage("system", "Google Gemini API key saved. Switched active model to Gemini 1.5 Flash.");
        await fetchConfig();
      } catch (err) {
        appendChatMessage("system", `Failed to save API key: ${err.message}`);
      } finally {
        saveKeyBtn.textContent = "Saved";
        setTimeout(() => (saveKeyBtn.textContent = "Save"), 2000);
      }
    });
  }

  /* ── Gemini History Import ── */
  const importGeminiBtn = document.getElementById("importGeminiHistoryBtn");
  const geminiHistoryInput = document.getElementById("geminiHistoryInput");
  if (importGeminiBtn && geminiHistoryInput) {
    importGeminiBtn.addEventListener("click", async () => {
      const text = geminiHistoryInput.value.trim();
      if (!text) return;

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const items = lines.map((line) => {
        if (/^(idea|brainstorm|stream):/i.test(line)) {
          return {
            type: "idea",
            title: line.replace(/^(idea|brainstorm|stream):\s*/i, ""),
            category: "Growth",
          };
        }
        return {
          type: "task",
          title: line.replace(/^(task|todo|code prompt):\s*/i, ""),
          priority: "High",
        };
      });

      importGeminiBtn.textContent = "Importing…";
      try {
        const res = await fetch("/api/gemini/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chats: items }),
        });
        const data = await res.json();
        if (data.ok) {
          appendChatMessage(
            "system",
            `✅ Imported ${data.count} Gemini discussions & prompts into your Task Hub and Ideation Board.`,
          );
          geminiHistoryInput.value = "";
          await loadDashboard();
        }
      } catch (err) {
        appendChatMessage("system", `Import failed: ${err.message}`);
      } finally {
        importGeminiBtn.textContent = "📥 Import Gemini Context to Tasks & Streams";
      }
    });
  }

  /* ── Sliders ── */
  const tempSlider = document.getElementById("tempSlider");
  const tempVal = document.getElementById("tempVal");
  if (tempSlider && tempVal) {
    tempSlider.addEventListener("input", (e) => {
      tempVal.textContent = (e.target.value / 100).toFixed(2);
    });
  }

  const tokensSlider = document.getElementById("tokensSlider");
  const tokensVal = document.getElementById("tokensVal");
  if (tokensSlider && tokensVal) {
    tokensSlider.addEventListener("input", (e) => {
      tokensVal.textContent = e.target.value;
    });
  }

  /* ── Topbar Run All Button ── */
  document.querySelector(".topbar-actions .primary")?.addEventListener("click", () => {
    sendPrompt("Run health check and execute any pending autonomous tasks.");
  });

  /* ── Command Hub Updates: Check button ── */
  const checkUpdatesBtn = document.getElementById("checkUpdatesBtn");
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener("click", async () => {
      checkUpdatesBtn.textContent = "Checking…";
      try {
        const res = await fetch("/api/ui/updates");
        const data = await res.json();
        if (data.ok) {
          renderCommandHubUpdates({ commandHubUpdates: data.installed });
          if (data.installed && data.installed.length) {
            appendChatMessage("system", `🔄 Command Hub checked for updates. ${data.installed.length} update(s) available.`);
          } else {
            appendChatMessage("system", "✅ Command Hub is up to date.");
          }
        }
      } catch (err) {
        appendChatMessage("system", `Update check failed: ${err.message}`);
      } finally {
        checkUpdatesBtn.textContent = "🔄 Check";
      }
    });
  }

  /* ── Auto-refresh every 15 seconds ── */
  setInterval(loadDashboard, 15000);

  /* ── Auto-update check every 60 seconds ── */
  setInterval(checkForAutoUpdates, 60000);
});
