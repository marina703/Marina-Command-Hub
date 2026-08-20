const fs = require("fs");
const path = require("path");
const { askLLM, processInstruction } = require("./agent");
const { addTaskLog, createTask, addIdea } = require("./dashboard-state");

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

ensureFile(path.join(__dirname, "voice.txt"));
ensureFile(path.join(__dirname, "incoming.txt"));

async function handleVoiceInput(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return;

  console.log("Processing Voice Input:", text);
  addTaskLog("voice", `Voice prompt received: "${text.slice(0, 80)}"`);

  // Detect intention: Task vs Idea vs Autonomous execution
  if (/^(idea|brainstorm|revenue|stream):/i.test(text)) {
    const title = text
      .replace(/^(idea|brainstorm|revenue|stream):\s*/i, "")
      .trim();
    addIdea({
      title,
      category: "Growth",
      owner: "Voice Dictation",
      description: "Captured directly via voice listener.",
    });
    console.log("Saved Voice Idea:", title);
  } else if (/^(task|assign|todo):/i.test(text)) {
    const title = text.replace(/^(task|assign|todo):\s*/i, "").trim();
    createTask({
      title,
      owner: "Voice Dictation",
      priority: "High",
      status: "queued",
      progress: 10,
    });
    console.log("Queued Voice Task:", title);
  } else {
    // Forward to incoming.txt for agent loop and execute
    fs.writeFileSync(path.join(__dirname, "incoming.txt"), text);
    try {
      const instructions = await askLLM(text);
      if (Array.isArray(instructions)) {
        for (const inst of instructions) {
          await processInstruction(inst);
          addTaskLog(inst.action, `Voice action executed: ${inst.action}`, {
            payload: inst.payload,
          });
        }
      }
    } catch (err) {
      console.error("Voice processing error:", err.message);
    }
  }
}

let watcher = null;
function startVoiceWatcher() {
  if (watcher) return;
  let isReading = false;
  watcher = fs.watch(path.join(__dirname, "voice.txt"), async () => {
    if (isReading) return;
    isReading = true;
    setTimeout(async () => {
      try {
        const text = fs
          .readFileSync(path.join(__dirname, "voice.txt"), "utf8")
          .trim();
        if (text) {
          fs.writeFileSync(path.join(__dirname, "voice.txt"), ""); // clear buffer
          await handleVoiceInput(text);
        }
      } catch (err) {
        console.error("Listener watch error:", err.message);
      } finally {
        isReading = false;
      }
    }, 100);
  });
  console.log("Voice Listener Active with Command Center Integration...");
}

if (require.main === module) {
  startVoiceWatcher();
}

module.exports = {
  handleVoiceInput,
  startVoiceWatcher,
};
