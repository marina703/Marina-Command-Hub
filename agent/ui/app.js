function setDetailView({ title, badge, body, meta = [], list = [] }) {
  const detailView = document.getElementById("detailView");
  if (!detailView) return;

  detailView.innerHTML = `
    <div class="detail-badge">${badge}</div>
    <h3>${title}</h3>
    <div class="detail-meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>
    <p>${body}</p>
    ${list.length ? `<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
  `;
}

function createDropdownMenu(items, parentId) {
  const dropdownContainer = document.createElement("div");
  dropdownContainer.className = "dropdown-container";

  const dropdownButton = document.createElement("button");
  dropdownButton.className = "dropdown-button";
  dropdownButton.textContent = "Generate...";
  dropdownButton.title = "Select a generation option";

  const dropdownMenu = document.createElement("div");
  dropdownMenu.className = "dropdown-menu";

  items.forEach((item) => {
    const menuItem = document.createElement("div");
    menuItem.className = "dropdown-item";
    menuItem.textContent = item.label;
    menuItem.title = item.tooltip;
    menuItem.addEventListener("click", () => {
      triggerAction(item.action, item.payload);
      dropdownMenu.style.display = "none";
    });
    dropdownMenu.appendChild(menuItem);
  });

  dropdownButton.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.style.display = dropdownMenu.style.display === "block" ? "none" : "block";
  });

  dropdownContainer.appendChild(dropdownButton);
  dropdownContainer.appendChild(dropdownMenu);

  const parentElement = document.getElementById(parentId);
  if (parentElement) {
    parentElement.appendChild(dropdownContainer);
  }

  return dropdownContainer;
}

function addCommandButtons() {
  const commandHub = document.getElementById("commandHub");
  if (!commandHub) return;

  createDropdownMenu([
    { label: "Marketing Ads", action: "generateMarketingAds", tooltip: "Generate marketing ads", payload: { type: "ads" } },
    { label: "Ad Campaigns", action: "generateAdCampaigns", tooltip: "Generate ad campaigns", payload: { type: "campaigns" } },
    { label: "Cold Emails", action: "generateColdEmails", tooltip: "Generate cold emails", payload: { type: "coldEmails" } },
  ], "marketingDropdownContainer");
}

async function loadDashboard() {
  const response = await fetch("/api/dashboard");
  const data = await response.json();

  const statsRow = document.getElementById("statsRow");
  const taskList = document.getElementById("taskList");
  const modelList = document.getElementById("modelList");
  const serviceList = document.getElementById("serviceList");
  const activityFeed = document.getElementById("activityFeed");
  const projectList = document.getElementById("projectList");
  const historyList = document.getElementById("historyList");
  const ideaList = document.getElementById("ideaList");
  const meetingList = document.getElementById("meetingList");
  const summaryList = document.getElementById("summaryList");
  const milestoneList = document.getElementById("milestoneList");
  const noteList = document.getElementById("noteList");
  const lastSync = document.getElementById("lastSync");

  if (lastSync) {
    lastSync.textContent = data.lastSync || "now";
  }

  statsRow.innerHTML = [
    { label: "CPU", value: data.system.cpu, tone: "teal" },
    { label: "RAM", value: data.system.ram, tone: "pink" },
    { label: "DISK", value: data.system.disk, tone: "violet" },
    { label: "NPU", value: data.system.npu, tone: "green" },
  ]
    .map(
      (item) => `
    <div class="stat-card">
      <strong class="${item.tone}-text">${item.value}%</strong>
      <span>${item.label}</span>
    </div>
  `,
    )
    .join("");

  const tasks =
    data.tasks && data.tasks.length
      ? data.tasks
      : [
          { message: "AI queue synced", status: "ready" },
          { message: "Deploy preview ready", status: "ready" },
          { message: "Local model warmed", status: "ready" },
        ];

  taskList.innerHTML = tasks
    .map((task) => {
      const title = task.title || task.message || task.type || "Task";
      const owner = task.owner || "AI Team";
      const progress = task.progress ?? 0;
      const status = task.status || "ready";
      const time = task.updatedAt
        ? new Date(task.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : task.createdAt
          ? new Date(task.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "live";

      return `
    <li class="task-item" data-detail-title="${title}" data-detail-badge="Task" data-detail-meta="${owner} • ${progress}% • ${time}" data-detail-body="${title} is currently ${status}. This item should stay visible in the active queue until it is reviewed or completed." data-detail-list="${status}, ${owner}, ${progress}% complete">
      <div class="task-item-main">
        <strong>${title}</strong>
        <small>${owner} • ${progress}% • ${time}</small>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="task-state ${status === "error" ? "error" : ""}">${status}</span>
        ${task.id ? `<button data-task-id="${task.id}" class="mini-complete">Complete</button>` : ""}
      </div>
    </li>
  `;
    })
    .join("");

  taskList.querySelectorAll(".task-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      setDetailView({
        title: item.dataset.detailTitle,
        badge: item.dataset.detailBadge,
        meta: item.dataset.detailMeta.split(" • ").filter(Boolean),
        body: item.dataset.detailBody,
        list: item.dataset.detailList.split(", ").filter(Boolean),
      });
    });
  });

  document.querySelectorAll(".mini-complete").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      if (!taskId) return;
      await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      await loadDashboard();
    });
  });

  modelList.innerHTML = [
    "Gemini",
    "Local LLM",
    "Phi-3",
    "Llama 3.1 3B",
    "Gemma 2B",
  ]
    .map(
      (model, index) =>
        `<span class="chip ${index === 0 ? "active" : ""}">${model}</span>`,
    )
    .join("");

  serviceList.innerHTML = (data.services || [])
    .map(
      (service) => `
    <div class="service-item">
      <div>
        <strong>${service.name}</strong>
        <small>${service.details}</small>
      </div>
      <span class="service-dot ${service.status === "healthy" || service.status === "online" ? "" : "alert"}"></span>
    </div>
  `,
    )
    .join("");

  activityFeed.innerHTML = (data.logs || [])
    .map(
      (log) => `
    <div class="activity-item">
      <div>
        <strong>${log}</strong>
        <small>updated just now</small>
      </div>
    </div>
  `,
    )
    .join("");

  projectList.innerHTML = (data.projects || [])
    .map(
      (project) => `
    <div class="project-card">
      <div>
        <strong>${project.name}</strong>
        <small>${project.branch} • ${project.status}</small>
      </div>
      <button>${project.action}</button>
    </div>
  `,
    )
    .join("");

  historyList.innerHTML = (data.completedHistory || [])
    .map(
      (item) => `
    <div class="history-item">
      <div>
        <strong>${item.title}</strong>
        <small>${item.owner} • ${item.result}</small>
      </div>
      <small>${new Date(item.completedAt).toLocaleDateString()}</small>
    </div>
  `,
    )
    .join("");

  ideaList.innerHTML = (data.brainstormIdeas || [])
    .map(
      (idea) => `
    <div class="idea-item" data-detail-title="${idea.title}" data-detail-badge="Idea" data-detail-meta="${idea.category} • ${idea.owner}" data-detail-body="${idea.description}" data-detail-list="${idea.category}, ${idea.owner}, ideation">
      <div>
        <strong>${idea.title}</strong>
        <small>${idea.category} • ${idea.owner}</small>
      </div>
      <small>${idea.description}</small>
    </div>
  `,
    )
    .join("");

  ideaList.querySelectorAll(".idea-item").forEach((item) => {
    item.addEventListener("click", () => {
      setDetailView({
        title: item.dataset.detailTitle,
        badge: item.dataset.detailBadge,
        meta: item.dataset.detailMeta.split(" • ").filter(Boolean),
        body: item.dataset.detailBody,
        list: item.dataset.detailList.split(", ").filter(Boolean),
      });
    });
  });

  meetingList.innerHTML = (data.meetingAgenda || [])
    .map(
      (meeting) => `
    <div class="meeting-item" data-detail-title="${meeting.title}" data-detail-badge="Meeting" data-detail-meta="${meeting.owner} • ${meeting.time}" data-detail-body="${(meeting.agenda || []).join(" • ")}" data-detail-list="${(meeting.agenda || []).join(", ")}">
      <div>
        <strong>${meeting.title}</strong>
        <small>${meeting.owner} • ${meeting.time}</small>
      </div>
      <small>${(meeting.agenda || []).join(" • ")}</small>
      <button class="mini-summary" data-title="${meeting.title}" data-owner="${meeting.owner}" data-agenda="${(meeting.agenda || []).join("||")}" type="button">Generate notes</button>
    </div>
  `,
    )
    .join("");

  meetingList.querySelectorAll(".meeting-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      setDetailView({
        title: item.dataset.detailTitle,
        badge: item.dataset.detailBadge,
        meta: item.dataset.detailMeta.split(" • ").filter(Boolean),
        body: item.dataset.detailBody,
        list: item.dataset.detailList.split(", ").filter(Boolean),
      });
    });
  });

  summaryList.innerHTML = (data.aiSummaries || [])
    .map(
      (summary) => `
    <div class="summary-item" data-detail-title="${summary.title}" data-detail-badge="Summary" data-detail-meta="${summary.owner || "AI Team"}" data-detail-body="${summary.summary}" data-detail-list="AI brief, team view, actions">
      <div>
        <strong>${summary.title}</strong>
        <small>${summary.owner || "AI Team"}</small>
      </div>
      <small>${summary.summary}</small>
    </div>
  `,
    )
    .join("");

  summaryList.querySelectorAll(".summary-item").forEach((item) => {
    item.addEventListener("click", () => {
      setDetailView({
        title: item.dataset.detailTitle,
        badge: item.dataset.detailBadge,
        meta: item.dataset.detailMeta.split(" • ").filter(Boolean),
        body: item.dataset.detailBody,
        list: item.dataset.detailList.split(", ").filter(Boolean),
      });
    });
  });

  if (milestoneList) {
    milestoneList.innerHTML = (data.projectMilestones || [])
      .map(
        (item) => `
      <div class="summary-item">
        <div>
          <strong>${item.title}</strong>
          <small>${item.owner} • ${item.due}</small>
        </div>
        <small>${item.status}</small>
      </div>
    `,
      )
      .join("");
  }

  if (noteList) {
    noteList.innerHTML = (data.meetingNotes || [])
      .map(
        (item) => `
      <div class="summary-item">
        <div>
          <strong>${item.title}</strong>
          <small>${item.owner}</small>
        </div>
        <small>${item.note}</small>
      </div>
    `,
      )
      .join("");
  }

  document.querySelectorAll(".mini-summary").forEach((button) => {
    button.addEventListener("click", async () => {
      const payload = {
        title: button.dataset.title,
        owner: button.dataset.owner,
        agenda: String(button.dataset.agenda || "")
          .split("||")
          .filter(Boolean),
      };

      const response = await fetch("/api/meetings/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.ok) {
        await fetch("/api/summary", { method: "POST" });
        await loadDashboard();
      }
    });
  });
}

async function triggerAction(action, payload) {
  const response = await fetch("/api/agent/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: { action, payload } }),
  });

  const result = await response.json();
  if (result.ok) {
    await loadDashboard();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadDashboard();
  addCommandButtons();

  // Add event listeners for Command Hub buttons
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      if (action) {
        const type = action.replace('generate', '').toLowerCase();
        fetch("/api/agent/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: { action, payload: { type } } }),
        })
        .then(response => response.json())
        .then(result => {
          if (result.ok) {
            loadDashboard();
          }
        });
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (event) => {
    const dropdownMenus = document.querySelectorAll(".dropdown-menu");
    dropdownMenus.forEach((menu) => {
      if (!menu.contains(event.target) && !event.target.closest(".dropdown-button")) {
        menu.style.display = "none";
      }
    });
  });
});
