import { useState } from "react";
import { Send, Mic, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, Button, Input } from "@/components/ui";
import { sendChat } from "@/lib/api";

export interface ChatMessage {
  id: string;
  type: "user" | "system";
  text: string;
}

export interface AssistantConsoleProps {
  onMessage: (message: ChatMessage) => void;
  onRefresh: () => void;
}

const PLAYBOOKS = [
  { value: "idea-to-roadmap", label: "🤖 Idea → Execution Map (Ava + Maya + Niko)" },
  { value: "site-audit", label: "🌐 Multi-Site Growth & Health Audit" },
  { value: "fast-sop", label: "📝 Fast SOP & Docs Generator" },
];

const QUICK_PROMPTS = [
  "💡 5 Execution Ideas",
  "🗺️ 10 Business Proposals & Map",
  "🎯 Strategy Brief",
  "🛠️ Generate Code/File",
  "📊 Audit Sites (Ignitix & PyroPrep)",
];

/** AI Assistant console with chat composer, playbook runner, and quick prompts. */
export function AssistantConsole({ onMessage, onRefresh }: AssistantConsoleProps) {
  const [prompt, setPrompt] = useState("");
  const [autonomous, setAutonomous] = useState(true);
  const [playbook, setPlaybook] = useState(PLAYBOOKS[0].value);
  const [sending, setSending] = useState(false);

  const handleSend = async (text?: string) => {
    const message = text ?? prompt;
    if (!message.trim() || sending) return;

    onMessage({ id: `user-${Date.now()}`, type: "user", text: message });
    setPrompt("");
    setSending(true);

    try {
      const res = await sendChat(message, autonomous);
      onMessage({
        id: `sys-${Date.now()}`,
        type: "system",
        text: res.reply || "Task processed.",
      });
      toast.success("Task processed successfully");
      onRefresh();
    } catch (err) {
      onMessage({
        id: `err-${Date.now()}`,
        type: "system",
        text: `Error: ${err instanceof Error ? err.message : "Failed to process prompt."}`,
      });
      toast.error(err instanceof Error ? err.message : "Failed to process prompt.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex flex-col p-4">
      <CardHeader
        eyebrow="AI AUTONOMY"
        title="Assistant Console"
        description="Chat with your autonomous AI team (Ava, Maya, Niko)."
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={autonomous}
              onChange={(e) => setAutonomous(e.target.checked)}
              className="accent-accent-primary"
            />
            Autonomous Mode
          </label>
        }
      />

      {/* Playbook bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-muted bg-white/2 p-2.5">
        <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-accent-primary">
          <Zap className="h-3.5 w-3.5" /> Playbook:
        </span>
        <select
          value={playbook}
          onChange={(e) => setPlaybook(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-border-muted bg-surface-3 px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent-primary"
        >
          {PLAYBOOKS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={() => handleSend(`Run playbook: ${playbook}`)}>
          Run Playbook
        </Button>
      </div>

      {/* Quick prompts */}
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((label) => (
          <button
            key={label}
            onClick={() => handleSend(label)}
            className="rounded-lg border border-border-muted bg-white/2 px-2.5 py-1.5 text-xs text-text-primary transition-all hover:-translate-y-px hover:border-accent-primary/40 hover:shadow-glow-primary"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="mt-auto flex items-center gap-2">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Give a task or ask a question…"
          className="flex-1"
        />
        <Button variant="ghost" size="icon" title="Dictate" aria-label="Dictate">
          <Mic className="h-4 w-4" />
        </Button>
        <Button variant="primary" onClick={() => handleSend()} loading={sending}>
          <Send className="h-4 w-4" />
          Send
        </Button>
      </div>
    </Card>
  );
}
